/** 303 redirect with a relative Location, so the browser stays on whatever host it's using. */
export function seeOther(path: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store", ...headers } });
}
