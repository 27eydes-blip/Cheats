/** An error whose message is safe to show to the user. */
export class AppError extends Error {
  constructor(message: string, public code: string = "bad_request") {
    super(message);
    this.name = "AppError";
  }
}

export function userMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  if (e && typeof e === "object" && "issues" in e) {
    // zod error: show the first issue
    const issues = (e as { issues: { message: string }[] }).issues;
    if (issues?.[0]) return issues[0].message;
  }
  console.error(e);
  return "Something went wrong. Please try again.";
}
