import { ImageResponse } from "next/og";
import { OG_SIZE, OgFrame, ogFonts } from "@/lib/og";
import { getSharedQuiz } from "@/lib/shared-quiz";

export const alt = "Shared quiz";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Preview card shown when a quiz link is dropped in a group chat. */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const quiz = await getSharedQuiz(code);
  return new ImageResponse(
    quiz ? (
      <OgFrame eyebrow={quiz.class_name} title={quiz.title} chips={[`${quiz.question_count} questions`]} cta="Take the quiz →" />
    ) : (
      <OgFrame title="Turn your notes into a quiz" chips={[]} cta="Try it free →" />
    ),
    { ...OG_SIZE, fonts: await ogFonts() },
  );
}
