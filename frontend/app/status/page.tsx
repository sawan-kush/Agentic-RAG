"use client";
import { useEffect, useState } from "react";
import PageShell from "@/components/page-shell";

type State = { kind: "checking" } | { kind: "up"; ms: number } | { kind: "down"; reason: string };

export default function Status() {
  const [state, setState] = useState<State>({ kind: "checking" });

  // Runs in the visitor's browser: it calls the backend's /health route directly.
  async function check() {
    setState({ kind: "checking" });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);  // give up after 6 seconds
    const started = performance.now();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`, { signal: controller.signal, cache: "no-store" });
      const body = await res.json();
      if (res.ok && body.ok) setState({ kind: "up", ms: Math.round(performance.now() - started) });
      else setState({ kind: "down", reason: `The server answered, but reported a problem (status ${res.status}).` });
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "AbortError";
      setState({ kind: "down", reason: timedOut ? "The server didn’t answer within 6 seconds." : "The server couldn’t be reached." });
    } finally {
      clearTimeout(timer);
    }
  }
  useEffect(() => { check(); }, []);

  const dot = state.kind === "up" ? "bg-green-500" : state.kind === "down" ? "bg-red-500" : "bg-[var(--muted)]";
  return (
    <PageShell title="Status">
      <div role="status" className="glass flex items-center gap-4 rounded-2xl p-6">
        <i className={`h-3 w-3 shrink-0 rounded-full ${dot}`} />
        <div>
          <p className="text-lg font-semibold">
            {state.kind === "checking" ? "Checking the backend…" : state.kind === "up" ? "Backend is up" : "Backend is down"}
          </p>
          <p className="text-sm text-[var(--muted)]">
            {state.kind === "up" ? `Responded in ${state.ms} ms.` : state.kind === "down" ? `${state.reason} Try again in a minute.` : "One moment."}
          </p>
        </div>
      </div>
      <button onClick={check} disabled={state.kind === "checking"} className="focus-ring rounded-full border border-[var(--line-strong)] bg-[var(--panel)] px-5 py-2 text-sm font-medium shadow-[var(--shadow-sm)] hover:border-[var(--ink-2)] disabled:opacity-50">Check again</button>
      <p className="text-sm text-[var(--muted)]">This only checks the app’s own server. The AI services it relies on (Gemini, Groq, Pinecone, Supabase) have their own status pages.</p>
    </PageShell>
  );
}