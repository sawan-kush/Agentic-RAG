"""Agent 3: Verification & Grounding. Checks the answer against the retrieved text."""
from app.agents.router import ask_json


async def verify(answer: str, chunks) -> dict:
    ctx = "\n\n".join(f"[{i}] {c.text}" for i, c in enumerate(chunks))
    return await ask_json(f"""Check every factual claim in ANSWER against CONTEXT.
CONTEXT:\n{ctx}\n\nANSWER:\n{answer}
Return {{"grounded": true|false, "unsupported": ["claims not backed by the context"]}}""")
