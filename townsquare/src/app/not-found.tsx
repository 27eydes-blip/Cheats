import Link from "next/link";

export default function NotFound() {
  return (
    <div className="px-6 py-20 text-center">
      <h1 className="text-3xl font-black">Not found</h1>
      <p className="mt-2 text-muted">This page doesn&apos;t exist, or it was removed.</p>
      <Link href="/" className="btn-primary mt-6">Go home</Link>
    </div>
  );
}
