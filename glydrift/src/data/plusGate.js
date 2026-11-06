// DRIFT PASS+ ownership gate (no imports beyond the save, so every data module can use it).
//
// A Pass+ reward only counts while its season's Drift Pass+ is a server-verified purchase on
// this device (Save.passPlus[season].verified — written only by the store after the server's
// verify-purchase answer, and cleared again when the signed-in account's verified purchases
// on the server don't include it). Editing local storage to "own" a Pass+ trail, title or
// hero therefore shows nothing; the leaderboard server separately strips Pass+ titles, heroes,
// the gold name and the season badge from anyone without a verified purchase.
import { Save } from "./save.js";

/** Season of a Pass+ item: `plus: true` (the first Pass+ items) means Season 1. */
export const plusSeasonOf = (x) => (x?.plus === true ? "s1" : x?.plus || x?.passPlus || null);

/** Is this season's Drift Pass+ a verified purchase here? */
export function plusEntitled(seasonId = "s1") {
  return !!seasonId && !!Save.data?.passPlus?.[seasonId]?.verified;
}

/** True unless `x` is a Pass+ item whose season isn't verified. */
export function plusAllowed(x) {
  const season = plusSeasonOf(x);
  return !season || plusEntitled(season);
}
