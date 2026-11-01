"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Logo from "@/components/logo";

// The page the "reset password" email links to.
// When it loads, the Supabase browser client automatically reads the `?code=...` in the URL and
// logs the user in with a temporary session. We only have to wait for that session, then call updateUser.
export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState(false);     // true once the reset link has produced a session
  const [waited, setWaited] = useState(false);   // true after 4 s with no session = bad or expired link
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (session) setReady(true); });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    const timer = setTimeout(() => setWaited(true), 4000);
    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setError(error.message);
    setDone(true);
    setTimeout(() => router.push("/app"), 1500);
  }

  const field = "h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3.5 text-[15px] outline-none transition placeholder:text-[var(--faint)] focus:border-[var(--red-ring)] focus:ring-4 focus:ring-[var(--red-soft)]";
  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
      <div className="mb-8 text-center"><Link href="/" aria-label="Cognix home" className="inline-block rounded-lg focus-ring"><Logo size={30} /></Link></div>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow-md)]">
        <h1 className="font-display mb-5 text-3xl">Choose a new password</h1>
        {done ? <p role="status" className="text-green-700">Password updated. Taking you to your documents…</p>
          : ready ? (
            <form onSubmit={submit} className="space-y-3">
              <input type="password" required minLength={8} placeholder="New password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
              <input type="password" required minLength={8} placeholder="Repeat new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
              <button className="focus-ring h-11 w-full rounded-full bg-[var(--ink)] text-[15px] font-medium text-white transition-colors hover:bg-[#2c271f]">Update password</button>
            </form>
          ) : waited ? (
            <p role="alert" className="text-sm text-red-700">
              This reset link is invalid or has expired. Reset links only work once, and in the same browser where you asked for them.{" "}
              <Link href="/auth" className="underline">Request a new one</Link>.
            </p>
          ) : <p className="text-[var(--muted)]">Checking your reset link…</p>}
      </div>
      </div>
    </main>
  );
}