// Small P-256 (secp256r1) point arithmetic with BigInt, for the SPAKE2+ login of TPAP.
// node:crypto does ECDH and signatures on P-256, but not the raw point addition and
// multiplication that SPAKE2+ needs (G*x + M*w0, (Y - N*w0)*x), so it's done here.
// Correctness is checked against the RFC 9383 test vectors (test/plugs-tpap.test.js).
// Not constant-time: it runs on this PC, with values that are new for every login.

export const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
export const A = P - 3n;
export const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
export const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n; // the group order
export const G = { x: 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n, y: 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n };
export const INFINITY = null;

const mod = (a, m = P) => {
  const r = a % m;
  return r < 0n ? r + m : r;
};
function powmod(b, e, m) {
  let r = 1n;
  b = mod(b, m);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}
const inv = (a) => powmod(a, P - 2n, P);

export function isOnCurve(pt) {
  if (!pt) return false;
  const { x, y } = pt;
  if (x < 0n || x >= P || y < 0n || y >= P) return false;
  return mod(y * y - (x * x * x + A * x + B)) === 0n;
}

export function neg(pt) {
  return pt ? { x: pt.x, y: mod(-pt.y) } : null;
}

export function add(p1, p2) {
  if (!p1) return p2;
  if (!p2) return p1;
  if (p1.x === p2.x) {
    if (mod(p1.y + p2.y) === 0n) return null;
    return double(p1);
  }
  const l = mod((p2.y - p1.y) * inv(p2.x - p1.x));
  const x = mod(l * l - p1.x - p2.x);
  return { x, y: mod(l * (p1.x - x) - p1.y) };
}

export function double(pt) {
  if (!pt || pt.y === 0n) return null;
  const l = mod((3n * pt.x * pt.x + A) * inv(2n * pt.y));
  const x = mod(l * l - 2n * pt.x);
  return { x, y: mod(l * (pt.x - x) - pt.y) };
}

/** k * pt, k reduced mod the group order (Jacobian coordinates, double-and-add). */
export function mul(pt, k) {
  k = mod(k, N);
  if (!pt || k === 0n) return null;
  // Jacobian: (X, Y, Z) = (x Z^2, y Z^3)
  let R = null;
  let Q = [pt.x, pt.y, 1n];
  const jDouble = ([X, Y, Z]) => {
    if (Y === 0n) return null;
    const YY = mod(Y * Y);
    const S = mod(4n * X * YY);
    const ZZ = mod(Z * Z);
    const M = mod(3n * (X - ZZ) * (X + ZZ)); // a = -3
    const X3 = mod(M * M - 2n * S);
    return [X3, mod(M * (S - X3) - 8n * YY * YY), mod(2n * Y * Z)];
  };
  const jAdd = (p1, p2) => {
    if (!p1) return p2;
    if (!p2) return p1;
    const [X1, Y1, Z1] = p1;
    const [X2, Y2, Z2] = p2;
    const Z1Z1 = mod(Z1 * Z1);
    const Z2Z2 = mod(Z2 * Z2);
    const U1 = mod(X1 * Z2Z2);
    const U2 = mod(X2 * Z1Z1);
    const S1 = mod(Y1 * Z2 * Z2Z2);
    const S2 = mod(Y2 * Z1 * Z1Z1);
    if (U1 === U2) return S1 === S2 ? jDouble(p1) : null;
    const H = mod(U2 - U1);
    const R2 = mod(S2 - S1);
    const HH = mod(H * H);
    const HHH = mod(H * HH);
    const V = mod(U1 * HH);
    const X3 = mod(R2 * R2 - HHH - 2n * V);
    return [X3, mod(R2 * (V - X3) - S1 * HHH), mod(Z1 * Z2 * H)];
  };
  for (let i = BigInt(k.toString(2).length - 1); i >= 0n; i--) {
    R = R ? jDouble(R) : null;
    if ((k >> i) & 1n) R = jAdd(R, Q);
  }
  if (!R) return null;
  const zi = inv(R[2]);
  const zi2 = mod(zi * zi);
  return { x: mod(R[0] * zi2), y: mod(R[1] * zi2 * zi) };
}

export const bigFromBytes = (buf) => (buf.length ? BigInt(`0x${Buffer.from(buf).toString("hex")}`) : 0n);
export function bytesFromBig(n, len = 32) {
  const hex = n.toString(16).padStart(len * 2, "0");
  return Buffer.from(hex.slice(-len * 2), "hex");
}

/** SEC1 encoding (uncompressed 0x04 || x || y). */
export function encode(pt) {
  if (!pt) throw new Error("the point at infinity has no encoding");
  return Buffer.concat([Buffer.from([4]), bytesFromBig(pt.x), bytesFromBig(pt.y)]);
}

/** SEC1 decoding (compressed or uncompressed); null if it isn't a point on the curve. */
export function decode(buf) {
  const b = Buffer.from(buf);
  if (b.length === 65 && b[0] === 4) {
    const pt = { x: bigFromBytes(b.subarray(1, 33)), y: bigFromBytes(b.subarray(33)) };
    return isOnCurve(pt) ? pt : null;
  }
  if (b.length === 33 && (b[0] === 2 || b[0] === 3)) {
    const x = bigFromBytes(b.subarray(1));
    if (x >= P) return null;
    const y2 = mod(x * x * x + A * x + B);
    let y = powmod(y2, (P + 1n) / 4n, P); // P = 3 mod 4
    if (mod(y * y) !== y2) return null;
    if ((y & 1n) !== BigInt(b[0] & 1)) y = mod(-y);
    return { x, y };
  }
  return null;
}
