"use client";
import { useRouter } from "next/navigation";
import KnowledgeBase from "@/components/knowledge-base";
export default function Page() {
  const r = useRouter();
  return <KnowledgeBase open onClose={() => r.push("/app")} />;
}
