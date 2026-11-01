"use client";
import { useState } from "react";
import { Activity, ChevronDown, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { Trace } from "./chat-types";

// Compact, collapsed-by-default view of the agent trace. Expands to the full step list.
export function AgentStatus({ trace, active }: { trace: Trace[]; active: boolean }) {
  const [open, setOpen] = useState(false);
  if (!trace.length && !active) return null;
  const latest = trace[trace.length - 1];
  const total = trace.reduce((s, t) => s + t.ms, 0);

  return (
    <div className="mb-3">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="focus-ring -ml-1.5 inline-flex max-w-full items-center gap-2 rounded-md px-1.5 py-1 text-xs text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]">
        {active
          ? <span className="relative flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--red)] opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--red)]" /></span>
          : <Activity size={13} className="shrink-0" />}
        <span className="truncate">
          {active
            ? (latest ? <><b className="font-medium text-[var(--ink-2)]">{latest.agent}</b> · {latest.detail}</> : "Starting…")
            : `Agent trace · ${trace.length} step${trace.length === 1 ? "" : "s"}`}
        </span>
        {!active && <span className="shrink-0 tabular-nums text-[var(--faint)]">{total} ms</span>}
        <ChevronDown size={13} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && trace.length > 0 && (
          <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            className="ml-2.5 mt-1 space-y-1.5 overflow-hidden border-l border-[var(--line)] pl-3.5 text-xs text-[var(--muted)]">
            {trace.map((t, j) => (
              <li key={j} className="flex items-baseline justify-between gap-4 first:pt-1 last:pb-1">
                <span className="min-w-0"><b className="font-medium text-[var(--ink-2)]">{t.agent}</b> {t.detail}</span>
                <span className="shrink-0 tabular-nums text-[var(--faint)]">{t.ms} ms</span>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  );
}

const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset";

export function VerificationBadge({ verified, corrected, checking }: { verified?: boolean | null; corrected?: boolean; checking: boolean }) {
  if (checking) return <span className={`${pill} bg-[var(--hover)] text-[var(--muted)] ring-black/10`}><Loader2 size={12} className="animate-spin" />Draft · checking against your documents…</span>;
  if (verified === true) return <span className={`${pill} bg-emerald-50 text-emerald-700 ring-emerald-600/20`}><ShieldCheck size={12} />Verified against your documents{corrected ? " (corrected after re-check)" : ""}</span>;
  if (verified === false) return <span className={`${pill} bg-amber-50 text-amber-700 ring-amber-600/25`}><ShieldAlert size={12} />Could not fully verify this answer</span>;
  return null;
}