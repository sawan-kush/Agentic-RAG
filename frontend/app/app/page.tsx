"use client";
import { useState } from "react";
import { FileText, Send } from "lucide-react";
import KnowledgeBase from "@/components/knowledge-base";
import { api } from "@/lib/api";

type Trace = { agent: string; detail: string; ms: number };
type Msg = { role: "user" | "ai"; text: string; sources?: { docId: string; fileName: string }[]; trace?: Trace[] };

export default function Dashboard() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || busy) return;
    const query = q; setQ(""); setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: query }, { role: "ai", text: "", trace: [] }]);

    const res = await api("/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
    const reader = res.body!.getReader(); const dec = new TextDecoder(); let buf = "";
    const patch = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop()!;
      for (const l of lines.filter(Boolean)) {
        const ev = JSON.parse(l);
        if (ev.type === "trace") patch((m) => ({ ...m, trace: [...(m.trace ?? []), ev] }));
        else patch((m) => ({ ...m, text: ev.text, sources: ev.sources }));
      }
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto flex h-screen max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between py-4">
        <h1 className="text-lg font-bold">Document Intelligence</h1>
        <button onClick={() => setKbOpen(true)} className="glass inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm"><FileText size={16} />Knowledge base</button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto pb-4" aria-live="polite">
        {msgs.length === 0 && <p className="mt-24 text-center text-[var(--muted)]">Upload a document in your knowledge base, then ask about it here.</p>}
        {msgs.map((m, i) => m.role === "user"
          ? <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl bg-[var(--red)] px-4 py-2">{m.text}</p>
          : <div key={i} className="glass rounded-2xl p-4">
              {m.trace?.length ? <ol className="mb-3 space-y-1 border-l-2 border-[var(--red)] pl-3 text-xs text-[var(--muted)]">
                {m.trace.map((t, j) => <li key={j}><b className="text-[var(--ink)]">{t.agent}</b> {t.detail} ({t.ms} ms)</li>)}
              </ol> : null}
              <p className="whitespace-pre-wrap">{m.text || (busy && i === msgs.length - 1 ? "Working…" : "")}</p>
              {m.sources?.length ? <div className="mt-3 flex flex-wrap gap-2">
                {m.sources.map((s) => <button key={s.docId} onClick={() => { setOpenDoc(s.docId); setKbOpen(true); }} className="rounded-full border border-[var(--line)] px-3 py-1 text-xs hover:border-[var(--red)]">{s.fileName}</button>)}
              </div> : null}
            </div>)}
      </div>

      <form onSubmit={ask} className="glass mb-4 flex gap-2 rounded-2xl p-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your documents" className="flex-1 bg-transparent px-3 outline-none" />
        <button disabled={busy} aria-label="Send" className="rounded-xl bg-[var(--red)] p-3 disabled:opacity-50"><Send size={16} /></button>
      </form>

      <KnowledgeBase open={kbOpen} onClose={() => { setKbOpen(false); setOpenDoc(null); }} initialDocId={openDoc} />
    </div>
  );
}
