import os
from dotenv import load_dotenv
from pinecone import Pinecone, ServerlessSpec

load_dotenv()
pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
name = os.environ["PINECONE_INDEX"]

if not pc.has_index(name):
    pc.create_index(
        name=name,
        dimension=1536,   # matches gemini-embedding-001 with output_dimensionality=1536
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1"),
    )
print("Index status:", pc.describe_index(name).status)