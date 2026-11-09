import type { Metadata } from "next";
import { Screen } from "@/components/screen";
import { Player } from "./player";

export const metadata: Metadata = { title: "Study" };

export default function PlayPage() {
  return (
    <Screen>
      <Player />
    </Screen>
  );
}
