"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileText, Loader2, Menu, Trash2, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase/client";
import { api, errorText } from "@/lib/api";

// `content` is loaded only when you open a text document (it can be large), so it is optional here.
type Doc = { id: string; file_name: string; created_at: string; chunk_count: number; mime: string; storage_path: string; content?: string };

// These mirror the limits in backend/app/ingestion.py. The backend is the real check;
// having them here just lets us show a friendly message without uploading first.
const MAX_MB = 10, MAX_DOCS = 20, EXTENSIONS = [".pdf", ".txt", ".md"];

const isPdf = (d: Doc) => d.mime === "application/pdf";
const kind = (d: Doc) => (isPdf(d) ? "PDF" : (d.file_name.split(".").pop() ?? "").toUpperCase() || "TEXT");
const chunks = (n: number) => `${n} chunk${n === 1 ? "" : "s"}`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const iconBtn = "focus-ring rounded-lg p-2 text-[var(--muted)] transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--ink)]";

// The knowledge base now fills the main workspace (it used to be a side drawer).
// It still only loads data while `open` is true.
export default function KnowledgeBase({ open, onClose, initialDocId, onMenu }: {
  open: boolean; onClose: () => void; initialDocId?: string | null; onMenu?: () => void;
}) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Doc | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);   // which row is asking "Delete?"
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const consumed = useRef<string | null>(null);  // so a source button only auto-opens its document once

  const load = async () => {
    const { data } = await supabase.from("documents").select("id,file_name,created_at,chunk_count,mime,storage_path")
      .order("created_at", { ascending: false });
    setDocs(data ?? []); setLoading(false);
  };
  useEffect(() => { if (open) load(); else { setActive(null); consumed.current = null; } }, [open]);
  useEffect(() => {
    if (!initialDocId) { consumed.current = null; return; }
    if (!open || consumed.current === initialDocId) return;
    const d = docs.find((x) => x.id === initialDocId);
    if (d) { consumed.current = initialDocId; setActive(d); }
  }, [open, initialDocId, docs]);

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

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    if (uploading) return;
    const files = e.dataTransfer.files;
    if (files.length > 1) return setError("Please drop one file at a time.");
    if (files[0]) upload(files[0]);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.section key="kb" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          className="flex min-h-0 flex-1 flex-col bg-[var(--bg)]">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--line-soft)] px-3 sm:px-5">
            {onMenu && <button onClick={onMenu} aria-label="Open menu" className={`${iconBtn} -ml-1 lg:hidden`}><Menu size={18} /></button>}
            {active ? (
              <>
                <button onClick={() => setActive(null)} className="focus-ring -ml-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--ink)]">
                  <ArrowLeft size={15} /><span className="hidden sm:inline">Back to list</span>
                </button>
                <span aria-hidden className="h-4 w-px bg-[var(--line)]" />
                <h1 className="min-w-0 truncate text-sm font-medium">{active.file_name}</h1>
                <span className="shrink-0 rounded-md border border-[var(--line)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">{kind(active)}</span>
              </>
            ) : (
              <div className="flex min-w-0 items-baseline gap-3">
                <h1 className="text-sm font-medium">Knowledge base</h1>
                <span className="text-xs tabular-nums text-[var(--faint)]">{docs.length}/{MAX_DOCS} documents</span>
              </div>
            )}
            <button onClick={onClose} aria-label="Back to chat" title="Back to chat" className={`${iconBtn} ml-auto`}><X size={18} /></button>
          </header>

          {active ? (
            <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-5">
              {isPdf(active)
                ? (pdfUrl
                  ? <iframe src={pdfUrl} title={active.file_name} className="h-full w-full flex-1 rounded-xl border border-[var(--line)] bg-white" />
                  : <p className="m-auto flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 size={14} className="animate-spin" />Loading preview…</p>)
                : (
                  <div className="scroll-thin mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-8">
                    {active.content === undefined
                      ? <p className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 size={14} className="animate-spin" />Loading…</p>
                      : <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[var(--ink-2)]">{active.content}</pre>}
                  </div>
                )}
            </div>
          ) : (
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
                <p className="text-sm leading-relaxed text-[var(--muted)]">Files you add here are indexed so the assistant can search them and cite the source in its answers.</p>

                <label onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
                  className={`flex cursor-pointer items-center gap-4 rounded-xl border border-dashed p-4 transition-colors focus-within:border-[var(--red-ring)] sm:p-5 ${dragging ? "border-[var(--red)] bg-[var(--red-soft)]" : "border-[var(--line-strong)] bg-[var(--panel)] hover:border-[var(--red-ring)] hover:bg-[var(--red-soft)]"} ${uploading ? "cursor-wait opacity-80" : ""}`}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--tint)] text-[var(--ink-2)]">
                    {uploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{uploading ? "Indexing…" : dragging ? "Drop to upload" : "Drop a file here, or click to browse"}</span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">PDF, TXT or MD · up to {MAX_MB} MB each · {docs.length}/{MAX_DOCS} documents</span>
                  </span>
                  <input type="file" accept=".pdf,.txt,.md" className="sr-only" disabled={uploading}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
                </label>

                {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

                {loading ? (
                  <ul className="divide-y divide-[var(--line-soft)] overflow-hidden rounded-xl border border-[var(--line)]" aria-hidden>
                    {[0, 1, 2].map((i) => <li key={i} className="flex items-center gap-3 px-4 py-3.5"><span className="h-9 w-9 animate-pulse rounded-lg bg-[var(--hover)]" /><span className="h-3 w-1/3 animate-pulse rounded bg-[var(--hover)]" /></li>)}
                  </ul>
                ) : docs.length === 0 ? (
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-6 py-12 text-center">
                    <FileText size={22} className="mx-auto text-[var(--faint)]" />
                    <p className="mt-3 text-sm font-medium">No documents yet</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">Upload a file above to start asking questions about it.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-[var(--line-soft)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow-sm)]">
                    {docs.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--hover)]">
                        {/* The row is NOT one big button, because a delete button can't live inside another button. */}
                        <button onClick={() => setActive(d)} className="focus-ring -m-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left">
                          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${isPdf(d) ? "bg-[var(--red-soft)] text-[var(--red)]" : "bg-[var(--hover-2)] text-[var(--muted)]"}`}><FileText size={16} /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{d.file_name}</span>
                            <span className="mt-0.5 block text-xs text-[var(--muted)]">{fmtDate(d.created_at)}<span className="sm:hidden"> · {chunks(d.chunk_count)}</span></span>
                          </span>
                        </button>
                        <span className="hidden shrink-0 text-xs tabular-nums text-[var(--muted)] sm:block">{chunks(d.chunk_count)}</span>
                        <span className="shrink-0 rounded-md border border-[var(--line)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">{kind(d)}</span>
                        {confirmId === d.id ? (
                          <span className="flex shrink-0 items-center gap-1 text-xs">
                            <button onClick={() => remove(d.id)} disabled={deletingId === d.id} className="focus-ring rounded-md bg-[var(--red)] px-2.5 py-1.5 font-medium text-white hover:bg-[var(--red-hover)] disabled:opacity-50">{deletingId === d.id ? "Deleting…" : "Delete"}</button>
                            <button onClick={() => setConfirmId(null)} disabled={deletingId === d.id} className="focus-ring rounded-md px-2 py-1.5 text-[var(--muted)] hover:text-[var(--ink)]">Cancel</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmId(d.id)} aria-label={`Delete ${d.file_name}`} className="focus-ring shrink-0 rounded-lg p-2 text-[var(--faint)] transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--red)]"><Trash2 size={15} /></button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}