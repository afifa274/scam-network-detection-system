from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.routes import scam_routes
import time
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AI Scam Detection System",
    description="Analyzes messages for scam/spam using ML and graph-based entity analysis.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000, 2)
    logger.info(f"{request.method} {request.url.path} → {response.status_code} ({duration}ms)")
    return response


app.include_router(scam_routes.router)


@app.get("/", tags=["meta"])
def home():
    return {"status": "Scam Detection API Running", "version": "2.0.0"}


@app.get("/health", tags=["meta"])
def health():
    return {
        "status": "healthy",
        "model": "LogisticRegression (TF-IDF)",
        "version": "2.0.0",
        "endpoints": ["/predict", "/history", "/stats", "/health"],
    }
