"use client";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { BrandMark } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { APP_CONFIG } from "@/config/app";
import { supabaseBrowser } from "@/lib/supabase/client";

function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.7-4.9h-4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9a4.8 4.8 0 0 0-3.8-2c-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9a5 5 0 0 0-4.2 2.6c-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.1-2.5a11 11 0 0 0 1.4-2.9 4.5 4.5 0 0 1-2.6-4.1ZM13.9 5a4.5 4.5 0 0 0 1-3.3 4.6 4.6 0 0 0-3 1.6 4.3 4.3 0 0 0-1.1 3.2c1.2 0 2.3-.6 3.1-1.5Z" />
    </svg>
  );
}

export function LoginCard() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(params.get("error") ? "Sign-in didn't finish. Please try again." : null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const devLogin = process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "true";

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  const oauth = async (provider: "google" | "apple") => {
    setBusy(provider);
    setError(null);
    const origin = window.location.origin;
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError(error.message);
      setBusy(null);
    }
  };

  const devSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("email");
    setError(null);
    const sb = supabaseBrowser();
    let { error } = await sb.auth.signInWithPassword({ email, password });
    if (error && /invalid/i.test(error.message)) {
      ({ error } = await sb.auth.signUp({ email, password }));
    }
    if (error) setError(error.message);
    setBusy(null);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="w-full max-w-[400px]">
      <Card className="relative overflow-hidden p-8 shadow-lift md:p-10">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-40 w-64 -translate-x-1/2 rounded-full bg-accent opacity-20 blur-3xl" />
        <div className="relative mb-8 flex flex-col items-center gap-5 text-center">
          <BrandMark size={52} />
          <div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.035em]">Welcome to {APP_CONFIG.shortName}</h1>
            <p className="mt-2 text-[15px] text-muted">{APP_CONFIG.tagline}</p>
          </div>
        </div>
        <div className="relative flex flex-col gap-3">
          <Button variant="secondary" size="lg" onClick={() => oauth("google")} loading={busy === "google"}>
            <GoogleIcon /> Continue with Google
          </Button>
          <Button size="lg" className="!bg-fg !text-bg !shadow-none" onClick={() => oauth("apple")} loading={busy === "apple"}>
            <AppleIcon /> Continue with Apple
          </Button>
        </div>
        {devLogin && (
          <form onSubmit={devSignIn} className="relative mt-7 flex flex-col gap-2.5 border-t border-line pt-6" aria-label="Developer sign in">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Local testing only</p>
            <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
            <input type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            <Button type="submit" variant="outline" loading={busy === "email"}>
              Sign in with email
            </Button>
          </form>
        )}
        {error && <p className="relative mt-5 rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        <p className="relative mt-8 text-center text-xs leading-relaxed text-faint">Your notes stay private to you. We never sell your data.</p>
      </Card>
    </motion.div>
  );
}

const field = "h-12 rounded-2xl border border-line bg-bg px-4 text-[15px] outline-none transition focus:border-accent";
