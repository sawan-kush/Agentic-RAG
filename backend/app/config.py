import os
from dataclasses import dataclass
from dotenv import load_dotenv
from supabase import create_client
from pinecone import Pinecone
from google import genai
from google.genai import types
from groq import AsyncGroq
from llama_index.core import Settings
from llama_index.embeddings.google_genai import GoogleGenAIEmbedding
from llama_index.vector_stores.pinecone import PineconeVectorStore
from app.cached_embedding import CachedEmbedding

load_dotenv()  # must run before the clients below read the environment

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
EMBED_MODEL = os.getenv("EMBED_MODEL", "gemini-embedding-001")
EMBED_DIM = 1536  # must match the Pinecone index dimension
# Part of every Redis cache key, so changing a model in .env can never serve answers made by the old one.
MODEL_SALT = f"{GEMINI_MODEL}|{GROQ_MODEL}|{EMBED_MODEL}|{EMBED_DIM}"

# ---- Embeddings: Gemini only (Groq has no embedding models, and vectors from
# different models can't be mixed in one index, so there is no fallback here) ----
# CachedEmbedding keeps vectors in Redis (a no-op when REDIS_URL is empty), so no text is embedded twice.
Settings.embed_model = CachedEmbedding(
    GoogleGenAIEmbedding(
        model_name=EMBED_MODEL,
        api_key=os.environ["GEMINI_API_KEY"],
        embedding_config=types.EmbedContentConfig(output_dimensionality=EMBED_DIM),
    ),
    namespace=f"{EMBED_MODEL}:{EMBED_DIM}",
)
Settings.llm = None  # we call our own LLM below; stops LlamaIndex defaulting to OpenAI


# ---- Chat LLM: Gemini first, Groq if Gemini fails (rate limit, outage, etc.) ----
@dataclass
class Reply:
    text: str


class FallbackLLM:
    def __init__(self):
        self.gemini = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        self.groq = AsyncGroq(api_key=os.environ["GROQ_API_KEY"])

    async def acomplete(self, prompt: str) -> Reply:
        """Non-streaming call. Used for the router, rewriter and verifier (we need the whole JSON)."""
        try:
            r = await self.gemini.aio.models.generate_content(
                model=GEMINI_MODEL, contents=prompt,
                config=types.GenerateContentConfig(temperature=0))
            if not r.text:
                raise ValueError("empty Gemini response")
            return Reply(r.text)
        except Exception as e:
            print(f"[llm] Gemini failed ({type(e).__name__}), falling back to Groq")
            r = await self.groq.chat.completions.create(
                model=GROQ_MODEL, temperature=0,
                messages=[{"role": "user", "content": prompt}])
            return Reply(r.choices[0].message.content)

    async def astream(self, prompt: str):
        """Streaming call. An async generator that yields pairs:
             ("token", "some text")  -> a piece of the answer
             ("reset", "")           -> Gemini died halfway, so the text shown so far must be
                                        thrown away because Groq is starting the answer again
        """
        sent_any = False  # did Gemini already give the user some text?
        try:
            # generate_content_stream is a coroutine that returns an async iterator,
            # so we `await` it first and then loop with `async for`.
            stream = await self.gemini.aio.models.generate_content_stream(
                model=GEMINI_MODEL, contents=prompt,
                config=types.GenerateContentConfig(temperature=0))
            async for chunk in stream:
                if chunk.text:  # some chunks carry no text (e.g. only metadata)
                    sent_any = True
                    yield ("token", chunk.text)
            if not sent_any:
                raise ValueError("empty Gemini response")
            return  # Gemini finished normally
        except Exception as e:
            print(f"[llm] Gemini stream failed ({type(e).__name__}), falling back to Groq")
            if sent_any:
                yield ("reset", "")  # tell the caller to clear the partial answer

        # ---- Fallback: stream from Groq instead ----
        stream = await self.groq.chat.completions.create(
            model=GROQ_MODEL, temperature=0, stream=True,
            messages=[{"role": "user", "content": prompt}])
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield ("token", delta)


llm = FallbackLLM()

# Service-role client: bypasses RLS, so we ALWAYS filter by the verified user id ourselves.
supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

pinecone_index = Pinecone(api_key=os.environ["PINECONE_API_KEY"]).Index(os.environ["PINECONE_INDEX"])
vector_store = PineconeVectorStore(pinecone_index=pinecone_index)