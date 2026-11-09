"use client";
import { useState } from "react";
import { IconEdit } from "@/components/icons";

/** Big page title that wraps naturally; tap to rename. */
export function EditableTitle({ value, onSave, label, className }: { value: string; onSave: (v: string) => void; label: string; className: string }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        autoFocus
        aria-label={label}
        defaultValue={value}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== value) onSave(v);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className={`w-full rounded-xl bg-transparent outline-none ring-2 ring-accent/60 ${className}`}
      />
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} aria-label={`${label}: ${value}. Tap to rename.`} className="group flex w-full items-start gap-2 text-left">
      <span className={`${className} break-words`}>{value}</span>
      <IconEdit size={18} className="mt-3 shrink-0 text-faint opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}
