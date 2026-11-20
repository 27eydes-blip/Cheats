"use client";

import Link from "next/link";
import { useActionState } from "react";
import { APP_NAME, TAGLINE } from "@/config";
import { LogoMark } from "@/components/ui/Logo";
import { loginAction, signupAction } from "@/actions/auth";

export function AuthCard({ title, children, google, notice, subtitle }: { title: string; children: React.ReactNode; google: boolean; notice?: string; subtitle?: string }) {
  return (
    <div className="relative min-h-[calc(100dvh-var(--ticker-h))] overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[340px] overflow-hidden">
        <div className="absolute -top-28 -left-20 h-80 w-80 rounded-full bg-[#3b82f6] opacity-25 blur-3xl" />
        <div className="absolute -top-16 right-[-80px] h-80 w-80 rounded-full bg-[#7c3aed] opacity-20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(180deg,#000,transparent)]" />
      </div>
      <div className="relative mx-auto max-w-[420px] px-5 pt-10 pb-12 sm:pt-14">
        <LogoMark size={48} />
        <h1 className="mt-5 font-display text-[clamp(2rem,1.6rem+1.6vw,2.6rem)] leading-[1.05] font-semibold text-balance">{title}</h1>
        <p className="mt-2 text-[16px] text-ink-2">{subtitle ?? TAGLINE}</p>
        {notice && <p className="mt-5 rounded-[var(--r-md)] bg-surface-2 p-3 text-[14px]" role="status">{notice}</p>}
        <div className="card mt-7 p-5 shadow-2 sm:p-6">
          <a href="/auth/google/start" className={`btn-outline w-full ${google ? "" : "opacity-70"}`} aria-describedby={google ? undefined : "google-note"}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.4 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
            Continue with Google
          </a>
          {!google && <p id="google-note" className="mt-1.5 text-center text-[12px] text-ink-3">Google sign-in needs setup on this server (see README).</p>}
          <div className="my-5 flex items-center gap-3 text-[12px] font-semibold tracking-wide text-ink-3 uppercase"><span className="h-px flex-1 bg-line" />or with email<span className="h-px flex-1 bg-line" /></div>
          {children}
        </div>
        <p className="mt-6 text-center text-[12.5px] text-ink-3">{APP_NAME} by Gleyde Technologies, LLC</p>
      </div>
    </div>
  );
}

function Err({ state }: { state: { ok: boolean; error?: string } | null }) {
  if (!state || state.ok) return null;
  return <p role="alert" className="animate-scale-in rounded-[var(--r-md)] bg-danger-soft p-3 text-[14px] font-medium text-danger">{state.error}</p>;
}

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <Err state={state} />
      <button type="submit" className="btn-primary !min-h-12 w-full !text-base" disabled={pending}>{pending ? "Logging in…" : "Log in"}</button>
      <p className="text-center text-sm text-ink-3">New here? <Link href="/signup" className="font-semibold text-accent">Create an account</Link></p>
    </form>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="displayName" className="label">Name</label>
        <input id="displayName" name="displayName" maxLength={50} required autoComplete="name" className="input" />
      </div>
      <div>
        <label htmlFor="handle" className="label">Handle</label>
        <div className="relative">
          <span className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3">@</span>
          <input id="handle" name="handle" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+" autoCapitalize="none" autoCorrect="off" className="input !pl-8" aria-describedby="handle-help" />
        </div>
        <p id="handle-help" className="mt-1 text-xs text-ink-3">3–20 letters, numbers, or underscores.</p>
      </div>
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="input" aria-describedby="pw-help" />
        <p id="pw-help" className="mt-1 text-xs text-ink-3">At least 10 characters.</p>
      </div>
      {/* Honeypot for bots; hidden from people and screen readers */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label className="flex items-start gap-3 text-[14px] text-ink-2">
        <input type="checkbox" name="age" required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" />
        <span>I am 13 or older.</span>
      </label>
      <label className="flex items-start gap-3 text-[14px] text-ink-2">
        <input type="checkbox" name="terms" required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" />
        <span>
          I agree to the <Link href="/legal/terms" className="text-accent underline" target="_blank">Terms</Link>, <Link href="/legal/privacy" className="text-accent underline" target="_blank">Privacy Policy</Link>, and{" "}
          <Link href="/legal/guidelines" className="text-accent underline" target="_blank">Community Guidelines</Link>.
        </span>
      </label>
      <Err state={state} />
      <button type="submit" className="btn-primary !min-h-12 w-full !text-base" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
      <p className="text-center text-sm text-ink-3">Already have an account? <Link href="/login" className="font-semibold text-accent">Log in</Link></p>
    </form>
  );
}
