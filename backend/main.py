import argparse
import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from config import settings
from database import init_db
from routers import prs, conflicts, changelog, export, repos

def parse_cli_args():
    parser = argparse.ArgumentParser(description="PR Intelligence FastAPI Server")
    parser.add_argument("--host", type=str, help="Host address to bind to (e.g. 0.0.0.0)")
    parser.add_argument("--port", type=int, help="Port to bind server to (e.g. 8000)")
    parser.add_argument("--reload", action="store_true", default=None, help="Enable auto-reload on code changes")
    parser.add_argument("--debug", action="store_true", default=None, help="Enable debug mode")
    parser.add_argument("--ai-provider", type=str, help="Preferred AI provider (auto, gemini, openai, anthropic, ollama)")
    parser.add_argument("--db-path", type=str, help="Custom SQLite database file path")
    parser.add_argument("--log-level", type=str, help="Logging level (info, debug, warning, error)")
    
    # Attempted protected field overrides (will trigger security warnings)
    parser.add_argument("--app-env", type=str, help="Attempt override of protected APP_ENV field")
    
    return parser.parse_args()

# Parse CLI args if running via python backend/main.py
if __name__ == "__main__":
    args = parse_cli_args()
    cli_dict = vars(args)
    settings.apply_cli_overrides(cli_dict)

# Initialize DB tables & defaults
init_db()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    debug=settings.DEBUG,
    description="FastAPI + React AI-Powered PR Intelligence Application"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(prs.router)
app.include_router(conflicts.router)
app.include_router(changelog.router)
app.include_router(export.router)
app.include_router(repos.router)

# Serve Frontend static build if present
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

@app.get("/")
def read_root():
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

if __name__ == "__main__":
    import uvicorn
    print(f"Starting {settings.PROJECT_NAME} on {settings.HOST}:{settings.PORT} (Debug: {settings.DEBUG}, Provider: {settings.AI_PROVIDER})...")
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=settings.RELOAD, log_level=settings.LOG_LEVEL.lower())
