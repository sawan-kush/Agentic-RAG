"use client";
import { useEffect, useRef } from "react";
import { FileText } from "lucide-react";
import { motion } from "framer-motion";
import type { Msg } from "./chat-types";
import { AgentStatus, VerificationBadge } from "./agent-status";
import { LogoMark } from "./logo";

function SourceButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={`Open ${name}`}
      className="focus-ring inline-flex max-w-[240px] items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1 text-xs text-[var(--ink-2)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--panel-2)] hover:text-[var(--ink)]">
      <FileText size={12} className="shrink-0 text-[var(--red)]" /><span className="truncate">{name}</span>
    </button>
  );
}

function MessageBubble({ m, last, busy, onOpenSource }: { m: Msg; last: boolean; busy: boolean; onOpenSource: (docId: string) => void }) {
  if (m.role === "user") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5 shadow-[var(--shadow-sm)] text-[15px] leading-6 sm:max-w-[75%]">{m.text}</p>
      </motion.div>
    );
  }

  const working = last && busy;
  // The draft is on screen but the verifier hasn't finished yet.
  const checking = working && m.verified === undefined && !!m.text && !!m.trace?.some((t) => t.agent === "Retriever");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="flex gap-3.5">
      <span aria-hidden className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow-sm)]"><LogoMark size={15} /></span>
      <div className="min-w-0 flex-1">
        <AgentStatus trace={m.trace ?? []} active={working} />
        <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-[var(--ink-2)] sm:max-w-[68ch]">
          {m.text || (working ? <span className="animate-pulse text-[var(--muted)]">Working…</span> : "")}
        </p>
        {(checking || m.verified === true || m.verified === false) && (
          <div className="mt-4"><VerificationBadge verified={m.verified} corrected={m.corrected} checking={checking} /></div>
        )}
        {m.sources?.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--faint)]">Sources</span>
            {m.sources.map((s) => <SourceButton key={s.docId} name={s.fileName} onClick={() => onOpenSource(s.docId)} />)}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

export default function MessageList({ msgs, busy, visible, onOpenSource }: { msgs: Msg[]; busy: boolean; visible: boolean; onOpenSource: (docId: string) => void }) {
  const endRef = useRef<HTMLDivElement>(null);
  // Keep the newest text in view while the answer streams in (and when coming back from another view).
  useEffect(() => { if (visible) endRef.current?.scrollIntoView({ block: "end" }); }, [msgs, visible]);

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto" aria-live="polite">
      <div className="mx-auto w-full max-w-3xl space-y-9 px-4 py-8 sm:px-6">
        {msgs.map((m, i) => <MessageBubble key={i} m={m} last={i === msgs.length - 1} busy={busy} onOpenSource={onOpenSource} />)}
        <div ref={endRef} />
      </div>
    </div>
  );
}