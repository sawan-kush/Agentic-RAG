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

load_dotenv()  # must run before the clients below read the environment

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
EMBED_MODEL = os.getenv("EMBED_MODEL", "gemini-embedding-001")
EMBED_DIM = 1536  # must match the Pinecone index dimension

# ---- Embeddings: Gemini only (Groq has no embedding models, and vectors from
# different models can't be mixed in one index, so there is no fallback here) ----
Settings.embed_model = GoogleGenAIEmbedding(
    model_name=EMBED_MODEL,
    api_key=os.environ["GEMINI_API_KEY"],
    embedding_config=types.EmbedContentConfig(output_dimensionality=EMBED_DIM),
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


llm = FallbackLLM()

# Service-role client: bypasses RLS, so we ALWAYS filter by the verified user id ourselves.
supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

pinecone_index = Pinecone(api_key=os.environ["PINECONE_API_KEY"]).Index(os.environ["PINECONE_INDEX"])
vector_store = PineconeVectorStore(pinecone_index=pinecone_index)