"use server";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { MAX_UPLOAD, removeUpload, saveUpload, setLogoMode, type LogoMode } from "@/lib/sports/logos";
import { importLogoZip, setModeForTeams } from "@/lib/sports/logo-admin";
import { addAlias, deleteAlias } from "@/lib/sports/aliases";
import { fetchProviderLogo } from "@/lib/sports/logo-provider";
import { getTeam } from "@/lib/sports/teams";
import { attempt } from "./result";

async function admin() {
  const u = await requireViewer();
  if (u.role !== "admin") throw new AppError("Admins only.", "forbidden");
  return u;
}
const done = () => (revalidatePath("/admin/sports/logos"), revalidatePath("/", "layout"));

export async function uploadTeamLogoAction(form: FormData) {
  return attempt(async () => {
    await admin();
    const id = String(form.get("team") ?? "");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new AppError("Choose an image.");
    if (file.size > MAX_UPLOAD) throw new AppError("Logos can be at most 2 MB.");
    await saveUpload(id, Buffer.from(await file.arrayBuffer()));
    done();
  });
}

export async function removeTeamUploadAction(id: string) {
  return attempt(async () => {
    await admin();
    removeUpload(String(id));
    done();
  });
}

export async function teamLogoModeAction(ids: string[], mode: LogoMode) {
  return attempt(async () => {
    await admin();
    const n = setModeForTeams((Array.isArray(ids) ? ids : [ids]).map(String), mode);
    done();
    return n;
  });
}

export async function refetchProviderLogoAction(id: string) {
  return attempt(async () => {
    await admin();
    const team = getTeam(String(id));
    if (!team) throw new AppError("Unknown team.");
    const r = await fetchProviderLogo(team, { force: true });
    done();
    return r;
  });
}

export async function zipLogosAction(form: FormData) {
  return attempt(async () => {
    await admin();
    const file = form.get("zip");
    if (!(file instanceof File) || !file.size) throw new AppError("Choose a ZIP file.");
    if (file.size > 30 * 1024 * 1024) throw new AppError("ZIP files can be at most 30 MB.");
    const r = await importLogoZip(Buffer.from(await file.arrayBuffer()));
    done();
    return r;
  });
}

export async function addAliasAction(league: string, alias: string, teamId: string) {
  return attempt(async () => {
    await admin();
    addAlias(String(league), String(alias), String(teamId));
    done();
  });
}

export async function deleteAliasAction(league: string, aliasNorm: string) {
  return attempt(async () => {
    await admin();
    deleteAlias(String(league), String(aliasNorm));
    done();
  });
}
