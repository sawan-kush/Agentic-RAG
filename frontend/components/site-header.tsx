import Link from "next/link";
import Logo from "./logo";

// Top navigation for the public pages (home, docs, privacy, status).
export default function SiteHeader() {
  const link = "rounded-full px-3.5 py-2 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]";
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line-soft)] backdrop-blur" style={{ background: "rgba(250,248,245,.88)" }}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <Link href="/" aria-label="Cognix home" className="rounded-lg focus-ring"><Logo /></Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <Link href="/#features" className={link}>Features</Link>
          <Link href="/#how" className={link}>How it works</Link>
          <Link href="/docs" className={link}>Docs</Link>
          <Link href="/status" className={link}>Status</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/auth" className="rounded-full px-3.5 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--hover)] focus-ring">Sign in</Link>
          <Link href="/auth?mode=signup" className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2c271f] focus-ring">Get started</Link>
        </div>
      </div>
    </header>
  );
}