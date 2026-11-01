"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppSidebar from "@/components/app-sidebar";
import ChatHeader from "@/components/chat-header";
import ChatInput from "@/components/chat-input";
import EmptyChatState from "@/components/empty-chat-state";
import MessageList from "@/components/message-list";
import KnowledgeBase from "@/components/knowledge-base";
import type { Conv, Msg } from "@/components/chat-types";
import { api, errorText } from "@/lib/api";
import { supabase } from "@/lib/supabase/client";

export default function Dashboard() {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"chat" | "kb">("chat");   // which screen fills the workspace
  const [navOpen, setNavOpen] = useState(false);              // mobile sidebar
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [convId, setConvId] = useState<string | null>(null);  // null = a brand-new chat that isn't saved yet
  const [convs, setConvs] = useState<Conv[]>([]);
  const [email, setEmail] = useState("");

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? "")); }, []);

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
    setView("chat"); setNavOpen(false);
  }

  // After a page refresh, reopen the most recently used chat.
  useEffect(() => {
    (async () => { const list = await refreshList(); if (list[0]) await openConv(list[0].id); })();
  }, []);

  function newChat() { if (busy) return; setConvId(null); setMsgs([]); setView("chat"); setNavOpen(false); }

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

  function openKb(docId: string | null = null) { setOpenDoc(docId); setView("kb"); setNavOpen(false); }
  function closeKb() { setView("chat"); setOpenDoc(null); }

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

  const empty = msgs.length === 0;
  const title = convs.find((c) => c.id === convId)?.title ?? (empty ? "New chat" : "New conversation");
  const input = <ChatInput value={q} onChange={setQ} onSubmit={ask} busy={busy} onOpenKb={() => openKb()} />;

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      <AppSidebar convs={convs} activeId={convId} busy={busy} view={view} email={email}
        mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)}
        onSelect={openConv} onNew={newChat} onDelete={deleteConv} onOpenKb={() => openKb()} onSignOut={signOut} />

      <main className="relative flex min-w-0 flex-1 flex-col">
        {empty && view === "chat" && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[440px]"
            style={{ background: "radial-gradient(55% 60% at 50% 0%, var(--red-soft), transparent 70%)" }} />
        )}
        {/* The chat stays mounted while the knowledge base is open, so a streaming answer keeps going. */}
        <div className={`relative min-h-0 flex-1 flex-col ${view === "kb" ? "hidden" : "flex"}`}>
          <ChatHeader title={title} busy={busy} divider={!empty} onMenu={() => setNavOpen(true)} onNew={newChat} />
          {empty ? (
            <EmptyChatState onOpenKb={() => openKb()}>{input}</EmptyChatState>
          ) : (
            <>
              <MessageList msgs={msgs} busy={busy} visible={view === "chat"} onOpenSource={(id) => openKb(id)} />
              <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
                <div className="mx-auto w-full max-w-3xl">{input}</div>
              </div>
            </>
          )}
        </div>

        <KnowledgeBase open={view === "kb"} onClose={closeKb} initialDocId={openDoc} onMenu={() => setNavOpen(true)} />
      </main>
    </div>
  );
}