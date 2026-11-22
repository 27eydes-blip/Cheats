"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { addAliasAction, deleteAliasAction, refetchProviderLogoAction, removeTeamUploadAction, teamLogoModeAction, uploadTeamLogoAction, zipLogosAction } from "@/actions/team-logos";
import type { LogoAdminRow, ZipResult } from "@/lib/sports/logo-admin";
import type { AliasRow } from "@/lib/sports/aliases";
import type { LogoMode } from "@/lib/sports/logos";
import { LetterBadge } from "@/components/sports/TeamLogo";
import { useToast } from "@/components/providers";
import { useConfirm } from "@/components/ui/Confirm";

const ACCEPT = "image/png,image/svg+xml,image/jpeg,image/webp,.png,.svg,.jpg,.jpeg,.webp";
const MAX = 2 * 1024 * 1024;
const SOURCE_LABEL = { upload: "Uploaded", tsdb: "TheSportsDB", letter: "Letter badge" } as const;
const MODE_LABEL: Record<LogoMode, string> = { auto: "Automatic (best available)", upload: "Use uploaded logo", tsdb: "Use TheSportsDB badge", letter: "Use letter badge" };

function useAct() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const act = <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, ok?: string | ((d: T) => string), after?: (d: T) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(r.error, "error");
      if (ok) toast(typeof ok === "function" ? ok(r.data) : ok);
      after?.(r.data);
      router.refresh();
    });
  return { pending, act };
}

function Thumb({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} width={40} height={40} loading="lazy" className="h-10 w-10 object-contain" />;
}

function Row({ r, providerName }: { r: LogoAdminRow; providerName: string }) {
  const { pending, act } = useAct();
  const confirm = useConfirm();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const upload = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX) return toast("Logos can be at most 2 MB.", "error");
    const fd = new FormData();
    fd.set("team", r.id);
    fd.set("file", f);
    act(() => uploadTeamLogoAction(fd), `Logo uploaded for ${r.name}`);
    if (file.current) file.current.value = "";
  };
  return (
    <tr role="row" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--hairline)] py-3 align-middle md:table-row md:py-0">
      <td role="cell" className="md:py-2 md:pr-3 md:pl-1">
        <span className="flex h-10 w-10 items-center justify-center">
          {r.current ? <Thumb src={r.current} alt={`${r.name} logo`} /> : <LetterBadge circle={r.circle} name={`${r.name} letter badge`} px={40} />}
        </span>
      </td>
      <th scope="row" role="rowheader" className="min-w-0 flex-1 text-left font-semibold md:py-2 md:pr-3">
        {r.name}
        <span className="mono block text-[11.5px] font-normal text-ink-3">{r.id}</span>
      </th>
      <td role="cell" className="text-[13.5px] text-ink-2 md:py-2 md:pr-3">{r.leagueName}</td>
      <td role="cell" className="basis-full text-[13.5px] md:basis-auto md:py-2 md:pr-3">
        <span className={r.source === "letter" ? "text-warning" : "text-ink-1"}>{r.source === "tsdb" ? r.providerLabel : SOURCE_LABEL[r.source]}</span>
        {r.mode !== "auto" && <span className="block text-[12px] text-ink-3">Chosen by hand</span>}
        <span className="mt-1 flex items-center gap-1.5" aria-label="Available logos">
          {r.uploadThumb && <span title="Uploaded"><Thumb src={r.uploadThumb} alt="Uploaded logo" /></span>}
          {r.providerThumb && <span title={r.providerLabel}><Thumb src={r.providerThumb} alt={`${r.providerLabel} badge`} /></span>}
        </span>
      </td>
      <td role="cell" className="basis-full md:basis-auto md:py-2 md:pr-3">
        <label className="sr-only" htmlFor={`mode-${r.id}`}>Logo for {r.name}</label>
        <select id={`mode-${r.id}`} className="input min-h-10 w-full !py-1.5 text-[13.5px] md:w-auto" value={r.mode} disabled={pending} onChange={(e) => act(() => teamLogoModeAction([r.id], e.target.value as LogoMode), "Saved")}>
          {(Object.keys(MODE_LABEL) as LogoMode[]).map((m) => (
            <option key={m} value={m} disabled={(m === "upload" && !r.uploadThumb) || (m === "tsdb" && !r.providerThumb)}>
              {m === "tsdb" ? `Use ${providerName} badge` : MODE_LABEL[m]}
              {(m === "upload" && !r.uploadThumb) || (m === "tsdb" && !r.providerThumb) ? " (none yet)" : ""}
            </option>
          ))}
        </select>
      </td>
      <td role="cell" className="basis-full md:basis-auto md:py-2 md:pr-1">
        <div className="flex flex-wrap gap-1.5">
          <input ref={file} type="file" accept={ACCEPT} className="sr-only" id={`file-${r.id}`} onChange={(e) => upload(e.target.files?.[0])} disabled={pending} />
          <label htmlFor={`file-${r.id}`} className="btn-outline !min-h-10 cursor-pointer !text-[13.5px]">{r.uploadThumb ? "Replace" : "Upload"}</label>
          {r.uploadThumb && (
            <button
              type="button"
              className="btn-outline !min-h-10 !text-[13.5px]"
              disabled={pending}
              onClick={async () => {
                if (await confirm({ title: `Remove the uploaded logo for ${r.name}?`, body: "The team goes back to the provider badge or its letter badge.", confirm: "Remove", danger: true })) act(() => removeTeamUploadAction(r.id), "Upload removed");
              }}
            >
              Remove upload
            </button>
          )}
          {!r.providerThumb && r.providerStatus !== "none" && (
            <button type="button" className="btn-outline !min-h-10 !text-[13.5px]" disabled={pending} title="Ask the provider again now" onClick={() => act(() => refetchProviderLogoAction(r.id), (s: string) => (s === "ok" ? "Badge downloaded" : s === "missing" ? "The provider has no badge for this team" : "Couldn't reach the provider"))}>
              Retry badge
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ZipUpload() {
  const { pending, act } = useAct();
  const [result, setResult] = useState<ZipResult | null>(null);
  return (
    <section aria-labelledby="zip" className="rounded-[14px] p-4 ring-1 ring-[var(--hairline)]">
      <h2 id="zip" className="text-[16px] font-bold">Bulk upload</h2>
      <p className="mt-1 text-[13.5px] text-ink-2">A ZIP of PNG, SVG, JPG or WebP images (2 MB each), each named by the team&apos;s slug, for example <span className="mono">ncaaf-ala.png</span> or <span className="mono">nfl-kc.svg</span>. The slug is shown under each team name below.</p>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          act(() => zipLogosAction(fd), (r: ZipResult) => `${r.matched.length} uploaded, ${r.unmatched.length} not used`, setResult);
        }}
      >
        <label className="sr-only" htmlFor="zipfile">ZIP file</label>
        <input id="zipfile" name="zip" type="file" accept=".zip,application/zip" className="text-[13.5px]" required />
        <button type="submit" className="btn-primary !min-h-10 !text-[14px]" disabled={pending}>{pending ? "Uploading…" : "Upload ZIP"}</button>
      </form>
      {result && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <h3 className="text-[13.5px] font-bold text-[#4ade80]">Matched ({result.matched.length})</h3>
            <ul className="mt-1 max-h-56 space-y-0.5 overflow-auto text-[13px]">{result.matched.map((m) => <li key={m.file}><span className="mono">{m.file}</span> → {m.team}</li>)}</ul>
          </div>
          <div>
            <h3 className="text-[13.5px] font-bold text-warning">Not used ({result.unmatched.length})</h3>
            <ul className="mt-1 max-h-56 space-y-0.5 overflow-auto text-[13px]">{result.unmatched.map((m) => <li key={m.file}><span className="mono">{m.file}</span>: {m.reason}</li>)}</ul>
          </div>
        </div>
      )}
    </section>
  );
}

function Aliases({ aliases, rows, leagues }: { aliases: AliasRow[]; rows: LogoAdminRow[]; leagues: { id: string; name: string }[] }) {
  const { pending, act } = useAct();
  const [league, setLeague] = useState(leagues.find((l) => l.id === "NCAAF")?.id ?? leagues[0].id);
  const [alias, setAlias] = useState("");
  const [team, setTeam] = useState("");
  const options = rows.filter((r) => r.league === league);
  return (
    <section aria-labelledby="aliases" className="rounded-[14px] p-4 ring-1 ring-[var(--hairline)]">
      <h2 id="aliases" className="text-[16px] font-bold">Name aliases</h2>
      <p className="mt-1 text-[13.5px] text-ink-2">When the data feed writes a team differently (for example &ldquo;Miami (FL)&rdquo;), add the feed&apos;s spelling here. Scores, standings and badges use these on the next sync.</p>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          act(() => addAliasAction(league, alias, team), "Alias saved", () => setAlias(""));
        }}
      >
        <label className="text-[13px] text-ink-2">League<select className="input mt-1 block min-h-10" value={league} onChange={(e) => (setLeague(e.target.value), setTeam(""))}>{leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="text-[13px] text-ink-2">Name in the feed<input className="input mt-1 block min-h-10" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Miami (FL)" maxLength={80} required /></label>
        <label className="text-[13px] text-ink-2">Our team<select className="input mt-1 block min-h-10" value={team} onChange={(e) => setTeam(e.target.value)} required><option value="">Choose…</option>{options.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <button type="submit" className="btn-primary !min-h-10 !text-[14px]" disabled={pending}>Add alias</button>
      </form>
      <div className="mt-3 max-h-80 overflow-auto">
        <table className="w-full text-[13.5px]">
          <caption className="sr-only">Name aliases</caption>
          <thead><tr className="border-b border-[var(--hairline)] text-left text-[11.5px] tracking-[0.06em] text-ink-3 uppercase"><th scope="col" className="py-1.5 font-bold">League</th><th scope="col" className="py-1.5 font-bold">Feed name</th><th scope="col" className="py-1.5 font-bold">Team</th><th scope="col" className="py-1.5"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {aliases.map((a) => (
              <tr key={a.league + a.aliasNorm} className="border-b border-[var(--hairline)]">
                <td className="py-1.5 text-ink-3">{a.league}</td>
                <td className="py-1.5">{a.alias}</td>
                <td className="py-1.5">{a.teamName ?? <span className="text-warning">{a.teamId} (unknown team)</span>}</td>
                <td className="py-1.5 text-right"><button type="button" className="btn-outline !min-h-9 !text-[13px]" disabled={pending} onClick={() => act(() => deleteAliasAction(a.league, a.aliasNorm), "Alias removed")}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TeamLogosAdmin({ rows, aliases, leagues, provider }: { rows: LogoAdminRow[]; aliases: AliasRow[]; leagues: { id: string; name: string }[]; provider: string }) {
  const [q, setQ] = useState("");
  const [league, setLeague] = useState("");
  const [noLogo, setNoLogo] = useState(false);
  const [college, setCollege] = useState(false);
  const { pending, act } = useAct();
  const confirm = useConfirm();
  const providerName = provider.startsWith("Off") ? "TheSportsDB" : provider;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (!league || r.league === league) && (!noLogo || r.source === "letter") && (!college || r.league === "NCAAF") && (!s || r.name.toLowerCase().includes(s) || r.id.includes(s)));
  }, [rows, q, league, noLogo, college]);
  const counts = { upload: rows.filter((r) => r.source === "upload").length, tsdb: rows.filter((r) => r.source === "tsdb").length, letter: rows.filter((r) => r.source === "letter").length };
  const bulk = async (mode: LogoMode) => {
    if (!shown.length) return;
    if (await confirm({ title: `${MODE_LABEL[mode]} for ${shown.length} team${shown.length === 1 ? "" : "s"}?`, body: "Applies to the teams in the list below (your current filters).", confirm: "Apply" })) act(() => teamLogoModeAction(shown.map((r) => r.id), mode), (n: number) => `Updated ${n} teams`);
  };
  return (
    <div className="space-y-6 px-4 pt-5 pb-12 sm:px-6">
      <div role="note" className="flex items-start gap-3 border-l-[3px] border-gold bg-gold-soft px-4 py-3 text-[14px]">
        <p><b>Official college and pro logos are trademarked. Only upload images you have permission to use.</b> Uploads are checked by their contents (PNG, SVG, JPG or WebP, 2 MB max), converted to WebP at 128 and 512 pixels, and stored on the server. SVG files are drawn into images, never served as SVG.</p>
      </div>

      <p className="text-[14px] text-ink-2">
        {rows.length} teams: <b>{counts.upload}</b> uploaded, <b>{counts.tsdb}</b> {providerName} badges, <b>{counts.letter}</b> letter badges. Provider: {provider}.
      </p>

      <ZipUpload />

      <section aria-labelledby="teams">
        <h2 id="teams" className="text-[16px] font-bold">Teams</h2>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="text-[13px] text-ink-2">Search<input className="input mt-1 block min-h-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Team or slug" /></label>
          <label className="text-[13px] text-ink-2">League<select className="input mt-1 block min-h-10" value={league} onChange={(e) => setLeague(e.target.value)}><option value="">All leagues</option>{leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="flex min-h-10 items-center gap-2 text-[14px]"><input type="checkbox" checked={noLogo} onChange={(e) => setNoLogo(e.target.checked)} className="h-4 w-4 accent-[var(--wn-blue)]" /> No real logo</label>
          <label className="flex min-h-10 items-center gap-2 text-[14px]"><input type="checkbox" checked={college} onChange={(e) => setCollege(e.target.checked)} className="h-4 w-4 accent-[var(--wn-blue)]" /> College teams</label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13.5px] text-ink-2">
          <span>For the {shown.length} team{shown.length === 1 ? "" : "s"} shown:</span>
          <button type="button" className="btn-outline !min-h-10 !text-[13.5px]" disabled={pending || !shown.length} onClick={() => bulk("letter")}>Use letter badges</button>
          <button type="button" className="btn-outline !min-h-10 !text-[13.5px]" disabled={pending || !shown.length} onClick={() => bulk("tsdb")}>Use {providerName} badges</button>
          <button type="button" className="btn-outline !min-h-10 !text-[13.5px]" disabled={pending || !shown.length} onClick={() => bulk("auto")}>Back to automatic</button>
        </div>
        <div className="mt-3 md:overflow-x-auto" data-no-swipe>
          <table role="table" className="block w-full text-[14px] md:table md:min-w-[820px]">
            <caption className="sr-only">Team logos ({shown.length} shown)</caption>
            <thead role="rowgroup" className="hidden md:table-header-group">
              <tr role="row" className="border-b border-[var(--hairline)] text-left text-[11.5px] tracking-[0.06em] text-ink-3 uppercase">
                <th scope="col" role="columnheader" className="py-2 pl-1 font-bold">Logo</th>
                <th scope="col" role="columnheader" className="py-2 font-bold">Team</th>
                <th scope="col" role="columnheader" className="py-2 font-bold">League</th>
                <th scope="col" role="columnheader" className="py-2 font-bold">Showing</th>
                <th scope="col" role="columnheader" className="py-2 font-bold">Choice</th>
                <th scope="col" role="columnheader" className="py-2 font-bold">Upload</th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="block md:table-row-group">{shown.map((r) => <Row key={r.id} r={r} providerName={providerName} />)}</tbody>
          </table>
          {!shown.length && <p className="py-6 text-center text-[14px] text-ink-3">No teams match these filters.</p>}
        </div>
      </section>

      <Aliases aliases={aliases} rows={rows} leagues={leagues} />
    </div>
  );
}
