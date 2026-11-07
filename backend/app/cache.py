"""Redis layer: an OPTIONAL accelerator in front of the slow / expensive parts of the pipeline.

What is cached (every key starts with 'rag:v1:'):
  emb:<model>:<q|d>:<sha256(text)>  embedding vectors (query side and document side kept apart)
  llm:<sha256(models + prompt)>     parsed JSON from the router, the query rewriter and the verifier
  ans:<sha256(...)>                 a complete, verified chat answer (replayed to the browser as a stream)
  docver:<user_id>                  the user's "documents version". It changes on every upload / delete
                                    and is part of the `ans:` key, so a changed library can never be
                                    answered from a stale cache entry.
  auth:<sha256(token)>              token -> user id for a short time (saves a Supabase call per request)

Rules this module follows:
  * REDIS_URL empty -> every helper is a no-op and the app behaves exactly as it did before Redis.
  * Redis down or slow -> every helper swallows the error and reports a "miss". Redis is then left
    alone for RETRY_AFTER seconds so that requests don't each wait for a timeout.
  * Redis is never the source of truth. Flushing it is always safe.
"""
import base64, hashlib, json, os, time, uuid
import redis
import redis.asyncio as aredis
from dotenv import load_dotenv

load_dotenv()  # config.py calls this too, but it imports this module BEFORE doing so


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


REDIS_URL = os.getenv("REDIS_URL", "").strip()
EMBED_TTL = _int_env("EMBED_CACHE_TTL", 30 * 24 * 3600)  # a text always embeds to the same vector, so keep long
LLM_TTL = _int_env("LLM_CACHE_TTL", 3600)
ANSWER_TTL = _int_env("ANSWER_CACHE_TTL", 3600)
AUTH_TTL = _int_env("AUTH_CACHE_TTL", 60)  # 0 = never cache tokens (a logged-out token then stops working at once)
RETRY_AFTER = 15                           # seconds to leave a failing Redis alone

PREFIX = "rag:v1:"

_sync_client: redis.Redis | None = None
_async_client: aredis.Redis | None = None
_down_until = 0.0              # monotonic time before which we don't even try Redis
_healthy: bool | None = None   # only used to log up/down transitions once
_pending_bumps: set[str] = set()  # users whose version bump was lost because Redis was down


# ------------------------------------------------------------------ plumbing
def enabled() -> bool:
    return bool(REDIS_URL)


def _usable() -> bool:
    return enabled() and time.monotonic() >= _down_until


def _ok() -> None:
    global _healthy, _down_until
    if _healthy is False:
        print("[cache] Redis is back")
    _healthy, _down_until = True, 0.0


def _failed(e: Exception) -> None:
    global _healthy, _down_until
    if _healthy is not False:
        print(f"[cache] Redis unavailable ({type(e).__name__}), continuing without the cache")
    _healthy, _down_until = False, time.monotonic() + RETRY_AFTER


def _sync() -> redis.Redis:
    global _sync_client
    if _sync_client is None:  # no decode_responses: embeddings are stored as raw bytes
        _sync_client = redis.Redis.from_url(REDIS_URL, socket_timeout=2, socket_connect_timeout=1, health_check_interval=30)
    return _sync_client


def _async() -> aredis.Redis:
    global _async_client
    if _async_client is None:
        _async_client = aredis.Redis.from_url(REDIS_URL, socket_timeout=2, socket_connect_timeout=1, health_check_interval=30)
    return _async_client


def key(*parts: str) -> str:
    return PREFIX + ":".join(parts)


def digest(*parts: str) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8", "ignore"))
        h.update(b"\x1f")  # separator, so ("ab", "c") and ("a", "bc") hash differently
    return h.hexdigest()


# ------------------------------------------------------------------ async API (request handlers)
async def aget(k: str) -> bytes | None:
    if not _usable():
        return None
    try:
        value = await _async().get(k)
        _ok()
        return value
    except Exception as e:
        _failed(e)
        return None


async def aset(k: str, value: bytes | str, ttl: int | None = None, nx: bool = False) -> bool:
    """True if Redis stored the value (False: Redis down, or nx=True and the key already existed)."""
    if not _usable():
        return False
    try:
        done = await _async().set(k, value, ex=ttl or None, nx=nx)
        _ok()
        return bool(done)
    except Exception as e:
        _failed(e)
        return False


async def amget(keys: list[str]) -> list[bytes | None]:
    if not keys or not _usable():
        return [None] * len(keys)
    try:
        values = await _async().mget(keys)
        _ok()
        return values
    except Exception as e:
        _failed(e)
        return [None] * len(keys)


async def amset(items: dict[str, bytes], ttl: int) -> None:
    if not items or not _usable():
        return
    try:
        async with _async().pipeline(transaction=False) as pipe:
            for k, v in items.items():
                pipe.set(k, v, ex=ttl)
            await pipe.execute()
        _ok()
    except Exception as e:
        _failed(e)


async def aget_json(k: str):
    raw = await aget(k)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except ValueError:  # a corrupted entry counts as a miss
        return None


async def aset_json(k: str, obj, ttl: int) -> None:
    await aset(k, json.dumps(obj, ensure_ascii=False), ttl)


# ------------------------------------------------------------------ sync API (ingestion runs in a worker thread)
def mget(keys: list[str]) -> list[bytes | None]:
    if not keys or not _usable():
        return [None] * len(keys)
    try:
        values = _sync().mget(keys)
        _ok()
        return values
    except Exception as e:
        _failed(e)
        return [None] * len(keys)


def mset(items: dict[str, bytes], ttl: int) -> None:
    if not items or not _usable():
        return
    try:
        pipe = _sync().pipeline(transaction=False)
        for k, v in items.items():
            pipe.set(k, v, ex=ttl)
        pipe.execute()
        _ok()
    except Exception as e:
        _failed(e)


# ------------------------------------------------------------------ documents version (answer-cache invalidation)
async def docs_version(user_id: str) -> str | None:
    """Current version string of this user's library, or None when Redis can't be used (= skip the cache).
    If the key is missing (first use, or Redis evicted it) a fresh random version is created, so entries
    written under an older version can never match again."""
    if user_id in _pending_bumps and await _bump(user_id):
        _pending_bumps.discard(user_id)
    k = key("docver", user_id)
    value = await aget(k)
    if value is None and _usable():
        await aset(k, uuid.uuid4().hex[:12], nx=True)
        value = await aget(k)
    return value.decode() if value else None


async def _bump(user_id: str) -> bool:
    return await aset(key("docver", user_id), uuid.uuid4().hex[:12])


async def bump_docs_version(user_id: str) -> None:
    """Call after every upload / delete: every cached answer of this user stops matching."""
    if enabled() and not await _bump(user_id):
        _pending_bumps.add(user_id)  # Redis was down: retry before the next lookup so no stale answer slips through


# ------------------------------------------------------------------ auth token cache
def _jwt_exp(token: str) -> int | None:
    try:
        body = token.split(".")[1]
        return int(json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))["exp"])
    except Exception:
        return None


async def cached_user(token: str) -> str | None:
    if AUTH_TTL <= 0:
        return None
    raw = await aget(key("auth", digest(token)))
    return raw.decode() if raw else None


async def remember_user(token: str, user_id: str) -> None:
    """Only called after Supabase has verified the token. Never outlives the token's own expiry."""
    exp = _jwt_exp(token)
    if AUTH_TTL <= 0 or exp is None:
        return
    ttl = min(AUTH_TTL, exp - int(time.time()) - 5)
    if ttl > 0:
        await aset(key("auth", digest(token)), user_id, ttl)


# ------------------------------------------------------------------ lifecycle
async def status() -> str:
    """'disabled' | 'up' | 'down' -- for /health and the startup log."""
    if not enabled():
        return "disabled"
    try:
        await _async().ping()
        _ok()
        return "up"
    except Exception as e:
        _failed(e)
        return "down"


async def close() -> None:
    global _sync_client, _async_client
    if _async_client is not None:
        try:
            await _async_client.aclose()
        except Exception:
            pass
        _async_client = None
    if _sync_client is not None:
        try:
            _sync_client.close()
        except Exception:
            pass
        _sync_client = None