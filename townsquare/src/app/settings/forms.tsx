"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction, deleteAccountAction, updateAccountAction, updateProfileAction } from "@/actions/settings";
import type { Result } from "@/actions/result";
import { LIMITS } from "@/config";
import { ACCENTS, BEATS, MAX_BEATS } from "@/lib/profile-theme";
import { changeEmailAction, notificationPrefsAction } from "@/actions/settings";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

function Status({ state, ok }: { state: Result | null; ok: string }) {
  if (!state) return null;
  return state.ok ? (
    <p role="status" className="text-sm font-medium text-success">{ok}</p>
  ) : (
    <p role="alert" className="text-sm font-medium text-danger">{state.error}</p>
  );
}

function useRefreshOnOk(state: Result | null) {
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
}

export function ProfileForm({ initial }: { initial: { displayName: string; bio: string; links: { label: string; url: string }[]; avatarUrl: string | null; bannerUrl: string | null; location: string; beats: string[]; accent: string } }) {
  const [state, action, pending] = useActionState(updateProfileAction, null);
  const [bio, setBio] = useState(initial.bio);
  const [beats, setBeats] = useState<string[]>(initial.beats);
  const [accent, setAccent] = useState(initial.accent);
  const [avatarPreview, setAvatarPreview] = useState(initial.avatarUrl);
  const [bannerPreview, setBannerPreview] = useState(initial.bannerUrl);
  useRefreshOnOk(state);
  const links = [...initial.links, ...Array(LIMITS.links).fill({ label: "", url: "" })].slice(0, LIMITS.links);
  return (
    <form action={action} className="space-y-5 px-4 py-4 sm:px-6">
      <div>
        <span className="label">Banner</span>
        <div className="relative aspect-[3/1] overflow-hidden rounded-[var(--r-lg)] bg-accent-soft ring-1 ring-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {bannerPreview && <img src={bannerPreview} alt="" className="h-full w-full object-cover" />}
        </div>
        <input type="file" name="banner" accept="image/jpeg,image/png,image/webp" aria-label="Upload banner" className="mt-2 text-sm" onChange={(e) => e.target.files?.[0] && setBannerPreview(URL.createObjectURL(e.target.files[0]))} />
        {initial.bannerUrl && <label className="ml-3 text-sm"><input type="checkbox" name="removeBanner" /> Remove</label>}
      </div>
      <div>
        <span className="label">Profile photo</span>
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {avatarPreview && <img src={avatarPreview} alt="" className="h-full w-full object-cover" />}
          </div>
          <div>
            <input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" aria-label="Upload profile photo" className="text-sm" onChange={(e) => e.target.files?.[0] && setAvatarPreview(URL.createObjectURL(e.target.files[0]))} />
            {initial.avatarUrl && <label className="mt-1 block text-sm"><input type="checkbox" name="removeAvatar" /> Remove photo</label>}
          </div>
        </div>
        <p className="mt-1 text-xs text-ink-3">Location and camera data are removed from every image you upload.</p>
      </div>
      <div>
        <label htmlFor="displayName" className="label">Name</label>
        <input id="displayName" name="displayName" defaultValue={initial.displayName} maxLength={LIMITS.displayNameChars} required className="input" />
      </div>
      <div>
        <label htmlFor="bio" className="label">Bio</label>
        <textarea id="bio" name="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={LIMITS.bioChars} rows={3} className="input" />
        <p className="text-right text-xs text-ink-3">{bio.length}/{LIMITS.bioChars}</p>
      </div>
      <div>
        <label htmlFor="location" className="label">Location</label>
        <input id="location" name="location" defaultValue={initial.location} maxLength={60} placeholder="City, state or country" className="input" />
      </div>
      <fieldset>
        <legend className="label">Your Beat <span className="font-normal text-ink-3">({beats.length}/{MAX_BEATS}): the topics you cover</span></legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(BEATS) as (keyof typeof BEATS)[]).map((b) => {
            const on = beats.includes(b);
            return (
              <label key={b} className={`inline-flex min-h-10 cursor-pointer items-center rounded-[10px] px-3 text-[13px] font-bold transition-all ${on ? "beat-chip" : "text-ink-3 ring-1 ring-rule"}`} style={{ ["--c" as string]: BEATS[b].color }}>
                <input type="checkbox" name="beats" value={b} checked={on} className="sr-only" onChange={() => setBeats(on ? beats.filter((x) => x !== b) : beats.length < MAX_BEATS ? [...beats, b] : beats)} />
                {BEATS[b].label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">Profile accent</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ACCENTS) as (keyof typeof ACCENTS)[]).map((a) => (
            <label key={a} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] px-3 text-[13px] font-semibold ring-1 transition-all ${accent === a ? "ring-2" : "ring-rule"}`} style={accent === a ? { boxShadow: `0 0 0 2px ${ACCENTS[a].color}`, color: ACCENTS[a].ink } : undefined}>
              <input type="radio" name="accent" value={a} checked={accent === a} onChange={() => setAccent(a)} className="sr-only" />
              <span className="h-4 w-4 rounded-full" style={{ background: ACCENTS[a].color }} />
              {ACCENTS[a].label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">Links</legend>
        <div className="space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input name="linkLabel" defaultValue={l.label} placeholder="Label" aria-label={`Link ${i + 1} label`} maxLength={30} className="input w-1/3" />
              <input name="linkUrl" defaultValue={l.url} placeholder="https://" aria-label={`Link ${i + 1} address`} maxLength={300} className="input" inputMode="url" />
            </div>
          ))}
        </div>
      </fieldset>
      <Status state={state} ok="Profile saved." />
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}

export function AccountForm({ handle, email, hideFollows }: { handle: string; email: string; hideFollows: boolean }) {
  const [state, action, pending] = useActionState(updateAccountAction, null);
  useRefreshOnOk(state);
  return (
    <form action={action} className="space-y-4 px-4 py-5 sm:px-6">
      <div>
        <label htmlFor="handle" className="label">Handle</label>
        <input id="handle" name="handle" defaultValue={handle} required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+" className="input" />
      </div>
      <div>
        <span className="label">Email</span>
        <p className="text-ink-3">{email}</p>
      </div>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="hideFollows" defaultChecked={hideFollows} className="mt-1 h-5 w-5 accent-[var(--accent)]" />
        <span>
          <span className="font-semibold">Hide my followers and following lists</span>
          <span className="block text-sm text-ink-3">Others will see that the lists are private. Counts are hidden too.</span>
        </span>
      </label>
      <Status state={state} ok="Saved." />
      <button className="btn-primary" disabled={pending}>Save</button>
    </form>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="space-y-4 px-4 py-5 sm:px-6">
      <h2 className="font-display text-h3 font-semibold">{hasPassword ? "Change password" : "Set a password"}</h2>
      {hasPassword && (
        <div>
          <label htmlFor="current" className="label">Current password</label>
          <input id="current" name="current" type="password" autoComplete="current-password" required className="input" />
        </div>
      )}
      <div>
        <label htmlFor="next" className="label">New password</label>
        <input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required className="input" />
      </div>
      <Status state={state} ok="Password updated." />
      <button className="btn-outline" disabled={pending}>Update password</button>
      <p className="text-sm text-ink-3">Two-factor authentication arrives with the Supabase auth swap (Stage 2).</p>
    </form>
  );
}

export function DeleteForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState(deleteAccountAction, null);
  return (
    <form action={action} className="space-y-4 px-4 py-5 sm:px-6">
      <h2 className="font-display text-h3 font-semibold text-danger">Delete account</h2>
      <p className="text-sm text-ink-3">
        This erases your profile, posts, images, likes, follows, and Vault. It can&apos;t be undone. Download your data first from Privacy and safety.
      </p>
      {hasPassword && (
        <div>
          <label htmlFor="del-pw" className="label">Password</label>
          <input id="del-pw" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
      )}
      <div>
        <label htmlFor="confirm" className="label">Type DELETE to confirm</label>
        <input id="confirm" name="confirm" required className="input" autoComplete="off" />
      </div>
      <Status state={state} ok="" />
      <button className="btn-danger" disabled={pending}>{pending ? "Deleting…" : "Delete my account"}</button>
    </form>
  );
}

export function DisplayForm({ textSize }: { theme: string; textSize: string }) {
  const router = useRouter();
  const setSize = (v: string) => {
    document.cookie = `textsize=${v}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <div className="space-y-6 px-4 py-4 sm:px-6">
      <section className="card p-4">
        <h2 className="font-semibold">Theme</h2>
        <p className="mb-3 text-[13.5px] text-ink-3">Auto switches with your device&apos;s light or dark setting.</p>
        <ThemeToggle />
      </section>
      <fieldset className="card p-4">
        <legend className="sr-only">Text size</legend>
        <h2 className="font-semibold">Text size</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[["normal", "Default", "text-[15px]"], ["large", "Larger", "text-[18px]"]].map(([v, l, cls]) => (
            <label key={v} className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-[var(--r-md)] ring-1 ring-line transition-colors has-[:checked]:bg-accent-soft has-[:checked]:ring-accent">
              <input type="radio" name="textsize" value={v} defaultChecked={textSize === v} onChange={() => setSize(v)} className="sr-only" />
              <span className={`font-display font-semibold ${cls}`}>Aa</span> {l}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-[13px] text-ink-3">Language options and auto-translate come in a later stage.</p>
    </div>
  );
}

export function EmailForm({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const [state, action, pending] = useActionState(changeEmailAction, null);
  useRefreshOnOk(state);
  return (
    <form action={action} className="space-y-4 px-4 py-5 sm:px-6">
      <h2 className="font-display text-h3 font-semibold">Email</h2>
      <div><label htmlFor="email" className="label">Email address</label><input id="email" name="email" type="email" defaultValue={email} required autoComplete="email" className="input" /></div>
      {hasPassword && <div><label htmlFor="emailpw" className="label">Current password</label><input id="emailpw" name="password" type="password" required autoComplete="current-password" className="input" /></div>}
      <Status state={state} ok="Email updated." />
      <button className="btn-outline" disabled={pending}>{pending ? "Saving…" : "Change email"}</button>
    </form>
  );
}

const PREF_LABELS: [string, string, string][] = [
  ["follows", "New followers", "When someone follows you or accepts your request"],
  ["requests", "Follow requests", "When someone asks to follow your private account"],
  ["mentions", "Mentions", "When someone @mentions you"],
  ["replies", "Responses and quotes", "When someone responds to or quotes your dispatch"],
  ["reactions", "Reactions", "When someone reacts to your dispatch"],
  ["relays", "Relays", "When someone relays your dispatch"],
  ["milestones", "Streaks and milestones", "Achievements, streaks and follower milestones"],
];

export function NotificationPrefsForm({ prefs }: { prefs: Record<string, boolean> }) {
  const [state, action, pending] = useActionState(notificationPrefsAction, null);
  return (
    <form action={action} className="space-y-1 px-4 py-4 sm:px-6">
      {PREF_LABELS.map(([k, label, hint]) => (
        <label key={k} className="flex min-h-14 cursor-pointer items-center justify-between gap-4 border-b border-line py-2">
          <span><span className="block font-semibold">{label}</span><span className="block text-[13px] text-ink-3">{hint}</span></span>
          <input type="checkbox" name={k} defaultChecked={prefs[k]} className="h-5 w-5 accent-[var(--wn-blue)]" />
        </label>
      ))}
      <div className="pt-3"><Status state={state} ok="Notification settings saved." /></div>
      <button className="btn-primary mt-2" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}
