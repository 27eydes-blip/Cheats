import { resetSportsBudget } from "@/lib/sports/budget";
import { resetLane } from "@/lib/sports/livelane";
import { clearBoardCache } from "@/lib/sports/hub";
import { resetDbForTests } from "@/lib/db";
import { createUser } from "@/lib/users";
import { resetTeamsCache } from "@/lib/sports/teams";

let n = 0;
export async function makeUser(handle?: string) {
  n++;
  const h = handle ?? `user${n}${Math.floor(Math.random() * 1000)}`;
  return createUser({ email: `${h}@example.com`, password: "a-long-password", handle: h, displayName: `User ${h}`, ageConfirmed: true, acceptTerms: true });
}

export function freshDb() {
  resetDbForTests();
  resetTeamsCache();
  resetSportsBudget();
  resetLane();
  clearBoardCache();
}
