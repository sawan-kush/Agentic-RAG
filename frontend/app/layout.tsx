import "./globals.css";
import { Bricolage_Grotesque, Inter } from "next/font/google";
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata = { title: "Precision Document Intelligence" };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${display.variable} ${body.variable}`}><body>{children}</body></html>;
}
