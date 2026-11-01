"use client";
import { FileText, Search, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";

// Shown when a chat has no messages. `children` is the query bar, so it sits in the middle of the page.
export default function EmptyChatState({ children, onOpenKb }: { children: React.ReactNode; onOpenKb: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-[7vh] sm:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="relative w-full max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--red)]" />Agentic RAG
        </span>
        <h2 className="font-display mt-5 text-4xl sm:text-[54px] sm:leading-[1.05]">What would you like to <em className="text-[var(--red)]">know</em>?</h2>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-[var(--muted)]">
          Ask questions across your uploaded documents. Answers are checked against the source and cite the file they came from.
        </p>
        <div className="mt-9 w-full">{children}</div>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-[var(--faint)]">
          <li className="inline-flex items-center gap-1.5"><Search size={13} />Hybrid search</li>
          <li className="inline-flex items-center gap-1.5"><ShieldCheck size={13} />Verified answers</li>
          <li className="inline-flex items-center gap-1.5"><FileText size={13} />Cited sources</li>
        </ul>
        <p className="mt-5 text-[13px] text-[var(--faint)]">
          New here?{" "}
          <button onClick={onOpenKb} className="focus-ring rounded text-[var(--muted)] underline decoration-[var(--line)] underline-offset-4 transition-colors hover:text-[var(--ink)] hover:decoration-[var(--muted)]">Add documents to your knowledge base</button>
        </p>
      </motion.div>
    </div>
  );
}