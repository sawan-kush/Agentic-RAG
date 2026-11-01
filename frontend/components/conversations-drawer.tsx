"use client";
import { useState } from "react";
import { MessageSquare, Plus, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export type Conv = { id: string; title: string; updated_at: string };

// Left slide-over listing saved chats. Same look as the knowledge-base panel, on the other side.
export default function ConversationsDrawer({ open, onClose, items, activeId, busy, onSelect, onNew, onDelete }: {
  open: boolean; onClose: () => void; items: Conv[]; activeId: string | null; busy: boolean;
  onSelect: (id: string) => void; onNew: () => void; onDelete: (id: string) => Promise<void>;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);  // which row is asking "Delete?"

  return (
    <AnimatePresence>
      {open && (
        <motion.aside initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed inset-y-0 left-0 z-50 flex w-full max-w-sm flex-col border-r border-[var(--line)] bg-[var(--panel)]">
          <header className="flex items-center justify-between border-b border-[var(--line)] p-4">
            <h2 className="font-semibold">Chats</h2>
            <button onClick={onClose} aria-label="Close"><X /></button>
          </header>
          <div className="flex-1 space-y-2 overflow-auto p-4">
            <button onClick={onNew} disabled={busy} className="glass flex w-full items-center justify-center gap-2 rounded-xl p-3 text-sm disabled:opacity-50"><Plus size={16} />New chat</button>
            {items.length === 0 && <p className="pt-4 text-center text-sm text-[var(--muted)]">No saved chats yet.</p>}
            {items.map((c) => (
              <div key={c.id} className={`glass flex items-center gap-2 rounded-xl p-3 hover:border-[var(--red)] ${c.id === activeId ? "border-[var(--red)]" : ""}`}>
                <button onClick={() => onSelect(c.id)} disabled={busy} className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50">
                  <MessageSquare size={14} className="shrink-0 text-[var(--red)]" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{c.title}</span>
                    <span className="text-xs text-[var(--muted)]">{new Date(c.updated_at).toLocaleDateString()}</span>
                  </span>
                </button>
                {confirmId === c.id ? (
                  <span className="flex items-center gap-2 text-xs">
                    <button onClick={async () => { await onDelete(c.id); setConfirmId(null); }} className="rounded-md bg-[var(--red)] px-2 py-1 text-white">Delete</button>
                    <button onClick={() => setConfirmId(null)} className="text-[var(--muted)]">No</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmId(c.id)} disabled={busy} aria-label={`Delete chat ${c.title}`} className="text-[var(--muted)] hover:text-[var(--red)] disabled:opacity-50"><Trash2 size={14} /></button>
                )}
              </div>
            ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}