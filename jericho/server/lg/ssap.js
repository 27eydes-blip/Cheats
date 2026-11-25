// A small LG webOS client: SSAP messages over a WebSocket, wss on port 3001 (current firmware)
// with plain ws on 3000 as the fallback for older sets. The TV's certificate is self-signed, so it
// can't be verified; that's only ever allowed for home-network addresses (see isLocalAddress).
import { Agent, WebSocket } from "undici";
import { isLocalAddress } from "../roku/ecp.js";

export class LgError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// What Jericho asks the TV for. The TV shows these on its pairing prompt.
const PERMISSIONS = [
  "LAUNCH", "LAUNCH_WEBAPP", "APP_TO_APP", "CONTROL_AUDIO", "CONTROL_DISPLAY", "CONTROL_INPUT_JOYSTICK", "CONTROL_INPUT_MEDIA_PLAYBACK",
  "CONTROL_INPUT_TV", "CONTROL_POWER", "READ_APP_STATUS", "READ_CURRENT_CHANNEL", "READ_INPUT_DEVICE_LIST", "READ_NETWORK_STATE",
  "READ_RUNNING_APPS", "READ_TV_CURRENT_TIME", "READ_INSTALLED_APPS", "READ_POWER_STATE", "READ_COUNTRY_INFO", "WRITE_NOTIFICATION_TOAST",
  "CONTROL_MOUSE_AND_KEYBOARD", "CONTROL_INPUT_TEXT", "CONTROL_TV_SCREEN", "CONTROL_TV_STANBY", "READ_SETTINGS", "TEST_OPEN", "TEST_PROTECTED",
];
const MANIFEST = { manifestVersion: 1, appVersion: "1.1", signed: { appId: "com.jericho.assistant", vendorId: "com.jericho", created: "20261126", localizedAppNames: { "": "Jericho" }, permissions: PERMISSIONS, serial: "jericho-1" }, permissions: PERMISSIONS, signatures: [{ signatureVersion: 1, signature: "jericho" }] };

let loopbackForTests = false;
/** Tests only: lets a fake TV on 127.0.0.1 stand in for a real one. */
export function _allowLoopbackForTests(on = true) {
  loopbackForTests = on;
}

let insecure = null; // one shared dispatcher for the TVs' self-signed certificates
const tvDispatcher = () => (insecure ||= new Agent({ connect: { rejectUnauthorized: false, timeout: 4000 } }));

/**
 * Connects and registers. With a saved client key the TV accepts silently; without one it shows
 * the pairing prompt and `onPrompt()` is called, then it waits (up to promptTimeoutMs) for "accept".
 * Returns { clientKey, request(uri, payload), close() }.
 */
export async function connectSsap(ip, { clientKey = "", onPrompt = () => {}, timeoutMs = 5000, promptTimeoutMs = 60_000, ports = [3001, 3000] } = {}) {
  if (!isLocalAddress(ip) && !(loopbackForTests && ip === "127.0.0.1")) throw new LgError("That isn't a home-network address.", "not-local");
  let lastErr = null;
  for (const port of ports) {
    try {
      return await open(ip, port, { clientKey, onPrompt, timeoutMs, promptTimeoutMs });
    } catch (err) {
      lastErr = err;
      if (err.code === "rejected" || err.code === "prompt-timeout") throw err; // it's the TV, it just said no
    }
  }
  throw lastErr || new LgError("The TV didn't answer.", "unreachable");
}

function open(ip, port, { clientKey, onPrompt, timeoutMs, promptTimeoutMs }) {
  return new Promise((resolve, reject) => {
    const url = `${port === 3001 ? "wss" : "ws"}://${ip}:${port}`;
    let ws;
    try {
      ws = new WebSocket(url, port === 3001 ? { dispatcher: tvDispatcher() } : undefined);
    } catch (err) {
      reject(new LgError(err.message, "unreachable"));
      return;
    }
    let nextId = 1;
    const pending = new Map();
    let settled = false;
    let timer = setTimeout(() => fail(new LgError("The TV didn't answer.", "unreachable")), timeoutMs);
    const fail = (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
      for (const p of pending.values()) p.reject(err);
      pending.clear();
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    };
    const api = {
      clientKey: clientKey,
      request(uri, payload = {}, ms = 6000) {
        const id = `jericho_${nextId++}`;
        return new Promise((res, rej) => {
          const t = setTimeout(() => (pending.delete(id), rej(new LgError("The TV stopped answering.", "timeout"))), ms);
          pending.set(id, { resolve: (v) => (clearTimeout(t), res(v)), reject: (e) => (clearTimeout(t), rej(e)) });
          ws.send(JSON.stringify({ id, type: "request", uri, payload }));
        });
      },
      close() {
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          /* already closed */
        }
      },
    };
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id: "register_0", type: "register", payload: { forcePairing: false, pairingType: "PROMPT", ...(clientKey ? { "client-key": clientKey } : {}), manifest: MANIFEST } }));
    });
    ws.addEventListener("message", (e) => {
      let msg;
      try {
        msg = JSON.parse(typeof e.data === "string" ? e.data : Buffer.from(e.data).toString("utf8"));
      } catch {
        return;
      }
      if (msg.id === "register_0") {
        if (msg.type === "response" && msg.payload?.pairingType === "PROMPT") {
          // the prompt is on screen: give them time to press accept
          clearTimeout(timer);
          timer = setTimeout(() => fail(new LgError("Nobody accepted the pairing prompt in time.", "prompt-timeout")), promptTimeoutMs);
          onPrompt();
        } else if (msg.type === "registered") {
          clearTimeout(timer);
          api.clientKey = msg.payload?.["client-key"] || clientKey;
          settled = true;
          resolve(api);
        } else if (msg.type === "error") {
          fail(new LgError(/rejected|denied|cancel/i.test(msg.error || "") ? "The pairing prompt was declined." : "The TV refused to connect.", "rejected"));
        }
        return;
      }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.type === "error" || msg.payload?.returnValue === false) p.reject(new LgError(msg.error || msg.payload?.errorText || "The TV said no.", "refused"));
      else p.resolve(msg.payload || {});
    });
    ws.addEventListener("error", () => fail(new LgError("The TV didn't answer.", "unreachable")));
    ws.addEventListener("close", () => fail(new LgError("The TV closed the connection.", "closed")));
  });
}
