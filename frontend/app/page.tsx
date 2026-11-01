import Link from "next/link";
import { Route, Search, ShieldCheck, Zap } from "lucide-react";

const features = [
  { icon: Route, title: "Agentic router", text: "Each question goes to the right tool: chat, document metadata, or search." },
  { icon: Search, title: "Hybrid search", text: "Meaning-based and keyword search, combined, over every chunk of every file you upload." },
  { icon: ShieldCheck, title: "Checked answers", text: "A verifier compares each answer with the source text before you see it." },
  { icon: Zap, title: "Ready in seconds", text: "Drop in PDFs, TXT or Markdown and start asking." },
];

export default function Landing() {
  return (
    <main className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[720px] -translate-x-1/2 rounded-full bg-[var(--red)]/25 blur-[140px]" />
      <section className="relative mx-auto max-w-4xl px-6 pb-24 pt-32 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-7xl">Precision Document Intelligence</h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-[var(--muted)]">Ask questions across your own documents and get answers that cite the file they came from.</p>
        <div className="mt-10 flex justify-center gap-3">
          <Link href="/auth?mode=signup" className="rounded-lg bg-[var(--red)] px-6 py-3 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Get started</Link>
          <Link href="/auth" className="glass rounded-lg px-6 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Sign in</Link>
        </div>
        <dl className="mt-16 flex justify-center gap-12 text-left">
          <div><dt className="text-sm text-[var(--muted)]">Answers checked against sources</dt><dd className="text-3xl font-bold">100%</dd></div>
          <div><dt className="text-sm text-[var(--muted)]">Query routing time</dt><dd className="text-3xl font-bold">&lt;500 ms</dd></div>
        </dl>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-2">
        {features.map(({ icon: I, title, text }) => (
          <article key={title} className="glass rounded-2xl p-6">
            <I className="mb-4 text-[var(--red)]" />
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-2 text-[var(--muted)]">{text}</p>
          </article>
        ))}
      </section>
      <footer className="border-t border-[var(--line)] px-6 py-8 text-sm text-[var(--muted)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <nav className="flex gap-6"><Link href="/docs">Docs</Link><Link href="/privacy">Privacy</Link><Link href="/status">Status</Link></nav>
          <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-green-500" />All systems operational</span>
        </div>
      </footer>
    </main>
  );
}