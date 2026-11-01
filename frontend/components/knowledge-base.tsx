"use client";
import { useEffect, useState } from "react";
import { FileText, Trash2, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase/client";
import { api, errorText } from "@/lib/api";

// `content` is loaded only when you open a text document (it can be large), so it is optional here.
type Doc = { id: string; file_name: string; created_at: string; chunk_count: number; mime: string; storage_path: string; content?: string };

// These mirror the limits in backend/app/ingestion.py. The backend is the real check;
// having them here just lets us show a friendly message without uploading first.
const MAX_MB = 10, MAX_DOCS = 20, EXTENSIONS = [".pdf", ".txt", ".md"];

export default function KnowledgeBase({ open, onClose, initialDocId }: { open: boolean; onClose: () => void; initialDocId?: string | null }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [active, setActive] = useState<Doc | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);   // which row is asking "Delete?"
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("documents").select("id,file_name,created_at,chunk_count,mime,storage_path")
      .order("created_at", { ascending: false });
    setDocs(data ?? []);
  };
  useEffect(() => { if (open) load(); }, [open]);
  useEffect(() => { if (initialDocId) setActive(docs.find((d) => d.id === initialDocId) ?? null); }, [initialDocId, docs]);

  // Signed URL for PDF preview (the bucket is private)
  useEffect(() => {
    setPdfUrl(null);
    if (active?.mime === "application/pdf")
      supabase.storage.from("documents").createSignedUrl(active.storage_path, 3600).then(({ data }) => setPdfUrl(data?.signedUrl ?? null));
  }, [active]);

  // Text documents: fetch the extracted text only when the document is opened.
  useEffect(() => {
    if (!active || active.mime === "application/pdf" || active.content !== undefined) return;
    supabase.from("documents").select("content").eq("id", active.id).single()
      .then(({ data }) => setActive((a) => (a && a.id === active.id ? { ...a, content: data?.content ?? "" } : a)));
  }, [active]);

  async function upload(f: File) {
    setError("");
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!EXTENSIONS.includes(ext)) return setError("Only PDF, TXT and MD files are supported.");
    if (f.size > MAX_MB * 1024 * 1024) return setError(`That file is ${(f.size / 1048576).toFixed(1)} MB. The limit is ${MAX_MB} MB.`);
    if (docs.length >= MAX_DOCS) return setError(`You have reached the limit of ${MAX_DOCS} documents. Delete one to upload another.`);

    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const res = await api("/ingest", { method: "POST", body: fd });
      if (!res.ok) setError(await errorText(res));   // e.g. scanned PDF, rate limit, limit reached
    } catch {
      setError("Couldn't reach the server. Is the backend running?");
    } finally {
      setUploading(false); load();
    }
  }

  async function remove(id: string) {
    setDeletingId(id); setError("");
    try {
      const res = await api(`/documents/${id}`, { method: "DELETE" });
      if (!res.ok) setError(await errorText(res));
    } catch {
      setError("Couldn't reach the server. Is the backend running?");
    } finally {
      setDeletingId(null); setConfirmId(null); load();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-[var(--line)] bg-[var(--panel)]">
          <header className="flex items-center justify-between border-b border-[var(--line)] p-4">
            <h2 className="font-semibold">{active ? active.file_name : "Knowledge base"}</h2>
            <div className="flex gap-3">
              {active && <button onClick={() => setActive(null)} className="text-sm text-[var(--muted)]">Back to list</button>}
              <button onClick={onClose} aria-label="Close"><X /></button>
            </div>
          </header>

          {active ? (
            <div className="flex-1 overflow-auto p-4">
              {pdfUrl
                ? <iframe src={pdfUrl} title={active.file_name} className="h-full min-h-[75vh] w-full rounded-lg bg-white" />
                : <pre className="whitespace-pre-wrap text-sm leading-relaxed">{active.content}</pre>}
            </div>
          ) : (
            <div className="flex-1 space-y-3 overflow-auto p-4">
              <label className="glass flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-dashed p-6 text-[var(--muted)]">
                <span className="inline-flex items-center gap-2"><Upload size={18} />{uploading ? "Indexing…" : "Upload PDF, TXT or MD"}</span>
                <span className="text-xs">{docs.length}/{MAX_DOCS} documents · up to {MAX_MB} MB each</span>
                <input type="file" accept=".pdf,.txt,.md" hidden disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
              </label>
              {error && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-400">{error}</p>}
              {docs.length === 0 && <p className="text-center text-[var(--muted)]">No documents yet.</p>}
              {docs.map((d) => (
                <div key={d.id} className="glass flex w-full items-center gap-3 rounded-xl p-4 hover:border-[var(--red)]">
                  {/* The row is NOT one big button, because a delete button can't live inside another button. */}
                  <button onClick={() => setActive(d)} className="flex flex-1 items-center gap-3 text-left">
                    <FileText className="text-[var(--red)]" />
                    <span className="flex-1">
                      <span className="block font-medium">{d.file_name}</span>
                      <span className="text-xs text-[var(--muted)]">{new Date(d.created_at).toLocaleDateString()} · {d.chunk_count} chunks</span>
                    </span>
                    <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs">{d.mime === "application/pdf" ? "PDF" : "Text"}</span>
                  </button>
                  {confirmId === d.id ? (
                    <span className="flex items-center gap-2 text-sm">
                      <span className="text-[var(--muted)]">Delete?</span>
                      <button onClick={() => remove(d.id)} disabled={deletingId === d.id} className="rounded-md bg-[var(--red)] px-2 py-1 text-white disabled:opacity-50">{deletingId === d.id ? "Deleting…" : "Yes"}</button>
                      <button onClick={() => setConfirmId(null)} disabled={deletingId === d.id} className="text-[var(--muted)]">No</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmId(d.id)} aria-label={`Delete ${d.file_name}`} className="text-[var(--muted)] hover:text-[var(--red)]"><Trash2 size={16} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}