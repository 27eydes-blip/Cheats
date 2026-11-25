"use client";

import { useState } from "react";
import { Magnetic } from "./Magnetic";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

const field =
  "peer w-full border-0 border-b border-ivory/20 bg-transparent px-0 pt-6 pb-3 text-base text-ivory placeholder-transparent transition-colors duration-300 focus:border-gold-light focus:ring-0 focus:outline-none";
const label =
  "pointer-events-none absolute top-6 left-0 text-[0.7rem] tracking-[0.26em] text-ivory/60 uppercase transition-all duration-300 ease-deco peer-focus:top-0 peer-focus:text-[0.6rem] peer-focus:text-gold peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-[0.6rem]";

/**
 * Minimal contact form. Posts JSON to /api/contact and reports the result
 * in a polite live region. Includes a hidden honeypot field for bots.
 */
export function ContactForm() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
      form.reset();
      setState({ kind: "sent" });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate={false}>
      {/* Honeypot: hidden from people and assistive tech, tempting to bots. */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label>
          Leave this empty
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-8 sm:grid-cols-2">
        <div className="relative">
          <input id="cf-name" name="name" type="text" required maxLength={100} autoComplete="name" placeholder="Name" className={field} />
          <label htmlFor="cf-name" className={label}>
            Name
          </label>
        </div>
        <div className="relative">
          <input id="cf-email" name="email" type="email" required maxLength={200} autoComplete="email" placeholder="Email" className={field} />
          <label htmlFor="cf-email" className={label}>
            Email
          </label>
        </div>
      </div>
      <div className="relative">
        <textarea
          id="cf-message"
          name="message"
          required
          rows={4}
          maxLength={5000}
          placeholder="Message"
          className={`${field} resize-none`}
        />
        <label htmlFor="cf-message" className={label}>
          Message
        </label>
      </div>

      <div className="flex flex-col items-start gap-6 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <Magnetic>
          <button
            type="submit"
            disabled={state.kind === "sending"}
            className="group relative inline-flex h-13 items-center gap-3 overflow-hidden rounded-full border border-gold/60 px-9 text-[0.7rem] font-medium tracking-[0.3em] text-ivory uppercase transition-[box-shadow,border-color,color] duration-500 ease-deco hover:border-gold-light hover:text-ink hover:glow-gold focus-visible:glow-gold disabled:cursor-wait disabled:opacity-60"
          >
            <span
              aria-hidden="true"
              className="bg-gold-gradient absolute inset-0 -z-0 origin-left scale-x-0 transition-transform duration-500 ease-deco group-hover:scale-x-100"
            />
            <span className="relative">{state.kind === "sending" ? "Sending" : "Send message"}</span>
          </button>
        </Magnetic>

        <p role="status" aria-live="polite" className="min-h-6 text-sm font-light">
          {state.kind === "sent" && <span className="text-gold-light">Thank you. We will be in touch soon.</span>}
          {state.kind === "error" && <span className="text-[#f0a58a]">{state.message}</span>}
        </p>
      </div>
    </form>
  );
}
