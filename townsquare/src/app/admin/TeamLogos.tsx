"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { teamLogoAction } from "@/actions/moderation";
import type { TeamView } from "@/lib/sports/teams";
import { LEAGUE_NAME } from "@/lib/sports/teams-data";
import { TeamBadge, TeamLogo } from "@/components/sports/TeamLogo";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers";

/** Upload or replace a team logo by hand; shows the generated badge it replaces. */
export function TeamLogos({ teams, provider }: { teams: TeamView[]; provider: string }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [id, setId] = useState(teams[0]?.id ?? "");
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const team = teams.find((t) => t.id === id);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? teams.filter((t) => t.fullName.toLowerCase().includes(s) || t.abbr.toLowerCase() === s) : teams).slice(0, 60);
  }, [q, teams]);
  const send = (fd: FormData, remove = false) =>
    start(async () => {
      fd.set("team", id);
      if (remove) fd.set("remove", "1");
      const r = await teamLogoAction(fd);
      toast(r.ok ? (remove ? "Logo removed: badge restored" : "Logo saved") : r.error, r.ok ? "ok" : "error");
      if (r.ok) (setPreview(null), router.refresh());
    });
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-[1fr_260px]">
      <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), send(new FormData(e.currentTarget)))}>
        <label className="block"><span className="label">Find a team</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Chiefs, LAL, Arsenal" className="input" /></label>
        <label className="block">
          <span className="label">Team</span>
          <select value={id} onChange={(e) => (setId(e.target.value), setPreview(null))} className="input">
            {matches.map((t) => <option key={t.id} value={t.id}>{t.logo ? "● " : ""}{t.fullName} · {LEAGUE_NAME[t.league]}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Logo (PNG, WebP or JPEG; SVG is not accepted)</span><input name="file" type="file" accept="image/png,image/webp,image/jpeg" className="input py-2" onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : null); }} /></label>
        <label className="flex items-start gap-2 text-[13.5px] text-ink-2"><input type="checkbox" name="rights" className="mt-1 h-4 w-4 accent-[var(--wn-blue)]" /> I confirm we have a license or written permission to use this logo.</label>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save logo"}</Button>
          {team?.logo && <Button type="button" variant="secondary" disabled={pending} onClick={() => send(new FormData(), true)}>Remove logo</Button>}
        </div>
        <p className="text-[12.5px] text-ink-3">Logo provider: <b className="text-ink-2">{provider}</b>. Manual uploads always win over the provider and are never overwritten by a refresh.</p>
      </form>
      {team && (
        <div className="card flex flex-col items-center justify-center gap-3 p-5">
          <p className="label">Preview</p>
          <div className="flex items-center gap-4">
            {preview ? <img src={preview} alt="" className="h-16 w-16 object-contain" /> : <TeamLogo team={team} size="lg" />}
            <span className="text-[12px] text-ink-3">vs badge</span>
            <TeamBadge team={team} px={64} />
          </div>
          <p className="text-center text-[13px] font-semibold">{team.fullName}</p>
        </div>
      )}
    </div>
  );
}
