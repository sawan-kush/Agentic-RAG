import "./globals.css";
import { Instrument_Serif, Inter } from "next/font/google";
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata = {
  title: "Cognix · Agentic RAG for intelligent knowledge retrieval",
  description: "Cognix is an agentic RAG system for intelligent knowledge retrieval. Ask questions across your own documents and get answers checked against the source.",
};
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${display.variable} ${body.variable}`}><body>{children}</body></html>;
}