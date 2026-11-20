"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createListAction, deleteListAction, listMemberAction } from "@/actions/menu";
import { CloseIcon, PlusIcon } from "@/components/icons";
import { useToast } from "@/components/providers";
import { Avatar } from "@/components/ui/Avatar";
import { useConfirm } from "@/components/ui/Confirm";

export function NewList() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="card flex gap-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createListAction(name);
          if (!r.ok) return toast(r.error, "error");
          setName("");
          router.push(`/lists/${r.data}`);
        });
      }}
    >
      <label htmlFor="list-name" className="sr-only">New list name</label>
      <input id="list-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="New list name" className="input min-w-0 flex-1" />
      <button type="submit" disabled={pending || !name.trim()} className="btn-primary shrink-0"><PlusIcon size={17} strokeWidth={2.3} /> Create</button>
    </form>
  );
}

export function ListMembers({ listId, members }: { listId: string; members: { id: string; handle: string; displayName: string; avatarUrl: string | null }[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [handle, setHandle] = useState("");
  const [pending, start] = useTransition();
  const change = (who: string, on: boolean) =>
    start(async () => {
      const r = await listMemberAction(listId, who, on);
      if (!r.ok) return toast(r.error, "error");
      if (on) setHandle("");
      router.refresh();
    });
  return (
    <section aria-label="Accounts in this list" className="card p-3">
      <form onSubmit={(e) => (e.preventDefault(), handle.trim() && change(handle, true))} className="flex gap-2">
        <label htmlFor="add-member" className="sr-only">Add an account by handle</label>
        <input id="add-member" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Add by handle, e.g. @maria_lopez" autoCapitalize="none" className="input min-w-0 flex-1" />
        <button type="submit" disabled={pending || !handle.trim()} className="btn-primary shrink-0">Add</button>
      </form>
      {members.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {members.map((m) => (
            <li key={m.id} className="inline-flex items-center gap-2 rounded-[12px] bg-white/[0.04] pl-1.5 ring-1 ring-rule">
              <Avatar url={m.avatarUrl} name={m.displayName} handle={m.handle} size={28} />
              <span className="text-[13.5px] font-semibold">@{m.handle}</span>
              <button type="button" onClick={() => change(m.id, false)} aria-label={`Remove @${m.handle}`} className="inline-flex h-11 w-9 items-center justify-center text-ink-3 hover:text-disagree"><CloseIcon size={15} /></button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="mt-3 inline-flex min-h-11 items-center text-[13px] font-semibold text-disagree hover:underline"
        onClick={async () => {
          if (!(await confirm({ title: "Delete this list?", body: "The accounts stay; only the list goes away.", confirm: "Delete list", danger: true }))) return;
          start(async () => {
            const r = await deleteListAction(listId);
            if (!r.ok) return toast(r.error, "error");
            router.push("/lists");
          });
        }}
      >
        Delete list
      </button>
    </section>
  );
}
