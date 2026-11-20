import { resetDbForTests } from "@/lib/db";
import { createUser } from "@/lib/users";

let n = 0;
export async function makeUser(handle?: string) {
  n++;
  const h = handle ?? `user${n}${Math.floor(Math.random() * 1000)}`;
  return createUser({ email: `${h}@example.com`, password: "a-long-password", handle: h, displayName: `User ${h}`, ageConfirmed: true, acceptTerms: true });
}

export function freshDb() {
  resetDbForTests();
}
