import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-5 pt-16 text-center">
      <h1 className="font-serif text-3xl text-gold-soft">Not found</h1>
      <p className="mt-2 text-muted">That page doesn’t exist.</p>
      <Link href="/" className="mt-6 inline-block text-gold underline">
        Home
      </Link>
    </main>
  );
}
