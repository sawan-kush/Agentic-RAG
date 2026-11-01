"use client";
import { useEffect, useMemo, useState } from "react";
import { Library, LogOut, Plus, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { Conv } from "./chat-types";
import Logo from "./logo";

type Props = {
  convs: Conv[]; activeId: string | null; busy: boolean; view: "chat" | "kb"; email: string;
  mobileOpen: boolean; onMobileClose: () => void;
  onSelect: (id: string) => void; onNew: () => void; onDelete: (id: string) => Promise<void>;
  onOpenKb: () => void; onSignOut: () => void;
};

// Groups the (already newest-first) list under Today / Yesterday / ... headings.
function groupConvs(items: Conv[]) {
  const day = 86_400_000, now = new Date();
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groups: { label: string; items: Conv[] }[] = [];
  for (const c of items) {
    const t = new Date(c.updated_at).getTime();
    const label = t >= sod ? "Today" : t >= sod - day ? "Yesterday" : t >= sod - 6 * day ? "Previous 7 days" : "Older";
    const g = groups.find((x) => x.label === label);
    g ? g.items.push(c) : groups.push({ label, items: [c] });
  }
  return groups;
}

const navBtn = "focus-ring flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-sm transition-colors disabled:opacity-50";

function SidebarBody({ convs, activeId, busy, view, email, onSelect, onNew, onDelete, onOpenKb, onSignOut, onClose }: Omit<Props, "mobileOpen" | "onMobileClose"> & { onClose?: () => void }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);  // which row is asking "Delete?"
  const groups = useMemo(() => groupConvs(convs), [convs]);
  const name = email ? email.split("@")[0] : "Account";

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <Logo size={26} tagline="Agentic RAG" />
        {onClose && <button onClick={onClose} aria-label="Close menu" className="focus-ring rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--hover-2)] hover:text-[var(--ink)]"><X size={18} /></button>}
      </div>

      {/* Primary navigation */}
      <nav aria-label="Main" className="shrink-0 space-y-1 px-3 pt-2">
        <button onClick={onNew} disabled={busy}
          className={`${navBtn} border border-[var(--line)] bg-[var(--panel)] font-medium text-[var(--ink)] shadow-[var(--shadow-sm)] hover:border-[var(--line-strong)]`}>
          <Plus size={16} />New chat
        </button>
        <button onClick={onOpenKb} aria-current={view === "kb" ? "page" : undefined}
          className={`${navBtn} ${view === "kb" ? "bg-[var(--hover-2)] text-[var(--ink)]" : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"}`}>
          <Library size={16} />Knowledge base
        </button>
      </nav>

      {/* Conversations */}
      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <h2 className="px-5 pb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--faint)]">Conversations</h2>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {convs.length === 0 && (
            <p className="px-2 pt-2 text-[13px] leading-relaxed text-[var(--faint)]">No conversations yet. Ask a question and it will appear here.</p>
          )}
          {groups.map((g) => (
            <section key={g.label} className="mb-4 last:mb-0">
              <h3 className="px-2 pb-1 text-[11px] text-[var(--faint)]">{g.label}</h3>
              <ul className="space-y-0.5">
                {g.items.map((c) => {
                  const active = view === "chat" && c.id === activeId;
                  return (
                    <li key={c.id} className="group relative">
                      {confirmId === c.id ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 text-xs">
                          <span className="truncate text-[var(--muted)]">Delete chat?</span>
                          <span className="flex shrink-0 items-center gap-1">
                            <button onClick={async () => { await onDelete(c.id); setConfirmId(null); }} className="focus-ring rounded-md bg-[var(--red)] px-2 py-1 font-medium text-white hover:bg-[var(--red-hover)]">Delete</button>
                            <button onClick={() => setConfirmId(null)} className="focus-ring rounded-md px-2 py-1 text-[var(--muted)] hover:text-[var(--ink)]">Cancel</button>
                          </span>
                        </div>
                      ) : (
                        <>
                          {active && <span aria-hidden className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-[var(--red)]" />}
                          <button onClick={() => onSelect(c.id)} disabled={busy} aria-current={active ? "true" : undefined}
                            className={`focus-ring block w-full truncate rounded-lg py-2 pl-3 pr-9 text-left text-[13.5px] transition-colors disabled:opacity-50 ${active ? "bg-[var(--hover-2)] text-[var(--ink)]" : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"}`}>
                            {c.title}
                          </button>
                          <button onClick={() => setConfirmId(c.id)} disabled={busy} aria-label={`Delete chat ${c.title}`}
                            className="focus-ring absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[var(--faint)] opacity-100 transition hover:bg-[var(--hover-2)] hover:text-[var(--red)] disabled:opacity-50 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>

      {/* Account */}
      <div className="shrink-0 border-t border-[var(--line-soft)] p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--panel-2)] text-[13px] font-medium uppercase text-[var(--ink-2)]">{name.charAt(0) || "?"}</span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-medium">{name}</span>
            {email && <span className="block truncate text-[11.5px] text-[var(--faint)]">{email}</span>}
          </span>
          <button onClick={onSignOut} aria-label="Sign out" title="Sign out"
            className="focus-ring shrink-0 rounded-md p-2 text-[var(--muted)] transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--ink)]">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppSidebar({ mobileOpen, onMobileClose, ...rest }: Props) {
  // Escape closes the mobile menu.
  useEffect(() => {
    if (!mobileOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onMobileClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      {/* Desktop / large tablet: fixed column */}
      <aside className="hidden w-[272px] shrink-0 border-r border-[var(--line-soft)] bg-[var(--sidebar)] lg:block">
        <SidebarBody {...rest} />
      </aside>

      {/* Mobile / small tablet: slide-over */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              onClick={onMobileClose} className="fixed inset-0 z-40 bg-black/30 lg:hidden" aria-hidden />
            <motion.aside key="drawer" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", damping: 32, stiffness: 340 }}
              className="fixed inset-y-0 left-0 z-50 w-[85%] max-w-[300px] border-r border-[var(--line-soft)] bg-[var(--sidebar)] lg:hidden">
              <SidebarBody {...rest} onClose={onMobileClose} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}