"use client";
import { useRouter } from "next/navigation";
import KnowledgeBase from "@/components/knowledge-base";

// Standalone route (/app/knowledge-base). Inside the app the same panel opens from the sidebar.
export default function Page() {
  const r = useRouter();
  return <div className="flex h-dvh flex-col"><KnowledgeBase open onClose={() => r.push("/app")} /></div>;
}