import type { Metadata } from "next";
import { Screen } from "@/components/screen";
import { NoteScreen } from "./note-screen";

export const metadata: Metadata = { title: "Check your notes" };

export default function NotePage() {
  return (
    <Screen wide>
      <NoteScreen />
    </Screen>
  );
}
