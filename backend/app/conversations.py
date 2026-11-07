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


def make_title(query: str, limit: int = 60) -> str:
    """The chat's title: its first question, on one line, cut at a word boundary (not in the middle of a word)."""
    text = " ".join(query.split())
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0] or text[:limit]
    return cut.rstrip(" ,.;:-") + "…"


async def save_exchange(user_id: str, conv_id: str | None, query: str, answer: str,
                        sources: list, trace: list, verified: bool | None) -> str:
    """Saves the question + answer into ONE conversation and returns its id.
    A new chat (conv_id is None) gets a new conversation, titled after its first question; a follow-up
    is appended to the existing one, so a chat is always a single entry in the sidebar.
    The two messages go in with one insert (both are saved or neither), and every column is given
    explicitly, so the database never has to guess a value."""
    def work():
        cid, created = conv_id, False
        if not cid:
            cid = supabase.table("conversations").insert({"user_id": user_id, "title": make_title(query)}).execute().data[0]["id"]
            created = True
        try:
            supabase.table("messages").insert([  # one insert; ids are assigned in list order
                {"conversation_id": cid, "user_id": user_id, "role": "user", "text": query,
                 "sources": [], "trace": [], "verified": None},
                {"conversation_id": cid, "user_id": user_id, "role": "ai", "text": answer,
                 "sources": sources, "trace": trace, "verified": verified},
            ]).execute()
        except Exception:
            if created:  # never leave an empty chat behind in the sidebar
                try:
                    supabase.table("conversations").delete().eq("id", cid).eq("user_id", user_id).execute()
                except Exception:
                    pass
            raise
        supabase.table("conversations").update({"updated_at": _now()}).eq("id", cid).eq("user_id", user_id).execute()
        return cid  # (the update above moves this chat to the top of the sidebar)
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