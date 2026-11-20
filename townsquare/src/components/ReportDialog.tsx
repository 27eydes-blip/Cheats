"use client";

import { useState, useTransition } from "react";
import { REPORT_REASONS } from "@/lib/validate";
import { reportAction } from "@/actions/moderation";
import { Modal } from "./Modal";
import { useToast } from "./providers";

/** Report a post or an account. Same reasons and rules for every account. */
export function ReportDialog({ open, onClose, targetType, targetId, label }: { open: boolean; onClose: () => void; targetType: "post" | "user"; targetId: string; label: string }) {
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  return (
    <Modal open={open} onClose={onClose} title={`Report ${label}`}>
      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!reason) return setError("Pick a reason.");
          start(async () => {
            const res = await reportAction({ targetType, targetId, reason, details });
            if (!res.ok) return setError(res.error);
            toast("Thanks — our moderators will review this.");
            setReason("");
            setDetails("");
            onClose();
          });
        }}
      >
        <fieldset>
          <legend className="mb-2 font-semibold">What&apos;s wrong?</legend>
          <div className="space-y-1">
            {Object.entries(REPORT_REASONS).map(([k, v]) => (
              <label key={k} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-surface">
                <input type="radio" name="reason" value={k} checked={reason === k} onChange={() => setReason(k)} className="h-5 w-5 accent-[var(--accent)]" />
                <span>{v}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {reason === "sexual_minor" && (
          <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
            Reports of child sexual exploitation are escalated immediately and reported to NCMEC as required by law. Do not download or share the content.
          </p>
        )}
        <div>
          <label htmlFor="report-details" className="label">
            Anything else? <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} className="input" />
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-danger" disabled={pending}>
            {pending ? "Sending…" : "Send report"}
          </button>
        </div>
        <p className="text-xs text-muted">
          You can also block or mute this account. Read the <a className="underline" href="/legal/guidelines">Community Guidelines</a>.
        </p>
      </form>
    </Modal>
  );
}
