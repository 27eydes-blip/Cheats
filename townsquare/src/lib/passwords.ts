import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Format: scrypt$N$r$p$salt$hash (base64url). */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 32, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(pw: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    // Spend the same time as a real check so missing accounts can't be detected by timing.
    await scrypt(pw, randomBytes(16), 32, PARAMS);
    return false;
  }
  const [alg, N, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64url");
  const got = await scrypt(pw, Buffer.from(salt, "base64url"), expected.length, { N: +N, r: +r, p: +p, maxmem: PARAMS.maxmem });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(s: string) {
  return createHash("sha256").update(s).digest("base64url");
}
