import SiteHeader from "./site-header";
import SiteFooter from "./site-footer";

// Shared layout for the plain content pages (/docs, /privacy, /status).
export default function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <h1 className="font-display text-5xl sm:text-6xl">{title}</h1>
        <div className="mt-10 space-y-10 leading-relaxed">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-[var(--line)] pt-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-[var(--muted)] [&_b]:font-medium [&_b]:text-[var(--ink)] [&_a]:text-[var(--ink)] [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5">{children}</div>
    </section>
  );
}