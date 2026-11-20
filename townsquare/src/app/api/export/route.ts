import { getViewer } from "@/lib/session";
import { exportUserData } from "@/lib/users";

export const dynamic = "force-dynamic";

/** "Download my data": everything we store about the signed-in user, as JSON. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return new Response("Log in first", { status: 401 });
  const data = exportUserData(viewer.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${viewer.handle}-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
