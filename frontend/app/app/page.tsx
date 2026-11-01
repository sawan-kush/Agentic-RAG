"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, History, LogOut, Plus, Send, ShieldAlert, ShieldCheck } from "lucide-react";
import KnowledgeBase from "@/components/knowledge-base";
import ConversationsDrawer, { type Conv } from "@/components/conversations-drawer";
import { api, errorText } from "@/lib/api";
import { supabase } from "@/lib/supabase/client";

type Trace = { agent: string; detail: string; ms: number };
type Msg = {
  role: "user" | "ai"; text: string;
  sources?: { docId: string; fileName: string }[]; trace?: Trace[];
  verified?: boolean | null;  // undefined = still working, true/false = verifier result, null = no verifier ran
  corrected?: boolean;        // true if the draft was replaced by a re-checked answer
};

export default function Dashboard() {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [convId, setConvId] = useState<string | null>(null);  // null = a brand-new chat that isn't saved yet
  const [convs, setConvs] = useState<Conv[]>([]);
  const [chatsOpen, setChatsOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest text in view while the answer streams in.
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs]);

  async function refreshList(): Promise<Conv[]> {
    const res = await api("/conversations");
    if (!res.ok) return [];
    const list: Conv[] = await res.json();
    setConvs(list);
    return list;
  }

  async function openConv(id: string) {
    const res = await api(`/conversations/${id}`);
    if (!res.ok) return;
    const c = await res.json();
    setConvId(c.id);
    setMsgs(c.messages.map((m: Msg) => ({ role: m.role, text: m.text, sources: m.sources, trace: m.trace, verified: m.verified })));
    setChatsOpen(false);
  }

  // After a page refresh, reopen the most recently used chat.
  useEffect(() => {
    (async () => { const list = await refreshList(); if (list[0]) await openConv(list[0].id); })();
  }, []);

  function newChat() { if (busy) return; setConvId(null); setMsgs([]); setChatsOpen(false); }

  async function deleteConv(id: string) {
    await api(`/conversations/${id}`, { method: "DELETE" });
    if (id === convId) { setConvId(null); setMsgs([]); }
    refreshList();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || busy) return;
    const query = q; setQ(""); setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: query }, { role: "ai", text: "", trace: [] }]);
    const patch = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

    try {
      const res = await api("/chat", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, conversation_id: convId }) });
      if (!res.ok || !res.body) {
        const msg = await errorText(res);
        if (res.status === 404) setConvId(null);  // that chat no longer exists: the next question starts a new one
        patch((m) => ({ ...m, text: msg }));
        return;
      }

      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop()!;
        for (const l of lines.filter(Boolean)) {
          const ev = JSON.parse(l);
          // One event per line. The backend sends them in this order: trace..., token..., (replace), verified, done
          if (ev.type === "trace") patch((m) => ({ ...m, trace: [...(m.trace ?? []), ev] }));
          else if (ev.type === "token") patch((m) => ({ ...m, text: m.text + ev.text }));           // append a piece of the draft
          else if (ev.type === "replace") patch((m) => ({ ...m, text: ev.text, corrected: m.corrected || ev.text !== "" }));  // overwrite the whole text
          else if (ev.type === "verified") patch((m) => ({ ...m, verified: ev.grounded }));
          else if (ev.type === "done") {
            patch((m) => ({ ...m, sources: ev.sources, verified: m.verified ?? null }));
            if (ev.conversation_id) setConvId(ev.conversation_id);
            refreshList();
          }
        }
      }
    } catch {
      patch((m) => ({ ...m, text: m.text || "Couldn't reach the server. Is the backend running?" }));
    } finally {
      setBusy(false);
    }
  }

  const badge = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs";

  return (
    <div className="mx-auto flex h-screen max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between gap-2 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setChatsOpen(true)} aria-label="Chat history" className="glass rounded-lg p-2"><History size={16} /></button>
          <h1 className="text-lg font-bold">Document Intelligence</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={newChat} disabled={busy} className="glass inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm disabled:opacity-50"><Plus size={16} /><span className="hidden sm:inline">New chat</span></button>
          <button onClick={() => setKbOpen(true)} className="glass inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm"><FileText size={16} /><span className="hidden sm:inline">Knowledge base</span></button>
          <button onClick={signOut} aria-label="Sign out" className="glass inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm"><LogOut size={16} /><span className="hidden sm:inline">Sign out</span></button>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto pb-4" aria-live="polite">
        {msgs.length === 0 && <p className="mt-24 text-center text-[var(--muted)]">Upload a document in your knowledge base, then ask about it here.</p>}
        {msgs.map((m, i) => {
          const last = i === msgs.length - 1;
          // The draft is on screen but the verifier hasn't finished yet.
          const checking = last && busy && m.verified === undefined && !!m.text && !!m.trace?.some((t) => t.agent === "Retriever");
          return m.role === "user"
            ? <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl bg-[var(--red)] px-4 py-2">{m.text}</p>
            : <div key={i} className="glass rounded-2xl p-4">
                {m.trace?.length ? <ol className="mb-3 space-y-1 border-l-2 border-[var(--red)] pl-3 text-xs text-[var(--muted)]">
                  {m.trace.map((t, j) => <li key={j}><b className="text-[var(--ink)]">{t.agent}</b> {t.detail} ({t.ms} ms)</li>)}
                </ol> : null}
                <p className="whitespace-pre-wrap">{m.text || (busy && last ? "Working…" : "")}</p>
                {checking && <p className="mt-2 text-xs text-[var(--muted)]">Draft: checking it against your documents…</p>}
                {m.verified === true && <span className={`${badge} mt-3 border-green-500/40 text-green-400`}><ShieldCheck size={12} />Verified against your documents{m.corrected ? " (corrected after re-check)" : ""}</span>}
                {m.verified === false && <span className={`${badge} mt-3 border-amber-500/40 text-amber-400`}><ShieldAlert size={12} />Could not fully verify this answer</span>}
                {m.sources?.length ? <div className="mt-3 flex flex-wrap gap-2">
                  {m.sources.map((s) => <button key={s.docId} onClick={() => { setOpenDoc(s.docId); setKbOpen(true); }} className="rounded-full border border-[var(--line)] px-3 py-1 text-xs hover:border-[var(--red)]">{s.fileName}</button>)}
                </div> : null}
              </div>;
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={ask} className="glass mb-4 flex gap-2 rounded-2xl p-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={2000} placeholder="Ask about your documents" className="flex-1 bg-transparent px-3 outline-none" />
        <button disabled={busy} aria-label="Send" className="rounded-xl bg-[var(--red)] p-3 disabled:opacity-50"><Send size={16} /></button>
      </form>

      <KnowledgeBase open={kbOpen} onClose={() => { setKbOpen(false); setOpenDoc(null); }} initialDocId={openDoc} />
      <ConversationsDrawer open={chatsOpen} onClose={() => setChatsOpen(false)} items={convs} activeId={convId} busy={busy}
        onSelect={openConv} onNew={newChat} onDelete={deleteConv} />
    </div>
  );
}