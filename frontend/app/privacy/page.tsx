import PageShell, { Section } from "@/components/page-shell";

export const metadata = { title: "Privacy · Precision Document Intelligence" };

export default function Privacy() {
  return (
    <PageShell title="Privacy">
      <p className="text-[var(--muted)]">In plain language: what is stored, where, and who else sees your text. This is a small project built on free-tier services, so please read the Google note below before uploading anything.</p>

      <Section title="What is stored, and where">
        <ul>
          <li><b>Supabase</b> (database and file storage): your account (email and a hashed password, or your Google sign-in), the original files you upload (in a private storage area), the text extracted from them, the text split into passages for keyword search, and your saved chats (questions, answers, sources).</li>
          <li><b>Pinecone</b> (search index): for every passage, a list of numbers that represents its meaning, plus the passage text, your user id, the document id and the file name. All users share one index, and every search is restricted to your own user id.</li>
          <li><b>Your browser</b>: a login session so you stay signed in.</li>
        </ul>
      </Section>

      <Section title="Who else receives your text">
        <ul>
          <li><b>Google Gemini</b> turns your passages and questions into search numbers, and writes and checks the answers. When you ask something, your question, the passages found in your documents and your recent chat messages are sent to Gemini. <b>This app uses Gemini’s free tier. On the free tier, Google may use the prompts and responses it receives to improve its products and models</b>, and people at Google may review them. See Google’s Gemini API terms for the details.</li>
          <li><b>Groq</b> is used as a backup writer only when Gemini fails. It then receives the same kind of text (your question, matching passages, recent chat messages) under Groq’s own terms.</li>
        </ul>
        <p>Because of this, <b>don’t upload documents that are confidential, regulated or about other people’s private information.</b></p>
      </Section>

      <Section title="Deleting your data">
        <ul>
          <li><b>Delete a document</b> (bin icon in the knowledge base): removes the file, its extracted text, its keyword-search passages and its entries in the Pinecone index.</li>
          <li><b>Delete a chat</b> (bin icon in the chat list): removes its questions and answers.</li>
          <li>Deleting your whole account isn’t available inside the app yet.</li>
        </ul>
      </Section>
    </PageShell>
  );
}