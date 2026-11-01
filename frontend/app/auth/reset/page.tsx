"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

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

  const field = "w-full rounded-lg border border-[var(--line)] bg-black/30 px-3 py-2";
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="glass w-full max-w-sm rounded-2xl p-6">
        <h1 className="mb-4 text-xl font-bold">Choose a new password</h1>
        {done ? <p role="status" className="text-green-400">Password updated. Taking you to your documents…</p>
          : ready ? (
            <form onSubmit={submit} className="space-y-3">
              <input type="password" required minLength={8} placeholder="New password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
              <input type="password" required minLength={8} placeholder="Repeat new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
              {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
              <button className="w-full rounded-lg bg-[var(--red)] py-2 font-semibold text-white">Update password</button>
            </form>
          ) : waited ? (
            <p role="alert" className="text-sm text-red-400">
              This reset link is invalid or has expired. Reset links only work once, and in the same browser where you asked for them.{" "}
              <Link href="/auth" className="underline">Request a new one</Link>.
            </p>
          ) : <p className="text-[var(--muted)]">Checking your reset link…</p>}
      </div>
    </main>
  );
}