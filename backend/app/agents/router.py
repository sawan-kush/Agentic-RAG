"""Agent 1: Intent & Routing. Decides which tool handles the query."""
import json, re
from app.config import llm


async def ask_json(prompt: str):
    r = await llm.acomplete(prompt + "\nRespond with JSON only.")
    return json.loads(re.sub(r"```(?:json)?", "", r.text).strip())


async def route_query(query: str) -> dict:
    return await ask_json(f"""Classify the user query.
- "direct": chit-chat or general knowledge, no documents needed
- "sql": asks about document metadata (counts, names, upload dates, sizes)
- "vector": asks about the content of uploaded documents
Query: "{query}"
Return {{"route":"direct|sql|vector","reason":"<one sentence>"}}""")
