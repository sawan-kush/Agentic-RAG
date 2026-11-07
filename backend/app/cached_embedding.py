"""Embedding cache: wraps the real embedding model so the same text is never embedded (and paid for) twice.

Where it helps:
  * Questions: the same question, or a question retried after a retry/rewrite, skips the Gemini call.
  * Uploads: if indexing fails halfway (e.g. Gemini rate limit) and the user uploads the file again,
    the chunks that were already embedded come from Redis instead of using up more quota.

Query vectors ("q") and document vectors ("d") are cached separately because embedding models may
treat the two differently. With Redis off or down, every call simply goes to the real model.
"""
from array import array
from typing import Awaitable, Callable
from llama_index.core.base.embeddings.base import BaseEmbedding
from llama_index.core.bridge.pydantic import PrivateAttr
from app import cache


def _encode(vector: list[float]) -> bytes:
    # float32: 4 bytes per number (~6 KB per 1536-dim vector; JSON would be ~4x bigger). It is the same precision
    # Pinecone stores, so a cached vector differs from a fresh one only beyond the 7th digit.
    return array("f", vector).tobytes()


def _decode(raw: bytes) -> list[float] | None:
    try:
        values = array("f")
        values.frombytes(raw)
        return values.tolist()
    except (ValueError, TypeError):  # truncated / corrupted entry -> treat as a miss
        return None


class CachedEmbedding(BaseEmbedding):
    _inner: BaseEmbedding = PrivateAttr()
    _ns: str = PrivateAttr()

    def __init__(self, inner: BaseEmbedding, namespace: str, **kwargs):
        """`namespace` must change whenever the vectors would change (model name, dimensions)."""
        super().__init__(model_name=inner.model_name, embed_batch_size=inner.embed_batch_size, **kwargs)
        self._inner = inner
        self._ns = namespace

    # ---- shared helpers (pure: no I/O) ----
    def _key(self, kind: str, text: str) -> str:
        return cache.key("emb", self._ns, kind, cache.digest(text))

    @staticmethod
    def _split(texts: list[str], raws: list[bytes | None]):
        """-> (cached vector or None per text, the unique texts that still need embedding)"""
        found = [_decode(r) if r is not None else None for r in raws]
        missing = list(dict.fromkeys(t for t, v in zip(texts, found) if v is None))
        return found, missing

    def _merge(self, kind: str, texts: list[str], found: list, missing: list[str], fresh: list[list[float]]):
        by_text = dict(zip(missing, fresh))
        vectors = [v if v is not None else by_text[t] for t, v in zip(texts, found)]
        return vectors, {self._key(kind, t): _encode(v) for t, v in by_text.items()}

    # ---- sync flow (ingestion runs VectorStoreIndex in a worker thread) ----
    def _embed(self, kind: str, texts: list[str], compute: Callable[[list[str]], list[list[float]]]):
        found, missing = self._split(texts, cache.mget([self._key(kind, t) for t in texts]))
        hits = sum(v is not None for v in found)
        if hits and kind == "d":
            print(f"[embed] {hits}/{len(texts)} chunk embeddings came from Redis")
        if not missing:
            return found
        vectors, new = self._merge(kind, texts, found, missing, compute(missing))
        cache.mset(new, cache.EMBED_TTL)
        return vectors

    # ---- async flow (query embedding during retrieval) ----
    async def _aembed(self, kind: str, texts: list[str], compute: Callable[[list[str]], Awaitable[list[list[float]]]]):
        found, missing = self._split(texts, await cache.amget([self._key(kind, t) for t in texts]))
        if not missing:
            return found
        vectors, new = self._merge(kind, texts, found, missing, await compute(missing))
        await cache.amset(new, cache.EMBED_TTL)
        return vectors

    # ---- the methods LlamaIndex calls ----
    def _get_query_embedding(self, query: str) -> list[float]:
        return self._embed("q", [query], lambda ts: [self._inner.get_query_embedding(ts[0])])[0]

    async def _aget_query_embedding(self, query: str) -> list[float]:
        async def compute(ts):
            return [await self._inner.aget_query_embedding(ts[0])]
        return (await self._aembed("q", [query], compute))[0]

    def _get_text_embedding(self, text: str) -> list[float]:
        return self._embed("d", [text], lambda ts: [self._inner.get_text_embedding(ts[0])])[0]

    async def _aget_text_embedding(self, text: str) -> list[float]:
        async def compute(ts):
            return [await self._inner.aget_text_embedding(ts[0])]
        return (await self._aembed("d", [text], compute))[0]

    def _get_text_embeddings(self, texts: list[str]) -> list[list[float]]:
        return self._embed("d", texts, self._inner.get_text_embedding_batch)

    async def _aget_text_embeddings(self, texts: list[str]) -> list[list[float]]:
        return await self._aembed("d", texts, self._inner.aget_text_embedding_batch)