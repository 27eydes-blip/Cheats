import { cookies } from "next/headers";
import type { D1Database } from "@cloudflare/workers-types";
import { getPurchase, purchaseGrantsAccess, type City, type Purchase } from "./db";
import { signToken, verifyToken } from "./token";

export const accessCookie = (slug: string) => `tp_${slug}`;

interface AccessPayload {
  k: "access";
  p: string; // purchase id
  [key: string]: unknown;
}

/**
 * The token only names a purchase; the purchase row in D1 is the source of
 * truth, so refunds/disputes revoke access instantly even for old links.
 */
export function accessToken(purchaseId: string, secret: string) {
  return signToken({ k: "access", p: purchaseId }, secret);
}

export async function purchaseFromToken(db: D1Database, token: string | undefined, secret: string) {
  const payload = await verifyToken<AccessPayload>(token, secret, "access");
  if (!payload) return null;
  return getPurchase(db, payload.p);
}

/** Returns the purchase granting access to this city for the current visitor, if any. */
export async function currentAccess(db: D1Database, city: City, secret: string): Promise<Purchase | null> {
  const jar = await cookies();
  const p = await purchaseFromToken(db, jar.get(accessCookie(city.slug))?.value, secret);
  return purchaseGrantsAccess(p, city.id) ? p : null;
}

export function cookieMaxAgeSeconds(p: Purchase): number {
  const max = 400 * 24 * 3600; // browsers cap cookie lifetime at 400 days
  if (p.access_expires_at === null) return max;
  return Math.max(60, Math.min(max, Math.floor((p.access_expires_at - Date.now()) / 1000)));
}
