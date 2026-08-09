import argparse
import logging
import os
import sys
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from config import settings
from database import init_db
from routers import prs, conflicts, changelog, export, repos, tags, build

def parse_cli_args():
    """Build the CLI parser. Returns the parser, not parsed args — callers decide
    between parse_args() and parse_known_args()."""
    parser = argparse.ArgumentParser(description="PR Intelligence FastAPI Server")
    parser.add_argument("--host", type=str, help="Host address to bind to (e.g. 0.0.0.0)")
    parser.add_argument("--port", type=int, help="Port to bind server to (e.g. 8000)")
    parser.add_argument("--reload", action="store_true", default=None, help="Enable auto-reload on code changes")
    parser.add_argument("--debug", action="store_true", default=None, help="Enable debug mode")
    parser.add_argument("--ai-provider", type=str, help="Preferred AI provider (auto, gemini, openai, anthropic, ollama)")
    parser.add_argument("--pr-fetch-limit", type=int, help="Max PR fetch limit")
    parser.add_argument("--db-path", type=str, help="Custom SQLite database file path")
    parser.add_argument("--log-level", type=str, help="Logging level (info, debug, warning, error)")
    
    # Attempted protected field overrides (will trigger security warnings)
    parser.add_argument("--app-env", type=str, help="Attempt override of protected APP_ENV field")

    return parser

# Apply CLI overrides at import time, not only under __main__. Uvicorn imports
# this module as `main:app`, so gating on __main__ meant `uvicorn main:app
# --port 9000` silently ignored every flag. argparse is skipped when the process
# was not launched with our own flags (e.g. pytest, `uvicorn` with its own argv).
KNOWN_CLI_FLAGS = (
    "--host", "--port", "--reload", "--debug", "--ai-provider",
    "--pr-fetch-limit", "--db-path", "--log-level", "--app-env",
)


def _maybe_apply_cli_overrides():
    argv = sys.argv[1:]
    if not any(a.split("=")[0] in KNOWN_CLI_FLAGS for a in argv):
        return
    # parse_known_args so foreign flags (uvicorn's, pytest's) never abort startup.
    args, _unknown = parse_cli_args().parse_known_args()
    settings.apply_cli_overrides(vars(args))


_maybe_apply_cli_overrides()

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)

# Initialize DB tables & defaults
init_db()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    debug=settings.DEBUG,
    description="FastAPI + React AI-Powered PR Intelligence Application"
)

# CORS.
# `allow_origins=["*"]` together with `allow_credentials=True` is an invalid
# combination that browsers reject outright, so the previous config gave neither
# wildcard access nor credentialed access. Credentials are not used by this app
# (there is no auth yet), so the wildcard is kept and credentials turned off.
# Set CORS_ALLOW_ORIGINS to an explicit comma-separated list to lock this down.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOW_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_ORIGINS != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(prs.router)
app.include_router(conflicts.router)
app.include_router(changelog.router)
app.include_router(export.router)
app.include_router(repos.router)
app.include_router(tags.router)
app.include_router(build.router)

# Serve Frontend static build if present
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

@app.get("/health", tags=["Ops"])
def health():
    """Liveness probe. Cheap and dependency-free by design."""
    return {"status": "ok"}


@app.get("/api/version", tags=["Ops"])
def version():
    return {
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "app_env": settings.APP_ENV,
        "ai_provider": settings.AI_PROVIDER,
        "default_repo": settings.DEFAULT_REPO,
    }


def _index_response():
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {
        "status": "online",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "debug": settings.DEBUG,
        "docs": "/docs",
        "frontend": "Run Vite dev server or build frontend"
    }


@app.get("/")
def read_root():
    return _index_response()


# SPA catch-all. Registered last so it never shadows a real route: any
# non-/api path falls through to index.html and lets the client router take
# over. Without this, deep links 404 against the production build.
@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str):
    if full_path.startswith("api/") or full_path in ("docs", "redoc", "openapi.json", "health"):
        raise HTTPException(status_code=404, detail="Not found")
    return _index_response()

if __name__ == "__main__":
    import uvicorn
    print(f"Starting {settings.PROJECT_NAME} on {settings.HOST}:{settings.PORT} (Debug: {settings.DEBUG}, Provider: {settings.AI_PROVIDER})...")
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=settings.RELOAD, log_level=settings.LOG_LEVEL.lower())
