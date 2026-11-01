"""Saved chat history. Every function filters by user_id because the backend uses the
service-role key (which bypasses Row Level Security)."""
import asyncio
from datetime import datetime, timezone
from app.config import supabase

HISTORY_MESSAGES = 6  # last 3 question/answer pairs are enough to resolve "it" / "that one"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def load_history(user_id: str, conv_id: str) -> list[dict] | None:
    """Returns the last few messages (oldest first), or None if this conversation isn't the user's."""
    def work():
        own = supabase.table("conversations").select("id").eq("id", conv_id).eq("user_id", user_id).execute().data
        if not own:
            return None
        rows = (supabase.table("messages").select("role,text").eq("conversation_id", conv_id)
                .order("id", desc=True).limit(HISTORY_MESSAGES).execute().data)
        return list(reversed(rows))  # we fetched newest-first, so flip back
    return await asyncio.to_thread(work)


async def save_exchange(user_id: str, conv_id: str | None, query: str, answer: str,
                        sources: list, trace: list, verified: bool | None) -> str:
    """Saves the question + answer. Creates the conversation first if this is a new chat. Returns its id."""
    def work():
        cid = conv_id
        if not cid:
            title = " ".join(query.split())[:60] + ("…" if len(query) > 60 else "")  # title = first question
            cid = supabase.table("conversations").insert({"user_id": user_id, "title": title}).execute().data[0]["id"]
        supabase.table("messages").insert([  # one insert; ids are assigned in list order
            {"conversation_id": cid, "user_id": user_id, "role": "user", "text": query},
            {"conversation_id": cid, "user_id": user_id, "role": "ai", "text": answer,
             "sources": sources, "trace": trace, "verified": verified},
        ]).execute()
        supabase.table("conversations").update({"updated_at": _now()}).eq("id", cid).eq("user_id", user_id).execute()
        return cid
    return await asyncio.to_thread(work)


async def list_conversations(user_id: str) -> list[dict]:
    return await asyncio.to_thread(lambda: supabase.table("conversations").select("id,title,updated_at")
        .eq("user_id", user_id).order("updated_at", desc=True).limit(50).execute().data)


async def get_conversation(user_id: str, conv_id: str) -> dict | None:
    def work():
        conv = (supabase.table("conversations").select("id,title,updated_at")
                .eq("id", conv_id).eq("user_id", user_id).execute().data)
        if not conv:
            return None
        msgs = (supabase.table("messages").select("role,text,sources,trace,verified")
                .eq("conversation_id", conv_id).eq("user_id", user_id).order("id").execute().data)
        return {**conv[0], "messages": msgs}
    return await asyncio.to_thread(work)


async def delete_conversation(user_id: str, conv_id: str) -> bool:
    """Messages are removed automatically (ON DELETE CASCADE). Returns False if nothing matched."""
    res = await asyncio.to_thread(lambda: supabase.table("conversations").delete()
                                  .eq("id", conv_id).eq("user_id", user_id).execute().data)
    return bool(res)