// TP-Link Kasa provider — not implemented yet (no bulbs). Kasa devices are controlled
// over your local network. Easiest route: install python-kasa (`pip install python-kasa`)
// and shell out to `kasa --host <ip> on|off` / `kasa --host <ip> brightness 80`, with a
// room -> IP map in settings.json. Then set "lights.provider": "kasa".
export async function setLight() {
  throw new Error("Kasa lights are not set up yet. See server/tools/lights/kasa.js.");
}
export async function getState() {
  return {};
}
