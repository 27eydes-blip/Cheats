import type { Metadata } from "next";
import { Screen } from "@/components/screen";
import { LibraryScreen } from "./library-screen";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <Screen wide>
      <LibraryScreen />
    </Screen>
  );
}
