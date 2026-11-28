// DualSense extras over WebHID: adaptive triggers, rumble motors and the light
// bar. Chrome/Edge only, behind the "DualSense extras" toggle. Every call is
// wrapped so a refusing device or browser can never break the game. Where
// WebHID is missing we fall back to the Gamepad API's standard vibration.
//
// Output report layout follows the community-documented DualSense format
// (USB report 0x02, Bluetooth report 0x31 with a CRC32 trailer). NOT tested
// on real hardware here — see PROGRESS.md known gaps.

const SONY = 0x054c, PIDS = [0x0ce6, 0x0df2]; // DualSense, DualSense Edge
const MODE = { off: 0x00, resist: 0x01, section: 0x02, click: 0x02 };

let CRC_T = null;
function crc32(bytes, seed = 0xffffffff) {
  if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
  let c = seed;
  for (const b of bytes) c = CRC_T[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// encode a normalised trigger effect into the 11 bytes the controller wants
export function encodeTrigger(e) {
  const out = new Uint8Array(11);
  if (!e || e.mode === 'off') return out;
  const b = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  out[0] = MODE[e.mode] ?? 0;
  if (e.mode === 'resist') { out[1] = b(e.start ?? 0); out[2] = b(e.force ?? 0.5); }
  else { out[1] = b(e.start ?? 0.2); out[2] = b(e.end ?? (e.start ?? 0.2) + 0.1); out[3] = b(e.force ?? 0.8); }
  return out;
}

export class DualSense {
  constructor() {
    this.supported = typeof navigator !== 'undefined' && 'hid' in navigator;
    this.device = null; this.bt = false; this.seq = 0;
    this.state = { motorL: 0, motorR: 0, lt: null, rt: null, rgb: [0, 30, 90], bright: 1 };
    this.dirty = true; this.lastSend = 0; this.error = '';
  }
  get connected() { return !!this.device?.opened; }
  status() {
    if (!this.supported) return 'WebHID is not available in this browser (Chrome or Edge on desktop only). Using standard vibration where the browser supports it; adaptive triggers and light bar are off.';
    if (this.connected) return `DualSense linked over ${this.bt ? 'Bluetooth' : 'USB'} — adaptive triggers, motors and light bar active.`;
    return this.error || 'WebHID available. Choose “Link DualSense” and pick the controller to enable adaptive triggers and the light bar.';
  }
  // must run from a user gesture (a mouse click; a pad button may not count as one)
  async request() {
    if (!this.supported) return false;
    try {
      const list = await navigator.hid.requestDevice({ filters: PIDS.map((productId) => ({ vendorId: SONY, productId })) });
      return await this.open(list[0]);
    } catch (e) { this.error = 'Could not link the DualSense: ' + (e?.message || e); return false; }
  }
  // reconnect to a controller the user already granted, without a prompt
  async restore() {
    if (!this.supported) return false;
    try { const list = await navigator.hid.getDevices(); const d = list.find((x) => x.vendorId === SONY && PIDS.includes(x.productId)); return d ? await this.open(d) : false; }
    catch { return false; }
  }
  async open(d) {
    if (!d) return false;
    try {
      if (!d.opened) await d.open();
      this.device = d;
      this.bt = !!d.collections?.some((c) => c.inputReports?.some((r) => r.reportId === 0x31));
      this.dirty = true; this.error = '';
      return true;
    } catch (e) { this.error = 'The controller refused the connection: ' + (e?.message || e); this.device = null; return false; }
  }
  close() { try { this.reset(); this.flush(true); this.device?.close(); } catch { /* ignore */ } this.device = null; }

  set(patch) { Object.assign(this.state, patch); this.dirty = true; }
  reset() { this.set({ motorL: 0, motorR: 0, lt: null, rt: null }); }

  // build the 47-byte common block
  common() {
    const s = this.state, c = new Uint8Array(47);
    c[0] = 0x01 | 0x02 | 0x04 | 0x08;          // rumble, haptics select, right + left trigger effects valid
    c[1] = 0x04 | 0x10;                         // light bar + player LEDs valid; mic LED untouched; speaker never enabled
    c[2] = Math.round(Math.max(0, Math.min(1, s.motorR)) * 255);
    c[3] = Math.round(Math.max(0, Math.min(1, s.motorL)) * 255);
    c.set(encodeTrigger(s.rt), 10);
    c.set(encodeTrigger(s.lt), 21);
    c[38] = 0x02;                               // light bar setup valid
    c[41] = 0x02; c[42] = 0x00; c[43] = 0x04;   // fade in, full brightness, centre player light
    const k = Math.max(0, Math.min(1, s.bright));
    c[44] = Math.round(s.rgb[0] * k); c[45] = Math.round(s.rgb[1] * k); c[46] = Math.round(s.rgb[2] * k);
    return c;
  }
  // throttled to ~30 Hz and only when something changed
  flush(force) {
    if (!this.connected || (!this.dirty && !force)) return;
    const now = performance.now();
    if (!force && now - this.lastSend < 33) return;
    this.lastSend = now; this.dirty = false;
    try {
      const c = this.common();
      if (!this.bt) { this.device.sendReport(0x02, c).catch((e) => { this.error = String(e?.message || e); }); return; }
      const r = new Uint8Array(77);
      r[0] = (this.seq = (this.seq + 1) & 0x0f) << 4; r[1] = 0x10; r.set(c, 2);
      const crc = crc32(new Uint8Array([0xa2, 0x31, ...r.subarray(0, 73)]));
      r[73] = crc & 0xff; r[74] = (crc >>> 8) & 0xff; r[75] = (crc >>> 16) & 0xff; r[76] = (crc >>> 24) & 0xff;
      this.device.sendReport(0x31, r).catch((e) => { this.error = String(e?.message || e); });
    } catch (e) { this.error = String(e?.message || e); }
  }
}
