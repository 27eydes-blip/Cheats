import { Brand, Footer } from "./ui";

export function LegalPage({ title, brand, support, children }: { title: string; brand: string; support: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <Brand name={brand} />
      <h1 className="mt-6 font-serif text-3xl">{title}</h1>
      <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-zinc-300 [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:text-gold-soft">
        {children}
      </div>
      <Footer brand={brand} support={support} />
    </main>
  );
}
