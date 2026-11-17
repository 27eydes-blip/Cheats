/* IP address helpers: parsing, public/private classification (SSRF guard) and
   rate-limit subject normalization. */

/* Strict dotted-quad IPv4 -> [a,b,c,d] or null. */
export function parseIPv4(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s));
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

/* IPv6 (any textual form, optional zone id / brackets / embedded IPv4) -> 8 numbers, or null. */
export function parseIPv6(s) {
  let addr = String(s).trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!addr.includes(":")) return null;
  const v4 = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(addr);
  if (v4) {
    const p = parseIPv4(v4[1]);
    if (!p) return null;
    addr = addr.slice(0, v4.index) + ((p[0] << 8) | p[1]).toString(16) + ":" + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

const v4In = (p, base, bits) => {
  const ip = ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
  const b = parseIPv4(base);
  const net = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (net & mask);
};

/* Everything that is not ordinary public internet (RFC 6890 special-purpose + multicast). */
const V4_BLOCKED = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.31.196.0", 24], ["192.52.193.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["192.175.48.0", 24], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function isPublicIPv4(p) {
  return !V4_BLOCKED.some(([base, bits]) => v4In(p, base, bits));
}

function isPublicIPv6(g) {
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64 (64:ff9b::/96): judge the embedded IPv4.
  const embedded = [(g[6] >> 8) & 255, g[6] & 255, (g[7] >> 8) & 255, g[7] & 255];
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return g[5] === 0xffff && isPublicIPv4(embedded);
  }
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPublicIPv4(embedded);
  // Only global unicast 2000::/3 is public...
  if ((g[0] & 0xe000) !== 0x2000) return false;
  // ...minus special-purpose blocks inside it.
  if (g[0] === 0x2001 && g[1] < 0x0200) return false; // 2001::/23 IETF protocol assignments (Teredo, ORCHID...)
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x2002) return false; // 6to4 (can wrap private IPv4)
  if (g[0] === 0x3fff && g[1] < 0x1000) return false; // 3fff::/20 documentation
  return true;
}

/* True only for ordinary public internet addresses. Unparseable input is never public. */
export function isPublicIP(ip) {
  const v4 = parseIPv4(ip);
  if (v4) return isPublicIPv4(v4);
  const v6 = parseIPv6(ip);
  if (v6) return isPublicIPv6(v6);
  return false;
}

export function isIPLiteral(host) {
  return parseIPv4(host) !== null || parseIPv6(host) !== null;
}

/* Turns an IP into the unit we rate-limit on: the IPv4 address, or the /64 network for IPv6
   (one customer usually controls a whole /64). IPv4-mapped IPv6 maps back to IPv4. */
export function rateLimitSubject(ip) {
  const raw = String(ip || "").trim().toLowerCase();
  if (!raw) return "unknown";
  if (parseIPv4(raw)) return raw;
  const g = parseIPv6(raw);
  if (!g) return `bad:${raw}`;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return [(g[6] >> 8) & 255, g[6] & 255, (g[7] >> 8) & 255, g[7] & 255].join(".");
  }
  return `${g.slice(0, 4).map((x) => x.toString(16).padStart(4, "0")).join(":")}::/64`;
}
