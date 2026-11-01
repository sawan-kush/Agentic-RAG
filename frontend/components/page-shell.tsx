import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Shared layout for the plain content pages (/docs, /privacy, /status).
export default function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--ink)]"><ArrowLeft size={14} />Home</Link>
      <h1 className="mt-6 text-4xl font-extrabold tracking-tight">{title}</h1>
      <div className="mt-8 space-y-8 leading-relaxed">{children}</div>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="space-y-3 text-[var(--muted)] [&_b]:text-[var(--ink)] [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5">{children}</div>
    </section>
  );
}