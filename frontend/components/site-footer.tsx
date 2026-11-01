import Link from "next/link";
import Logo from "./logo";

export default function SiteFooter() {
  return (
    <footer className="border-t border-[var(--line)] bg-[var(--sidebar)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-8 px-6 py-10">
        <div className="max-w-xs">
          <Logo size={24} />
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">An Agentic RAG System for Intelligent Knowledge Retrieval.</p>
        </div>
        <div className="flex flex-col items-start gap-4 text-sm text-[var(--muted)] sm:items-end">
          <nav aria-label="Footer" className="flex gap-6">
            <Link href="/docs" className="hover:text-[var(--ink)]">Docs</Link>
            <Link href="/privacy" className="hover:text-[var(--ink)]">Privacy</Link>
            <Link href="/status" className="hover:text-[var(--ink)]">Status</Link>
          </nav>
          <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-green-500" />All systems operational</span>
        </div>
      </div>
    </footer>
  );
}