// The Tapo cloud fallback, with a fake fetch (no network). Fake test credentials only.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { _resetCloudForTests, cloudDevice, cloudPlugs, cloudToken } from "../server/plugs/cloud.js";

const EMAIL = "cloud-tester@example.com";
const PASSWORD = "fake-cloud-password-789";

/** A fake Tapo cloud: records what was asked (method, host), answers like the real one. */
function fakeCloud({ password = PASSWORD, offline = false, hang = false } = {}) {
  const seen = [];
  const state = { on: false };
  const fetchImpl = async (url, init) => {
    if (hang) {
      return new Promise((_, rej) => {
        const keep = setTimeout(() => {}, 5000); // a real hung request keeps the loop busy too
        init.signal.addEventListener("abort", () => (clearTimeout(keep), rej(Object.assign(new Error("aborted"), { name: "TimeoutError" }))));
      });
    }
    const body = JSON.parse(init.body);
    seen.push({ host: new URL(url).host, method: body.method, token: new URL(url).searchParams.get("token") });
    const reply = (o) => ({ status: 200, json: async () => o });
    if (body.method === "login") return reply(body.params.cloudPassword === password ? { error_code: 0, result: { token: "tok-123" } } : { error_code: -20601, msg: "Incorrect email or password" });
    if (body.method === "getDeviceList") return reply({ error_code: 0, result: { deviceList: [{ deviceId: "dev-fan", alias: Buffer.from("Fan").toString("base64"), deviceMac: "E4FAC4000001", deviceModel: "P110", deviceType: "SMART.TAPOPLUG", appServerUrl: "https://use1-wap.tplinkcloud.com", status: 1 }, { deviceId: "cam", alias: "Q2Ft", deviceType: "SMART.IPCAMERA" }] } });
    if (body.method === "passthrough") {
      if (offline) return reply({ error_code: -20571, msg: "Device is offline" });
      const req = JSON.parse(body.params.requestData);
      if (req.method === "set_device_info") state.on = req.params.device_on;
      return reply({ error_code: 0, result: { responseData: { error_code: 0, result: req.method === "get_device_info" ? { device_on: state.on, nickname: Buffer.from("Fan").toString("base64") } : {} } } });
    }
    return reply({ error_code: -1 });
  };
  return { fetchImpl, seen, state };
}

beforeEach(() => _resetCloudForTests());

test("cloud: login once, list only plugs (names decoded, MACs normalized), control through passthrough", async () => {
  const c = fakeCloud();
  const opts = { email: EMAIL, password: PASSWORD, fetchImpl: c.fetchImpl, timeoutMs: 2000 };
  const list = await cloudPlugs(opts);
  assert.deepEqual(list, [{ name: "Fan", mac: "e4:fa:c4:00:00:01", model: "P110", deviceId: "dev-fan", appServerUrl: "https://use1-wap.tplinkcloud.com", online: true }]);
  const dev = cloudDevice(list[0], opts);
  assert.equal(dev.protocol, "cloud");
  await dev.turnOn();
  assert.equal(c.state.on, true);
  assert.deepEqual(await dev.getDeviceInfo().then((i) => [i.device_on, i.nickname]), [true, "Fan"]);
  assert.equal(c.seen.filter((x) => x.method === "login").length, 1, "the token is reused");
  assert.ok(c.seen.filter((x) => x.method === "passthrough").every((x) => x.host === "use1-wap.tplinkcloud.com" && x.token === "tok-123"));
});

test("cloud: a wrong password, an offline plug and no answer each fail with a plain message (no secrets)", async () => {
  const wrong = fakeCloud({ password: "something-else" });
  await assert.rejects(cloudToken({ email: EMAIL, password: PASSWORD, fetchImpl: wrong.fetchImpl }), (err) => err.code === "auth" && err.cloudCode === -20601 && !err.message.includes(PASSWORD));
  assert.equal(wrong.seen.length, 1, "a wrong password isn't retried on the other host");
  _resetCloudForTests();
  const off = fakeCloud({ offline: true });
  const opts = { email: EMAIL, password: PASSWORD, fetchImpl: off.fetchImpl, timeoutMs: 2000 };
  await assert.rejects(cloudDevice({ deviceId: "dev-fan", name: "Fan" }, opts).turnOn(), (err) => err.code === "offline");
  _resetCloudForTests();
  const slow = fakeCloud({ hang: true });
  await assert.rejects(cloudToken({ email: EMAIL, password: PASSWORD, fetchImpl: slow.fetchImpl, timeoutMs: 50 }), (err) => err.code === "unreachable" && /didn't answer in time/.test(err.message));
});
