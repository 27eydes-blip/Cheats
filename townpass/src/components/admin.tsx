import { Notice } from "./ui";

export function Field(props: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  required?: boolean;
  type?: string;
  hint?: string;
  className?: string;
  mono?: boolean;
}) {
  const cls = `mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-white focus:border-sea focus:outline-none ${props.mono ? "font-mono" : ""}`;
  return (
    <label className={`block ${props.className ?? ""}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{props.label}</span>
      {props.multiline ? (
        <textarea name={props.name} defaultValue={props.defaultValue ?? ""} placeholder={props.placeholder} rows={props.rows ?? 3} required={props.required} className={cls} />
      ) : (
        <input name={props.name} type={props.type ?? "text"} step={props.type === "number" ? "any" : undefined} defaultValue={props.defaultValue ?? ""} placeholder={props.placeholder} required={props.required} className={cls} />
      )}
      {props.hint && <span className="mt-1 block text-xs text-zinc-500">{props.hint}</span>}
    </label>
  );
}

export function Btn({ children, name, value, tone = "gold" }: { children: React.ReactNode; name?: string; value?: string; tone?: "gold" | "plain" | "danger" }) {
  const cls =
    tone === "gold"
      ? "btn-metal"
      : tone === "danger"
        ? "bg-closed/15 text-closed ring-1 ring-closed/40"
        : "bg-panel-2 text-white ring-1 ring-line";
  return (
    <button name={name} value={value} className={`rounded-lg px-4 py-2 text-sm font-semibold ${cls}`}>
      {children}
    </button>
  );
}

export function Card({ title, children, actions }: { title?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel p-5">
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-serif text-xl text-gold-soft">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Flash({ sp }: { sp: { error?: string; saved?: string } }) {
  if (sp.error) return <Notice tone="red">{sp.error}</Notice>;
  if (sp.saved) return <Notice tone="green">Saved.</Notice>;
  return null;
}

export const fmtDate = (ms: number | null, tz = "America/New_York") =>
  ms ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz }).format(ms) : "never";

export const fmtDateTime = (ms: number | null, tz = "America/New_York") =>
  ms
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }).format(ms)
    : "-";
