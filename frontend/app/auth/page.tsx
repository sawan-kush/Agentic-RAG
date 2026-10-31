"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">(useSearchParams().get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error } = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (error) return setError(error.message);
    router.push("/app");
  }

  const google = () => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/app` } });
  const tab = (m: typeof mode) => `flex-1 rounded-md py-2 font-medium ${mode === m ? "bg-[var(--red)] text-white" : "text-[var(--muted)]"}`;
  const field = "w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2";

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="glass w-full max-w-sm rounded-2xl p-6">
        <div role="tablist" className="mb-6 flex gap-1 rounded-lg bg-black/30 p-1">
          <button role="tab" aria-selected={mode === "signin"} className={tab("signin")} onClick={() => setMode("signin")}>Sign in</button>
          <button role="tab" aria-selected={mode === "signup"} className={tab("signup")} onClick={() => setMode("signup")}>Create account</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          <input type="password" required minLength={8} placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <button className="w-full rounded-lg bg-[var(--red)] py-2 font-semibold text-white">{mode === "signin" ? "Sign in" : "Create account"}</button>
        </form>
        <button onClick={google} className="mt-3 w-full rounded-lg border border-[var(--line)] py-2">Continue with Google</button>
      </div>
    </main>
  );
}

export default function Auth() { return <Suspense><AuthForm /></Suspense>; }
