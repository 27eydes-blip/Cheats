import type { Metadata } from "next";
import { Screen } from "@/components/screen";
import { CaptureScreen } from "./capture-screen";

export const metadata: Metadata = { title: "Snap notes" };

export default function CapturePage() {
  return (
    <Screen>
      <CaptureScreen />
    </Screen>
  );
}
