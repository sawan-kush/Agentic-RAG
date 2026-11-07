"""Test setup. No API keys or network needed: Gemini, Groq, Supabase and Pinecone are faked.

By default Redis is faked in memory (fakeredis). To run the SAME tests against a real Redis instead:
    TEST_REDIS_URL=redis://localhost:6379/15 python -m pytest
(use a spare database number: the tests flush it)
"""
import asyncio, base64, json, os, time
import pytest

# --- environment must be set BEFORE app.config is imported (it reads it on import) ---
os.environ.update(GEMINI_API_KEY="test", GROQ_API_KEY="test", SUPABASE_URL="http://localhost:54321",
                  SUPABASE_SERVICE_ROLE_KEY="aaa.bbb.ccc", PINECONE_API_KEY="test", PINECONE_INDEX="test")
os.environ["REDIS_URL"] = ""  # app.cache is switched on per test by the fixture below

import pinecone  # config.py would call Pinecone over the network when imported
pinecone.Pinecone.Index = lambda self, *a, **k: type("FakeIndex", (), {})()

from app import cache  # noqa: E402


@pytest.fixture
def redis_on(monkeypatch):
    """Turns the cache on for one test and gives it a clean Redis."""
    real = os.getenv("TEST_REDIS_URL")
    monkeypatch.setattr(cache, "_pending_bumps", set())
    monkeypatch.setattr(cache, "_down_until", 0.0)
    monkeypatch.setattr(cache, "_healthy", None)
    monkeypatch.setattr(cache, "_sync_client", None)
    monkeypatch.setattr(cache, "_async_client", None)
    if real:
        monkeypatch.setattr(cache, "REDIS_URL", real)
        cache._sync().flushdb()
    else:
        import fakeredis, fakeredis.aioredis
        server = fakeredis.FakeServer()
        monkeypatch.setattr(cache, "REDIS_URL", "redis://fake")
        monkeypatch.setattr(cache, "_sync_client", fakeredis.FakeRedis(server=server))
        monkeypatch.setattr(cache, "_async_client", fakeredis.aioredis.FakeRedis(server=server))
    return cache


@pytest.fixture
def redis_down(monkeypatch):
    """Cache switched on, but nothing is listening on the port."""
    monkeypatch.setattr(cache, "REDIS_URL", "redis://127.0.0.1:1/0")
    monkeypatch.setattr(cache, "_down_until", 0.0)
    monkeypatch.setattr(cache, "_healthy", None)
    monkeypatch.setattr(cache, "_sync_client", None)
    monkeypatch.setattr(cache, "_async_client", None)
    return cache


def run(coro):
    return asyncio.run(coro)


def make_jwt(exp_in: int = 3600) -> str:
    b64 = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
    return f"{b64({'alg': 'none'})}.{b64({'exp': int(time.time()) + exp_in, 'sub': 'u'})}.sig"