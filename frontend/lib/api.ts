import { supabase } from "./supabase/client";

// Calls the Python backend and attaches the logged-in user's Supabase token.
export async function api(path: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${session?.access_token}` },
  });
}
