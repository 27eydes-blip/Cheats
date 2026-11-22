import { cookies } from "next/headers";
import { validTz } from "./time";

/** The reader's time zone (from the `tz` cookie the browser sets), or US Eastern until it's known. */
export async function viewerTz() {
  return validTz((await cookies()).get("tz")?.value ? decodeURIComponent((await cookies()).get("tz")!.value) : null);
}
