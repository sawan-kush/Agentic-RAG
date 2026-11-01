"use client";
import { useEffect, useRef } from "react";
import { ArrowUp, Library, Loader2, Search } from "lucide-react";
import { motion } from "framer-motion";

const MAX = 2000;  // same limit the input always had

// One unified pill: [search icon | input | documents shortcut | round send button].
// The shared layoutId lets it glide from the centered empty state down to the sticky bottom bar.
export default function ChatInput({ value, onChange, onSubmit, busy, onOpenKb }: {
  value: string; onChange: (v: string) => void; onSubmit: (e: React.FormEvent) => void; busy: boolean; onOpenKb: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const canSend = !busy && value.trim().length > 0;

  // Focus on desktop only, so phones don't pop the keyboard unprompted. Re-focus after each answer.
  useEffect(() => {
    if (!busy && window.matchMedia("(pointer: fine)").matches) ref.current?.focus();
  }, [busy]);

  return (
    <motion.form layoutId="composer" layout="position" transition={{ type: "spring", stiffness: 420, damping: 38 }}
      onSubmit={onSubmit} className="composer group flex h-14 w-full items-center gap-1 rounded-full pl-5 pr-1.5 sm:h-16">
      <Search size={20} aria-hidden className="shrink-0 text-[var(--faint)] transition-colors group-focus-within:text-[var(--ink-2)]" />
      <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} maxLength={MAX}
        aria-label="Ask about your documents" placeholder="Ask anything about your documents..."
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)] sm:text-base" />
      {value.length > MAX - 200 && <span className="mr-1 shrink-0 text-xs tabular-nums text-[var(--muted)]">{value.length}/{MAX}</span>}
      <span aria-hidden className="mx-1 hidden h-6 w-px shrink-0 bg-[var(--line)] sm:block" />
      <button type="button" onClick={onOpenKb} title="Open knowledge base"
        className="focus-ring mr-1 hidden h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] text-[var(--muted)] transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--ink)] sm:inline-flex">
        <Library size={14} />All documents
      </button>
      <motion.button type="submit" disabled={!canSend} aria-label="Send" whileTap={canSend ? { scale: 0.92 } : undefined}
        className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--red)] text-white transition-colors hover:bg-[var(--red-hover)] disabled:bg-[var(--hover-2)] disabled:text-[var(--faint)] sm:h-11 sm:w-11">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={19} strokeWidth={2.25} />}
      </motion.button>
    </motion.form>
  );
}