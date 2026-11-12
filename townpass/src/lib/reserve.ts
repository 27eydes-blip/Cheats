/** Reservation links: which booking service a URL belongs to, and validation. */

const PLATFORMS: [RegExp, string][] = [
  [/(^|\.)resy\.com$/, "Resy"],
  [/(^|\.)opentable\.com$/, "OpenTable"],
  [/(^|\.)exploretock\.com$/, "Tock"],
  [/(^|\.)sevenrooms\.com$/, "SevenRooms"],
  [/(^|\.)yelp\.com$/, "Yelp"],
];

/** "Resy", "OpenTable", … or null for a restaurant's own website. */
export function reservePlatform(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PLATFORMS.find(([re]) => re.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}

export function reserveLabel(url: string): string {
  const p = reservePlatform(url);
  return p ? `Reserve on ${p}` : "Reserve a table";
}

/** Returns an error message, or null if the link is empty or a valid https URL. */
export function validateReserveUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return "Reservation link must start with https://";
    return null;
  } catch {
    return "Reservation link isn't a valid web address (copy it from the browser bar)";
  }
}

/** Sections whose listings can carry a reservation link. */
export const RESERVABLE = new Set(["food", "nightlife"]);
