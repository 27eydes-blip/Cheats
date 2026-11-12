/** Site sponsor. One place to change the sponsor, its artwork and copy. */
export const SPONSOR = {
  id: "glydrift",
  name: "Glydrift",
  url: "https://glydrift.com",
  tagline: "Free one-tap arcade game",
  blurb: "Tap, glide, don’t stop. Eight living realms, no account, plays right in your browser.",
  tiles: ["/sponsor/glydrift-tile-play-free.jpg", "/sponsor/glydrift-tile-tap-glide.jpg", "/sponsor/glydrift-tile-dont-stop.jpg"],
  banners: ["/sponsor/glydrift-neon-void.jpg", "/sponsor/glydrift-solar-storm.jpg", "/sponsor/glydrift-glitch-realm.jpg"],
};

const PLACEMENTS = new Set(["guide-home", "footer", "landing", "admin"]);

/** Tracked outbound link: counts the tap, then sends the visitor to the sponsor with UTM tags. */
export function sponsorHref(placement: string, citySlug?: string) {
  const q = new URLSearchParams({ from: placement });
  if (citySlug) q.set("city", citySlug);
  return `/go/${SPONSOR.id}?${q}`;
}

export function sponsorTarget(placement: string): string {
  const u = new URL(SPONSOR.url);
  u.searchParams.set("utm_source", "coastpassgo");
  u.searchParams.set("utm_medium", "sponsor");
  u.searchParams.set("utm_campaign", PLACEMENTS.has(placement) ? placement : "other");
  return u.toString();
}

export const cleanPlacement = (p: string | null) => (p && PLACEMENTS.has(p) ? p : "other");

/** Rotate artwork daily so repeat visitors see something fresh. */
export function dailyPick<T>(items: T[], salt = 0): T {
  const day = Math.floor(Date.now() / 86_400_000);
  return items[(day + salt) % items.length];
}
