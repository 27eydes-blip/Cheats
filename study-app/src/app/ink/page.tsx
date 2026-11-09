import type { Metadata } from "next";
import { Screen } from "@/components/screen";
import { InkScreen } from "./ink-screen";

export const metadata: Metadata = { title: "Write notes" };

export default function InkPage() {
  return (
    <Screen focus>
      <InkScreen />
    </Screen>
  );
}
