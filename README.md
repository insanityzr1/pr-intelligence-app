# PR Intelligence App (`pr-intelligence-app`)

An AI-powered PR analysis, triage, and release planning application for high-volume developers.

## Features
- **Provider-Agnostic AI Engine**: Connects to Google Gemini, OpenAI (GPT-4o), Anthropic (Claude 3.5), Ollama, or DeepSeek via environment keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.).
- **SHA-Based Local Caching**: Caches AI analysis results in SQLite keyed by PR ID + commit SHA (`headRefOid`) to optimize API cost and speed.
- **Tiered Context Pipeline**: Full diff analysis for small/medium PRs; intelligent chunking & signature mapping for large refactors.
- **AI Code Review & Risk Analysis**: Automated breaking change detection, security vector analysis, and QA test scenario generation.
- **Cross-PR Conflict Matrix**: Visual mapping of file collisions across open PRs.
- **Release Builder & Changelog Generator**: AI-grouped feature epics and release notes.

## Quick Start

### 1. Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r ../requirements.txt

# Run FastAPI server
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup
Open `http://localhost:8000` in your web browser. The FastAPI server serves the single-page dashboard directly.

## Configuration & Environment Variables
- `OPENAI_API_KEY`: API key for OpenAI
- `GEMINI_API_KEY`: API key for Google Gemini
- `ANTHROPIC_API_KEY`: API key for Anthropic Claude
- `AI_PROVIDER`: Preferred provider (`auto`, `gemini`, `openai`, `anthropic`, `ollama`)
