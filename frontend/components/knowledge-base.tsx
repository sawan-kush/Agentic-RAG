"use client";
import { useEffect, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase/client";
import { api } from "@/lib/api";

type Doc = { id: string; file_name: string; created_at: string; chunk_count: number; mime: string; storage_path: string; content: string };

export default function KnowledgeBase({ open, onClose, initialDocId }: { open: boolean; onClose: () => void; initialDocId?: string | null }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [active, setActive] = useState<Doc | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
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

  async function upload(f: File) {
    setUploading(true);
    const fd = new FormData(); fd.append("file", f);
    await api("/ingest", { method: "POST", body: fd });
    setUploading(false); load();
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
              <label className="glass flex cursor-pointer items-center justify-center gap-2 rounded-xl border-dashed p-6 text-[var(--muted)]">
                <Upload size={18} />{uploading ? "Indexing…" : "Upload PDF, TXT or MD"}
                <input type="file" accept=".pdf,.txt,.md" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
              {docs.length === 0 && <p className="text-center text-[var(--muted)]">No documents yet.</p>}
              {docs.map((d) => (
                <button key={d.id} onClick={() => setActive(d)} className="glass flex w-full items-center gap-3 rounded-xl p-4 text-left hover:border-[var(--red)]">
                  <FileText className="text-[var(--red)]" />
                  <span className="flex-1">
                    <span className="block font-medium">{d.file_name}</span>
                    <span className="text-xs text-[var(--muted)]">{new Date(d.created_at).toLocaleDateString()} · {d.chunk_count} chunks</span>
                  </span>
                  <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs">{d.mime === "application/pdf" ? "PDF" : "Text"}</span>
                </button>
              ))}
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
