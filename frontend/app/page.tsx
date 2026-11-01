import Link from "next/link";
import { ArrowRight, ArrowUpRight, FileText, MessageSquare, Route, Search, ShieldCheck, Upload, Zap } from "lucide-react";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import { LogoMark } from "@/components/logo";

const features = [
  { icon: Route, title: "Agentic router", text: "Each question goes to the right tool: chat, document metadata, or search." },
  { icon: Search, title: "Hybrid search", text: "Meaning-based and keyword search, combined, over every chunk of every file you upload." },
  { icon: ShieldCheck, title: "Checked answers", text: "A verifier compares each answer with the source text before you see it." },
  { icon: Zap, title: "Ready in seconds", text: "Drop in PDFs, TXT or Markdown and start asking." },
];

const steps = [
  { icon: Upload, title: "Upload", text: "Add PDF, TXT or Markdown files to your knowledge base. Cognix indexes them for search." },
  { icon: MessageSquare, title: "Ask", text: "Ask in plain language. The router picks the right tool: chat, document metadata, or search." },
  { icon: ShieldCheck, title: "Verify", text: "A verifier checks the draft against the source passages, and each answer names the files it came from." },
];

const stats = [
  { value: "100%", label: "Answers checked against sources" },
  { value: "<500 ms", label: "Query routing time" },
  { value: "3", label: "File types: PDF, TXT, MD" },
  { value: "20", label: "Documents per account, 10 MB each" },
];

const btnDark = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-[#2c271f] focus-ring";
const btnLight = "inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--panel)] px-6 py-3 text-[15px] font-medium text-[var(--ink)] shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--ink-2)] focus-ring";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="dots absolute inset-0"
            style={{ WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 30% 35%, #000 10%, transparent 75%)", maskImage: "radial-gradient(ellipse 70% 60% at 30% 35%, #000 10%, transparent 75%)" }} />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:pb-28 lg:pt-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--muted)] shadow-[var(--shadow-sm)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--red)]" />Agentic RAG · Intelligent knowledge retrieval
              </span>
              <h1 className="font-display mt-6 text-[44px] leading-[1.03] sm:text-6xl lg:text-[76px]">
                Intelligent answers from your own <em className="text-[var(--red)]">knowledge.</em>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--muted)]">
                Cognix is an agentic RAG system for intelligent knowledge retrieval. Upload your documents, ask in plain language, and get answers checked against the source.
              </p>
              <ul className="mt-7 space-y-3 text-[15px] text-[var(--ink-2)]">
                {["Hybrid search by meaning and keyword, across every file", "A verifier checks each answer against your documents", "Every answer cites the files it came from"].map((t) => (
                  <li key={t} className="flex items-start gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--red)]" />{t}</li>
                ))}
              </ul>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/auth?mode=signup" className={btnDark}>Get started<ArrowRight size={16} /></Link>
                <Link href="/#how" className={btnLight}>See how it works</Link>
              </div>
            </div>

            {/* Product preview (illustrative) */}
            <div>
              <div className="rounded-[28px] p-5 sm:p-8" style={{ background: "linear-gradient(140deg, #e8f0f6 0%, #f3efe4 100%)" }}>
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow-md)]">
                  <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-3.5">
                    <span className="flex items-center gap-2.5 text-sm font-medium"><LogoMark size={18} />Cognix</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20"><ShieldCheck size={11} />Verified</span>
                  </div>
                  <div className="space-y-4 p-5">
                    <p className="rounded-xl bg-[var(--bg)] px-4 py-3 text-[13px] text-[var(--ink-2)]">What notice period applies if we terminate the vendor agreement?</p>
                    <p className="text-[15px] leading-relaxed">
                      <b className="font-semibold">Thirty days’ written notice</b><sup className="text-[var(--red)]">1</sup> is required, extended to sixty days when the term is renewing<sup className="text-[var(--red)]">2</sup>.
                    </p>
                    <p className="text-xs text-[var(--faint)]">Router → Retriever → Verifier · 3 steps</p>
                    <ul className="space-y-2">
                      {[["vendor-agreement.pdf", "Termination · page 4"], ["renewal-terms.md", "Section 2"]].map(([n, m], i) => (
                        <li key={n} className="flex items-center gap-3 rounded-xl border border-[var(--line)] px-3.5 py-2.5">
                          <span className="text-xs text-[var(--faint)]">{i + 1}</span>
                          <FileText size={15} className="shrink-0 text-[var(--red)]" />
                          <span className="min-w-0 flex-1 leading-tight"><span className="block truncate text-[13px] font-medium">{n}</span><span className="block text-[11px] text-[var(--faint)]">{m}</span></span>
                          <ArrowUpRight size={14} className="text-[var(--faint)]" />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-[var(--faint)]">Illustrative example</p>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section aria-label="Cognix at a glance" className="mx-auto max-w-6xl px-6">
          <dl className="grid grid-cols-2 divide-x divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow-sm)] lg:grid-cols-4 lg:divide-y-0">
            {stats.map((s) => (
              <div key={s.label} className="px-6 py-7 text-center">
                <dd className="font-display text-4xl sm:text-5xl">{s.value}</dd>
                <dt className="mt-2 text-xs leading-snug text-[var(--muted)] sm:text-sm">{s.label}</dt>
              </div>
            ))}
          </dl>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24 lg:py-32">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--red)]">Capabilities</p>
          <h2 className="font-display mt-4 max-w-2xl text-4xl sm:text-5xl">Built to retrieve, not to guess.</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {features.map(({ icon: I, title, text }) => (
              <article key={title} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-7 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--tint)] text-[var(--ink-2)]"><I size={19} /></span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 leading-relaxed text-[var(--muted)]">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 border-y border-[var(--line)] bg-[var(--sidebar)]">
          <div className="mx-auto max-w-6xl px-6 py-24 lg:py-32">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--red)]">How it works</p>
            <h2 className="font-display mt-4 max-w-2xl text-4xl sm:text-5xl">From a pile of files to a checked answer.</h2>
            <ol className="mt-14 grid gap-10 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className="border-t border-[var(--ink)] pt-6">
                  <span className="font-display text-3xl text-[var(--faint)]">0{i + 1}</span>
                  <h3 className="mt-4 flex items-center gap-2.5 text-lg font-semibold tracking-tight"><s.icon size={18} className="text-[var(--red)]" />{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-[var(--muted)]">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="rounded-[28px] px-6 py-16 text-center sm:px-12" style={{ background: "linear-gradient(140deg, #e8f0f6 0%, #f3efe4 100%)" }}>
            <h2 className="font-display mx-auto max-w-2xl text-4xl sm:text-5xl">Start asking your documents.</h2>
            <p className="mx-auto mt-4 max-w-md text-[var(--muted)]">Create an account, upload a file, and get your first cited answer in minutes.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/auth?mode=signup" className={btnDark}>Get started<ArrowRight size={16} /></Link>
              <Link href="/auth" className={btnLight}>Sign in</Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}