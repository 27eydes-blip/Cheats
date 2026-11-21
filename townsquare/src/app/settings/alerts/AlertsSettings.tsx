"use client";

import { useEffect, useState, useTransition } from "react";
import { saveAlertPrefsAction, testAlertAction } from "@/actions/alerts";
import type { AlertKind, AlertPrefs } from "@/lib/push/push";
import { useToast } from "@/components/providers";
import { Button } from "@/components/ui/Button";

type DeviceState = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "not-configured";

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
const TIMES = Array.from({ length: 48 }, (_, i) => i * 30);
const hhmm = (m: number) => new Date(Date.UTC(2000, 0, 1, Math.floor(m / 60), m % 60)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
      className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-white/15 ring-1 ring-[var(--hairline)] transition-all before:block before:h-5 before:w-5 before:translate-x-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-[var(--wn-blue-fill)] checked:before:translate-x-[22px] disabled:cursor-not-allowed disabled:opacity-50" />
  );
}

export function AlertsSettings({ prefs: initial, kinds, configured, devices }: { prefs: AlertPrefs; kinds: { key: AlertKind; label: string; text: string }[]; configured: boolean; devices: number }) {
  const [state, setState] = useState<DeviceState>("checking");
  const [prefs, setPrefs] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  const toast = useToast();

  useEffect(() => {
    (async () => {
      if (!configured) return setState("not-configured");
      const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
      const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [configured]);

  const save = (p: Partial<AlertPrefs>) => {
    setPrefs((x) => ({ ...x, ...p }));
    start(async () => {
      const r = await saveAlertPrefsAction(p);
      if (!r.ok) toast(r.error, "error");
    });
  };

  const turnOn = async () => {
    setBusy(true);
    try {
      // The permission prompt appears only here, after a tap on the switch.
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const { publicKey } = (await (await fetch("/api/push/key")).json()) as { publicKey: string | null };
      if (!publicKey) return setState("not-configured");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      // Some browsers (private windows) never answer; don't leave the switch spinning.
      const sub = await Promise.race([
        reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Your browser's push service didn't answer. Check your connection and try again (private windows can't get alerts).")), 20_000)),
      ]);
      const res = await fetch("/api/push/subscription", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Couldn't turn on alerts.");
      save({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
      setState("on");
      toast("Alerts are on for this device");
    } catch (e) {
      toast((e as Error).message || "Couldn't turn on alerts.", "error");
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscription", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
      toast("Alerts are off for this device");
    } finally {
      setBusy(false);
    }
  };

  const note: Partial<Record<DeviceState, string>> = {
    "not-configured": "Alerts aren't set up on this server yet (the site owner needs to add VAPID keys).",
    unsupported: "This browser doesn't support push alerts.",
    "ios-install": "On iPhone and iPad, add WorldNet to your Home Screen first (Share, then Add to Home Screen), open it from there, and turn alerts on here.",
    denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back.",
    checking: "Checking this device…",
  };

  return (
    <div className="px-4 pb-10 sm:px-6">
      <section aria-labelledby="dev" className="mt-4 rounded-[14px] ring-1 ring-[var(--hairline)]">
        <label className="flex min-h-14 items-center justify-between gap-4 px-4">
          <span>
            <span id="dev" className="block font-semibold">Alerts on this device</span>
            <span className="block text-[13px] text-ink-3" aria-live="polite">{busy ? "Working…" : note[state] ?? (state === "on" ? "On. You'll get the alert types switched on below." : `Off.${devices ? ` On for ${devices} other device${devices === 1 ? "" : "s"}.` : ""}`)}</span>
          </span>
          <Switch label="Alerts on this device" checked={state === "on" || (busy && state === "off")} disabled={busy || !["on", "off"].includes(state)} onChange={(v) => (v ? turnOn() : turnOff())} />
        </label>
        {state === "on" && (
          <div className="border-t border-[var(--hairline)] px-4 py-3">
            <Button size="sm" variant="secondary" onClick={() => start(async () => {
              const r = await testAlertAction();
              toast(r.ok ? "Test alert sent" : r.error, r.ok ? "ok" : "error");
            })}>Send me a test alert</Button>
          </div>
        )}
      </section>

      <section aria-labelledby="types" className="mt-6">
        <h2 id="types" className="text-[15px] font-bold">What to alert me about</h2>
        <ul className="mt-2 rounded-[14px] ring-1 ring-[var(--hairline)]">
          {kinds.map((k, i) => (
            <li key={k.key} className={i ? "border-t border-[var(--hairline)]" : ""}>
              <label className="flex min-h-14 items-center justify-between gap-4 px-4 py-2">
                <span><span className="block font-semibold">{k.label}</span><span className="block text-[13px] text-ink-3">{k.text}</span></span>
                <Switch label={k.label} checked={prefs[k.key]} onChange={(v) => save({ [k.key]: v } as Partial<AlertPrefs>)} />
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="limits" className="mt-6">
        <h2 id="limits" className="text-[15px] font-bold">Quiet hours and limits</h2>
        <div className="mt-2 grid gap-3 rounded-[14px] p-4 ring-1 ring-[var(--hairline)] sm:grid-cols-2">
          <label className="block"><span className="label">Quiet from</span>
            <select className="input" value={prefs.quietStart ?? ""} onChange={(e) => save({ quietStart: e.target.value === "" ? null : Number(e.target.value), quietEnd: prefs.quietEnd ?? (e.target.value === "" ? null : 7 * 60) })}>
              <option value="">Off</option>{TIMES.map((m) => <option key={m} value={m}>{hhmm(m)}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Until</span>
            <select className="input" value={prefs.quietEnd ?? ""} disabled={prefs.quietStart === null} onChange={(e) => save({ quietEnd: e.target.value === "" ? null : Number(e.target.value) })}>
              <option value="">Off</option>{TIMES.map((m) => <option key={m} value={m}>{hhmm(m)}</option>)}
            </select>
          </label>
          <p className="text-[12.5px] text-ink-3 sm:col-span-2">Time zone: {prefs.tz}. Alerts during quiet hours are skipped, not saved for later.</p>
          <label className="block sm:col-span-2"><span className="label">Breaking news alerts per day, at most</span>
            <select className="input" value={prefs.breakingCap} onChange={(e) => save({ breakingCap: Number(e.target.value) })}>
              {Array.from({ length: 11 }, (_, n) => <option key={n} value={n}>{n === 0 ? "None" : n}</option>)}
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}
