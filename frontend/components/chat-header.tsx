"use client";
import { ChevronRight, Menu, Plus } from "lucide-react";

// Lightweight, contextual header: where you are, and little else. Navigation lives in the sidebar.
export default function ChatHeader({ title, busy, divider, onMenu, onNew }: {
  title: string; busy: boolean; divider: boolean; onMenu: () => void; onNew: () => void;
}) {
  return (
    <header className={`flex h-14 shrink-0 items-center gap-2 px-3 sm:px-5 ${divider ? "border-b border-[var(--line-soft)]" : ""}`}>
      <button onClick={onMenu} aria-label="Open menu" className="focus-ring -ml-1 rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--hover-2)] hover:text-[var(--ink)] lg:hidden"><Menu size={18} /></button>
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="hidden text-[var(--muted)] sm:inline">Chat</span>
        <ChevronRight size={14} className="hidden text-[var(--faint)] sm:inline" />
        <h1 className="truncate text-sm font-medium">{title}</h1>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {busy && (
          <span className="mr-1 inline-flex items-center gap-2 text-xs text-[var(--muted)]" role="status">
            <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--red)] opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--red)]" /></span>
            Answering
          </span>
        )}
        <button onClick={onNew} disabled={busy} aria-label="New chat" className="focus-ring rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--hover-2)] hover:text-[var(--ink)] disabled:opacity-50 lg:hidden"><Plus size={18} /></button>
      </div>
    </header>
  );
}