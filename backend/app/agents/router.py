"""Agent 1: Intent & Routing. Decides which tool handles the query."""
import json, re
from app.config import llm


async def ask_json(prompt: str):
    r = await llm.acomplete(prompt + "\nRespond with JSON only.")
    return json.loads(re.sub(r"```(?:json)?", "", r.text).strip())


def format_history(history: list[dict] | None, max_chars: int = 400) -> str:
    """Turns the last few chat messages into a short text block for prompts.
    Each message is cut to `max_chars` so the prompt (and the free-tier token budget) stays small."""
    lines = []
    for m in history or []:
        who = "User" if m["role"] == "user" else "Assistant"
        lines.append(f"{who}: {m['text'][:max_chars]}")
    return "\n".join(lines)


async def route_query(query: str, history: list[dict] | None = None) -> dict:
    convo = format_history(history)
    context = f"Recent conversation (use it to understand follow-up questions):\n{convo}\n\n" if convo else ""
    return await ask_json(f"""Classify the user's newest query.
- "direct": chit-chat or general knowledge, no documents needed
- "sql": asks about document metadata (counts, names, upload dates, sizes)
- "vector": asks about the content of uploaded documents
{context}Query: "{query}"
Return {{"route":"direct|sql|vector","reason":"<one sentence>"}}""")