"use client";

import Link from "next/link";
import { useState } from "react";
import type { CommentNode } from "@/lib/communities";
import { Avatar } from "../ui/Avatar";
import { VerifiedSeal } from "../ui/Badge";
import { ReplyIcon } from "../icons";
import { RichText } from "../RichText";
import { Time } from "../Time";
import { useComposer } from "../providers";
import { Vote } from "./Vote";

const DEPTH = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4"];

function count(n: CommentNode): number {
  return n.children.reduce((s, c) => s + 1 + count(c), 0);
}

/** One comment and its replies. Tap the colored depth line (or the toggle) to collapse the branch. */
function Comment({ node }: { node: CommentNode }) {
  const [open, setOpen] = useState(true);
  const openComposer = useComposer();
  const color = DEPTH[node.depth % DEPTH.length];
  const hidden = count(node);
  return (
    <li className="relative">
      <div className="flex gap-2.5 pt-3">
        <div className="flex flex-col items-center">
          <Avatar url={node.author.avatarUrl} name={node.author.displayName} handle={node.author.handle} size={28} ring={false} />
          {open && node.children.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={`Collapse ${hidden} repl${hidden === 1 ? "y" : "ies"}`}
              className="group mt-1 flex w-5 flex-1 justify-center"
            >
              <span className="w-[2px] rounded-full opacity-45 transition-all group-hover:w-[3px] group-hover:opacity-100" style={{ background: color }} />
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 text-[13.5px]">
            <Link href={`/u/${node.author.handle}`} className="font-semibold hover:underline">{node.author.displayName}</Link>
            {node.author.verified && <VerifiedSeal size={13} />}
            <span className="text-ink-3">· <Time ms={node.createdAt} /></span>
            {!open && (
              <button type="button" onClick={() => setOpen(true)} className="ml-1 rounded-[3px] bg-gold-soft px-2 py-0.5 text-[12px] font-semibold text-gold-ink">
                + {hidden} more
              </button>
            )}
          </div>
          {node.gone ? (
            <p className="mt-0.5 text-[14.5px] text-ink-3 italic">[{node.gone}]</p>
          ) : (
            <div className="mt-0.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap"><RichText text={node.body} /></div>
          )}
          {!node.gone && (
            <div className="mt-1 flex items-center gap-2">
              <Vote postId={node.id} score={node.score} myVote={node.myVote} horizontal />
              <button type="button" onClick={() => openComposer({ replyTo: node })} className="inline-flex h-8 items-center gap-1.5 rounded-[4px] px-2.5 text-[13px] font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink-1">
                <ReplyIcon size={15} /> Reply
              </button>
            </div>
          )}
          <div className="grid transition-[grid-template-rows] duration-[380ms] ease-[var(--ease-out)]" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
            <div className="min-h-0 overflow-hidden">
              {node.children.length > 0 && (
                <ul className="pl-0.5">
                  {node.children.map((c) => <Comment key={c.id} node={c} />)}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export function CommentTree({ nodes }: { nodes: CommentNode[] }) {
  return <ul className="px-4 pb-6 sm:px-6">{nodes.map((n) => <Comment key={n.id} node={n} />)}</ul>;
}
