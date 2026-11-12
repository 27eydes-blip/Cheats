import { isAdmin } from "@/lib/admin-auth";
import { baseUrl, getEnv } from "@/lib/env";
import { qrPng, qrSvg, stickerUrl } from "@/lib/qr";

/** GET /api/admin/qr/MTK-ABC123?format=svg|png[&download=1] */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const env = await getEnv();
  const row = await env.DB.prepare("SELECT s.id, c.slug FROM stickers s JOIN cities c ON c.id = s.city_id WHERE s.id = ?")
    .bind(id)
    .first<{ id: string; slug: string }>();
  if (!row) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "png" ? "png" : "svg";
  const target = stickerUrl(baseUrl(env), row.slug, row.id);
  const headers: Record<string, string> = { "Cache-Control": "private, max-age=3600" };
  if (url.searchParams.get("download")) headers["Content-Disposition"] = `attachment; filename="${row.id}.${format}"`;

  if (format === "png") {
    const png = await qrPng(target);
    return new Response(png as BodyInit, { headers: { ...headers, "Content-Type": "image/png" } });
  }
  return new Response(qrSvg(target), { headers: { ...headers, "Content-Type": "image/svg+xml" } });
}
