import { supabase } from "./supabase/client";

// Calls the Python backend and attaches the logged-in user's Supabase token.
export async function api(path: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${session?.access_token}` },
  });
}

// Turns a failed response into a readable message. The backend sends errors as {"detail": "..."}.
export async function errorText(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
  } catch { /* the body wasn't JSON, fall through */ }
  return `Something went wrong (error ${res.status}).`;
}