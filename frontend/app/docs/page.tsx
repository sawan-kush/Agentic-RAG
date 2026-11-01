import Link from "next/link";
import PageShell, { Section } from "@/components/page-shell";

export const metadata = { title: "Docs · Precision Document Intelligence" };

export default function Docs() {
  return (
    <PageShell title="Docs">
      <Section title="What this app does">
        <p>You upload your own documents, then ask questions in plain language. Answers are written from your documents and show which file they came from.</p>
      </Section>

      <Section title="How a question is answered">
        <p>Three small AI agents work in order. You can see what each one did in the grey trace above every answer.</p>
        <ol>
          <li><b>Router</b> decides what kind of question it is: general chat, a question about your files (names, counts, dates), or a question about what is <i>inside</i> your files.</li>
          <li><b>Retriever</b> searches your documents in two ways at once: by meaning (finds text that says the same thing in different words) and by keywords (finds exact terms like names or codes). It merges both result lists and keeps the best passages. Only your own documents are searched.</li>
          <li><b>Verifier</b> checks the written answer against those passages. If it finds claims the passages don’t support, the app searches wider and writes the answer again once.</li>
        </ol>
        <p>The answer appears word by word as a <b>draft</b> and is checked right after. A green badge means the check passed. If the draft needed fixing, it is replaced by the corrected answer and the badge says so. An amber badge means the check could not confirm the answer, so double-check it in the source.</p>
      </Section>

      <Section title="Quick start">
        <ol>
          <li>Create an account or sign in.</li>
          <li>Click <b>Knowledge base</b>, then upload a PDF, TXT or MD file. Wait until it says it is indexed.</li>
          <li>Ask a question. Follow-up questions work too (“and what about the second one?”).</li>
          <li>Click a file name under an answer to open the source document.</li>
          <li>Use the history button (top left) to switch between saved chats, and <b>New chat</b> to start fresh.</li>
        </ol>
      </Section>

      <Section title="Limits">
        <ul>
          <li>Up to <b>20 documents</b> per account, <b>10 MB</b> per file.</li>
          <li>Supported types: <b>PDF, TXT, MD</b>.</li>
          <li>Scanned or image-only PDFs can’t be read yet (there is no OCR). Use a PDF where you can select the text.</li>
          <li>The app runs on free AI services, so if you ask many questions quickly you may be asked to try again in a minute.</li>
        </ul>
      </Section>

      <Section title="Managing your data">
        <ul>
          <li>The bin icon next to a document deletes the file, its text and its search entries.</li>
          <li>The bin icon in the chat list deletes a chat. See <Link href="/privacy" className="underline">Privacy</Link> for details.</li>
        </ul>
      </Section>
    </PageShell>
  );
}