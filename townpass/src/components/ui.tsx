import Link from "next/link";

export function Brand({ name = "CoastPassGo" }: { name?: string }) {
  return (
    <Link href="/" className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">
      {name}
    </Link>
  );
}

export function Footer({ brand = "CoastPassGo", support }: { brand?: string; support?: string }) {
  return (
    <footer className="mx-auto max-w-xl px-5 pb-10 pt-8 text-center text-xs text-muted">
      <div className="flex justify-center gap-4">
        <Link href="/terms" className="hover:text-gold">Terms</Link>
        <Link href="/privacy" className="hover:text-gold">Privacy</Link>
        {support && (
          <a href={`mailto:${support}`} className="hover:text-gold">
            Contact
          </a>
        )}
      </div>
      <p className="mt-3">© {new Date().getFullYear()} {brand}</p>
    </footer>
  );
}

export function Notice({ tone = "gold", children }: { tone?: "gold" | "red" | "green"; children: React.ReactNode }) {
  const cls =
    tone === "red"
      ? "border-closed/40 bg-closed/10 text-red-200"
      : tone === "green"
        ? "border-open/40 bg-open/10 text-green-200"
        : "border-gold/40 bg-gold/10 text-gold-soft";
  return <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
