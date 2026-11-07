"""Tests for the Redis layer. Run from the backend folder:  python -m pytest -v"""
import json, math, time, types, uuid
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from llama_index.core.base.embeddings.base import BaseEmbedding

from app import cache
from app.config import Reply
from conftest import run, make_jwt


# ------------------------------------------------------------------ fakes
class FakeLLM:
    """Stands in for Gemini/Groq and counts calls."""
    def __init__(self, route="vector", grounded=True):
        self.route, self.grounded, self.override = route, grounded, None
        self.json_calls = self.stream_calls = 0

    async def acomplete(self, prompt):
        self.json_calls += 1
        if self.override is not None:
            return Reply(self.override)
        if "Classify the user" in prompt:
            return Reply(json.dumps({"route": self.route, "reason": "test"}))
        if "Check every factual claim" in prompt:
            return Reply(json.dumps({"grounded": self.grounded, "unsupported": [] if self.grounded else ["x"]}))
        return Reply("Refunds take 30 days.")  # the quiet retry answer

    async def astream(self, prompt):
        self.stream_calls += 1
        for piece in ("Refunds ", "take 30 days."):
            yield ("token", piece)


class FakeEmbedding(BaseEmbedding):
    calls: int = 0
    def _get_query_embedding(self, q): self.calls += 1; return [0.1, 0.5, -1.25]
    async def _aget_query_embedding(self, q): self.calls += 1; return [0.1, 0.5, -1.25]
    def _get_text_embedding(self, t): self.calls += 1; return [float(len(t)), 1.0, 2.0]
    async def _aget_text_embedding(self, t): self.calls += 1; return [float(len(t)), 1.0, 2.0]
    def _get_text_embeddings(self, ts): self.calls += len(ts); return [[float(len(t)), 1.0, 2.0] for t in ts]


def close(a, b):  # cached vectors are float32, so compare with a tolerance
    return len(a) == len(b) and all(math.isclose(x, y, rel_tol=1e-6, abs_tol=1e-9) for x, y in zip(a, b))


@pytest.fixture
def llm(monkeypatch):
    """Replaces the LLM, retriever and metadata query used by the pipeline."""
    import app.pipeline as pipeline, app.agents.router as router
    from app.agents.retriever import Chunk
    fake = FakeLLM()
    monkeypatch.setattr(pipeline, "llm", fake)
    monkeypatch.setattr(router, "llm", fake)

    async def fake_retrieve(query, user_id, top_k=5, history=None):
        return [Chunk("Refunds take 30 days.", "d1", "policy.pdf", 0.9)], [query]
    monkeypatch.setattr(pipeline, "retrieve", fake_retrieve)

    rows = [{"file_name": "policy.pdf", "chunk_count": 1}]
    chain = types.SimpleNamespace(select=lambda *a: chain, eq=lambda *a: chain, execute=lambda: types.SimpleNamespace(data=rows))
    monkeypatch.setattr(pipeline, "supabase", types.SimpleNamespace(table=lambda name: chain))
    return fake


async def ask(query, user="u1", history=None):
    from app.pipeline import run_pipeline
    return [ev async for ev in run_pipeline(query, user, history)]


def answer_of(events):
    return "".join(e["text"] for e in events if e["type"] == "token")


# ------------------------------------------------------------------ embedding cache
def test_embedding_cache_skips_the_model_and_keeps_query_and_document_apart(redis_on):
    from app.cached_embedding import CachedEmbedding
    inner = FakeEmbedding(model_name="fake", embed_batch_size=10)
    emb = CachedEmbedding(inner, namespace="fake:3")

    async def scenario():
        a = await emb.aget_query_embedding("refund policy?")
        b = await emb.aget_query_embedding("refund policy?")
        assert inner.calls == 1 and close(a, b)

        inner.calls = 0
        first = emb.get_text_embedding_batch(["alpha", "beta", "gamma", "beta"])  # duplicate is embedded once
        assert inner.calls == 3
        inner.calls = 0
        again = emb.get_text_embedding_batch(["alpha", "beta", "gamma", "beta", "delta"])
        assert inner.calls == 1  # only "delta" is new
        assert all(close(x, y) for x, y in zip(first, again))  # order is preserved

        inner.calls = 0
        await emb.aget_query_embedding("alpha")  # "alpha" is cached as a DOCUMENT only
        assert inner.calls == 1
    run(scenario())


def test_embeddings_still_work_when_redis_is_down_and_are_not_slowed_down(redis_down):
    from app.cached_embedding import CachedEmbedding
    inner = FakeEmbedding(model_name="fake", embed_batch_size=10)
    emb = CachedEmbedding(inner, namespace="fake:3")
    assert len(emb.get_text_embedding_batch(["a", "b"])) == 2
    assert cache._down_until > time.monotonic()  # Redis is now left alone for a while
    started = time.perf_counter()
    assert len(emb.get_text_embedding_batch(["c", "d"])) == 2 and run(emb.aget_query_embedding("q"))
    assert inner.calls == 5 and time.perf_counter() - started < 0.5


# ------------------------------------------------------------------ JSON helper (router / rewriter / verifier)
def test_json_helper_is_cached_but_invalid_json_is_not(redis_on, llm):
    from app.agents.router import ask_json

    async def scenario():
        llm.override = '{"route": "vector"}'
        assert await ask_json("p1") == await ask_json("p1") == {"route": "vector"}
        assert llm.json_calls == 1

        llm.override = "this is not json"
        with pytest.raises(ValueError):
            await ask_json("p2")
        llm.override = '{"ok": true}'
        assert await ask_json("p2") == {"ok": True}  # the earlier failure was not remembered
    run(scenario())


# ------------------------------------------------------------------ answer cache
def test_repeated_question_is_replayed_from_redis_with_the_same_event_shape(redis_on, llm):
    async def scenario():
        first = await ask("What is the refund policy?")
        second = await ask("What  is the refund   policy?")  # extra spaces don't matter
        assert llm.stream_calls == 1
        assert [e["type"] for e in first][-2:] == ["verified", "done"]
        assert [e["type"] for e in second] == ["trace", "token", "verified", "done"]  # the order the UI expects
        assert second[0]["agent"] == "Cache"
        assert answer_of(first) == answer_of(second) == "Refunds take 30 days."
        assert first[-1]["sources"] == second[-1]["sources"] == [{"docId": "d1", "fileName": "policy.pdf"}]
        assert first[-2] == second[-2] == {"type": "verified", "grounded": True, "unsupported": 0}
    run(scenario())


def test_uploading_or_deleting_a_document_invalidates_cached_answers(redis_on, llm):
    async def scenario():
        await ask("What is the refund policy?")
        await cache.bump_docs_version("u1")  # what /ingest and /documents/{id} DELETE do
        again = await ask("What is the refund policy?")
        assert llm.stream_calls == 2 and again[0]["agent"] != "Cache"
    run(scenario())


def test_answers_are_never_shared_between_users_or_chat_contexts(redis_on, llm):
    async def scenario():
        await ask("What is the refund policy?", user="u1")
        await ask("What is the refund policy?", user="u2")
        await ask("What is the refund policy?", user="u1", history=[{"role": "user", "text": "about invoices"}])
        assert llm.stream_calls == 3
    run(scenario())


def test_answers_the_verifier_could_not_confirm_are_not_cached(redis_on, llm):
    llm.grounded = False
    async def scenario():
        await ask("What is the refund policy?")
        again = await ask("What is the refund policy?")
        assert again[0]["agent"] != "Cache"
        assert not list(cache._sync().scan_iter(cache.key("ans", "*")))
    run(scenario())


def test_document_list_answers_get_a_short_expiry(redis_on, llm):
    llm.route = "sql"
    async def scenario():
        await ask("How many documents do I have?")
    run(scenario())
    (k,) = list(cache._sync().scan_iter(cache.key("ans", "*")))
    assert 0 < cache._sync().ttl(k) <= 300


def test_a_lost_version_bump_is_applied_as_soon_as_redis_returns(redis_on, monkeypatch):
    async def scenario():
        v0 = await cache.docs_version("u1")
        monkeypatch.setattr(cache, "_down_until", time.monotonic() + 100)  # pretend Redis is down
        await cache.bump_docs_version("u1")
        assert "u1" in cache._pending_bumps
        monkeypatch.setattr(cache, "_down_until", 0.0)  # and now it is back
        assert await cache.docs_version("u1") != v0 and not cache._pending_bumps
    run(scenario())


def test_an_evicted_version_key_never_revives_old_answers(redis_on):
    async def scenario():
        v0 = await cache.docs_version("u1")
        cache._sync().delete(cache.key("docver", "u1"))  # e.g. evicted by Redis under memory pressure
        assert await cache.docs_version("u1") != v0
    run(scenario())


# ------------------------------------------------------------------ Redis off / down: behaves like before
def test_everything_works_with_redis_disabled(llm):
    assert cache.REDIS_URL == "" and run(cache.status()) == "disabled"
    events = run(ask("What is the refund policy?"))
    assert answer_of(events) == "Refunds take 30 days." and events[-1]["type"] == "done"


def test_pipeline_works_when_redis_is_unreachable(redis_down, llm):
    events = run(ask("What is the refund policy?"))
    assert answer_of(events) == "Refunds take 30 days." and events[-1]["type"] == "done"
    assert run(cache.status()) == "down"


# ------------------------------------------------------------------ HTTP layer
@pytest.fixture
def api(redis_on, llm, monkeypatch):
    import app.main as main
    calls = {"get_user": 0}

    class Auth:
        def get_user(self, token):
            calls["get_user"] += 1
            if token == "bad":
                raise Exception("invalid")
            return types.SimpleNamespace(user=types.SimpleNamespace(id="user-1"))

    async def no_conversations(user_id):
        return []
    saved = []
    async def save(user_id, conv_id, query, answer, sources, trace, verified):
        saved.append(answer)
        return "conv-1"
    monkeypatch.setattr(main, "supabase", types.SimpleNamespace(auth=Auth()))
    monkeypatch.setattr(main.convs, "list_conversations", no_conversations)
    monkeypatch.setattr(main.convs, "save_exchange", save)
    with TestClient(main.app) as client:
        yield types.SimpleNamespace(client=client, calls=calls, saved=saved, main=main)


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_a_verified_token_is_not_re_verified_on_every_request(api):
    h = bearer(make_jwt())
    assert api.client.get("/conversations", headers=h).status_code == 200
    assert api.client.get("/conversations", headers=h).status_code == 200
    assert api.calls["get_user"] == 1


def test_bad_and_expired_tokens_are_never_cached(api):
    for _ in range(2):
        assert api.client.get("/conversations", headers=bearer("bad")).status_code == 401
    assert api.calls["get_user"] == 2
    expired = bearer(make_jwt(exp_in=-10))
    api.client.get("/conversations", headers=expired)
    api.client.get("/conversations", headers=expired)
    assert api.calls["get_user"] == 4


def test_token_caching_can_be_turned_off(api, monkeypatch):
    monkeypatch.setattr(cache, "AUTH_TTL", 0)
    h = bearer(make_jwt())
    api.client.get("/conversations", headers=h)
    api.client.get("/conversations", headers=h)
    assert api.calls["get_user"] == 2


def test_health_reports_redis_without_changing_ok(api):
    assert api.client.get("/health").json() == {"ok": True, "redis": "up"}


def test_chat_endpoint_streams_the_same_events_from_cache_and_still_saves_the_chat(api, llm):
    h = bearer(make_jwt())
    def chat():
        r = api.client.post("/chat", json={"query": "What is the refund policy?"}, headers=h)
        assert r.status_code == 200
        return [json.loads(line) for line in r.text.splitlines()]
    first, second = chat(), chat()
    assert first[-1]["type"] == second[-1]["type"] == "done" and first[-1]["conversation_id"] == "conv-1"
    assert any(e.get("agent") == "Cache" for e in second) and llm.stream_calls == 1
    assert answer_of(first) == answer_of(second) == api.saved[0] == api.saved[1]


def test_upload_and_delete_change_the_documents_version_even_when_they_fail(api, monkeypatch):
    main, h, vkey = api.main, bearer(make_jwt()), cache.key("docver", "user-1")
    async def ingest_ok(user_id, name, data): return {"id": "d", "chunks": 1}
    async def ingest_fails(user_id, name, data): raise HTTPException(502, "Indexing failed")
    async def delete_ok(user_id, doc_id): return None

    def version_after(send):
        cache._sync().set(vkey, "before")
        send()
        return cache._sync().get(vkey).decode()

    monkeypatch.setattr(main, "ingest", ingest_ok)
    assert version_after(lambda: api.client.post("/ingest", files={"file": ("a.txt", b"hi")}, headers=h)) != "before"
    monkeypatch.setattr(main, "ingest", ingest_fails)
    assert version_after(lambda: api.client.post("/ingest", files={"file": ("a.txt", b"hi")}, headers=h)) != "before"
    monkeypatch.setattr(main, "delete_document", delete_ok)
    assert version_after(lambda: api.client.delete(f"/documents/{uuid.uuid4()}", headers=h)) != "before"