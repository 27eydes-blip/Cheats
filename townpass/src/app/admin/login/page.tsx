import { redirect } from "next/navigation";
import { login } from "../actions";
import { Notice } from "@/components/ui";
import { isAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin login", robots: { index: false, follow: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdmin()) redirect("/admin");
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-5 pt-24">
      <h1 className="font-serif text-3xl text-gold-soft">Admin</h1>
      {error && (
        <div className="mt-4">
          <Notice tone="red">{error}</Notice>
        </div>
      )}
      <form action={login} className="mt-6 space-y-3">
        <input
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-white focus:border-gold focus:outline-none"
        />
        <button className="w-full rounded-xl bg-gold py-3 font-semibold text-ink">Log in</button>
      </form>
    </main>
  );
}
