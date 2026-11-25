// Finding the LG TVs on the home network: which addresses have port 3001 open, a device's MAC
// address from the ARP table, and the Wake-on-LAN packet that turns a TV on.
import dgram from "node:dgram";
import { execFile } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import { isLocalAddress } from "../roku/ecp.js";

/** The /24 networks this PC is on (home networks only), e.g. ["192.168.4"]. */
export function localSubnets(ifaces = os.networkInterfaces()) {
  const out = new Set();
  for (const list of Object.values(ifaces)) {
    for (const a of list || []) {
      if (a.family !== "IPv4" && a.family !== 4) continue;
      if (a.internal || !isLocalAddress(a.address) || a.address.startsWith("169.254.")) continue;
      out.add(a.address.split(".").slice(0, 3).join("."));
    }
  }
  return [...out];
}

/** Is a TCP port open? (connect with a short timeout) */
export function portOpen(ip, port, timeoutMs = 400) {
  return new Promise((resolve) => {
    const s = net.connect({ host: ip, port });
    const done = (ok) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(timeoutMs, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

/** Every address on the local /24s with `port` open, 32 at a time. */
export async function scanSubnets(port = 3001, { subnets = localSubnets(), probe = portOpen, concurrency = 32 } = {}) {
  const ips = subnets.flatMap((s) => Array.from({ length: 254 }, (_, i) => `${s}.${i + 1}`));
  const found = [];
  let next = 0;
  const worker = async () => {
    while (next < ips.length) {
      const ip = ips[next++];
      if (await probe(ip, port)) found.push(ip);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ips.length) }, worker));
  return found.sort((a, b) => Number(a.split(".")[3]) - Number(b.split(".")[3]));
}

// macOS prints "a4:36:c7:1:2:3" (no leading zeros), Windows "a4-36-c7-01-02-03"
const MAC_RE = /(?<![0-9a-f:-])([0-9a-f]{1,2})[:-]([0-9a-f]{1,2})[:-]([0-9a-f]{1,2})[:-]([0-9a-f]{1,2})[:-]([0-9a-f]{1,2})[:-]([0-9a-f]{1,2})(?![0-9a-f:-])/i;
export function normalizeMac(s) {
  const m = MAC_RE.exec(String(s || ""));
  return m ? m.slice(1).map((x) => x.padStart(2, "0")).join(":").toLowerCase() : "";
}

/** "ip -> mac" from the ARP table text of Windows (arp -a), macOS (arp -an) or Linux (/proc/net/arp). */
export function parseArp(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const ip = /(?:^|[\s(])(\d{1,3}(?:\.\d{1,3}){3})(?:[\s)]|$)/.exec(line)?.[1];
    const mac = normalizeMac(line);
    if (ip && mac && mac !== "00:00:00:00:00:00" && mac !== "ff:ff:ff:ff:ff:ff") out[ip] = mac;
  }
  return out;
}

/** The ARP table as { ip: mac }. Fixed commands only; nothing from the user goes on a command line. */
export function arpTable() {
  if (process.platform === "linux") {
    try {
      return Promise.resolve(parseArp(fs.readFileSync("/proc/net/arp", "utf8")));
    } catch {
      /* fall through to the arp command */
    }
  }
  const args = process.platform === "win32" ? ["-a"] : ["-an"];
  return new Promise((resolve) => {
    execFile("arp", args, { timeout: 5000, windowsHide: true }, (err, stdout) => resolve(err ? {} : parseArp(stdout)));
  });
}

export async function arpMac(ip) {
  return (await arpTable())[ip] || "";
}

/** The Wake-on-LAN magic packet: six 0xFF bytes, then the MAC sixteen times. */
export function magicPacket(mac) {
  const hex = normalizeMac(mac).replace(/:/g, "");
  if (hex.length !== 12) throw new Error("That isn't a MAC address.");
  const m = Buffer.from(hex, "hex");
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => m)]);
}

/** Sends the magic packet to the broadcast address(es), a few times (UDP can drop one). */
export function sendWol(mac, { ip = "", repeats = 3 } = {}) {
  const packet = magicPacket(mac);
  const targets = new Set(["255.255.255.255"]);
  if (isLocalAddress(ip)) targets.add(`${ip.split(".").slice(0, 3).join(".")}.255`);
  return new Promise((resolve) => {
    const sock = dgram.createSocket("udp4");
    sock.once("error", () => (sock.close(), resolve(false)));
    sock.bind(() => {
      sock.setBroadcast(true);
      let left = targets.size * repeats;
      const sent = () => --left === 0 && (sock.close(), resolve(true));
      for (let r = 0; r < repeats; r++) for (const t of targets) for (const port of [9]) sock.send(packet, port, t, sent);
    });
  });
}
