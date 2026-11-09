import type { Metadata } from "next";
import { Screen } from "@/components/screen";
import { QuizEditor } from "./quiz-editor";

export const metadata: Metadata = { title: "Quiz" };

export default function QuizPage() {
  return (
    <Screen>
      <QuizEditor />
    </Screen>
  );
}
