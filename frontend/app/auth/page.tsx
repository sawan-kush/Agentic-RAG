"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "@/components/logo";
import { supabase } from "@/lib/supabase/client";

function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">(useSearchParams().get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setInfo("");
    const { error } = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (error) return setError(error.message);
    router.push("/app");
  }

  // Sends Supabase's "reset your password" email. The link in it opens /auth/reset.
  async function forgotPassword() {
    setError(""); setInfo("");
    if (!email) return setError("Type your email in the box above first, then click “Forgot password?”.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/reset` });
    if (error) return setError(error.message);
    // Same message whether or not the account exists, so nobody can use this form to find out who has an account.
    setInfo("If an account exists for that email, a reset link is on its way. Open it in this same browser.");
  }

  const google = () => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/app` } });
  const tab = (m: typeof mode) => `flex-1 rounded-full py-2 text-sm font-medium transition-colors ${mode === m ? "bg-[var(--panel)] text-[var(--ink)] shadow-[var(--shadow-sm)]" : "text-[var(--muted)] hover:text-[var(--ink)]"}`;
  const field = "h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3.5 text-[15px] outline-none transition placeholder:text-[var(--faint)] focus:border-[var(--red-ring)] focus:ring-4 focus:ring-[var(--red-soft)]";

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-6 py-12">
      <div aria-hidden className="dots absolute inset-0" style={{ WebkitMaskImage: "radial-gradient(ellipse 60% 50% at 50% 40%, #000 10%, transparent 75%)", maskImage: "radial-gradient(ellipse 60% 50% at 50% 40%, #000 10%, transparent 75%)" }} />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" aria-label="Cognix home" className="inline-block rounded-lg focus-ring"><Logo size={30} /></Link>
          <h1 className="font-display mt-6 text-4xl">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">An Agentic RAG System for Intelligent Knowledge Retrieval.</p>
        </div>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow-md)]">
        <div role="tablist" className="mb-6 flex gap-1 rounded-full bg-[var(--tint)] p-1">
          <button role="tab" aria-selected={mode === "signin"} className={tab("signin")} onClick={() => setMode("signin")}>Sign in</button>
          <button role="tab" aria-selected={mode === "signup"} className={tab("signup")} onClick={() => setMode("signup")}>Create account</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          <input type="password" required minLength={8} placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          {mode === "signin" && <button type="button" onClick={forgotPassword} className="text-sm text-[var(--muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline">Forgot password?</button>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {info && <p role="status" className="text-sm text-green-700">{info}</p>}
          <button className="focus-ring h-11 w-full rounded-full bg-[var(--ink)] text-[15px] font-medium text-white transition-colors hover:bg-[#2c271f]">{mode === "signin" ? "Sign in" : "Create account"}</button>
        </form>
        <button onClick={google} className="focus-ring mt-3 h-11 w-full rounded-full border border-[var(--line-strong)] bg-[var(--panel)] text-[15px] font-medium transition-colors hover:border-[var(--ink-2)]">Continue with Google</button>
      </div>
      </div>
    </main>
  );
}

export default function Auth() { return <Suspense><AuthForm /></Suspense>; }