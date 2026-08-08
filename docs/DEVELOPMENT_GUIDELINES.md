# 📖 Development Guidelines — PR Intelligence App

This document provides developer guidelines for setup, architecture, coding patterns, and operational procedures for the **PR Intelligence Application**.

---

## 🏗️ Architecture Overview

The application follows a clean 3-tier architecture:

1. **Frontend Presentation Tier (React 18 / Vite)**:
   - Client-side single-page application built with modern functional components and custom HSL design system tokens.
   - All network communication is funneled through `frontend/src/api/client.js`.

2. **Backend Application Tier (Python / FastAPI)**:
   - High-performance FastAPI server providing RESTful endpoints.
   - Separated into Routers (`backend/routers/`), Business Logic Services (`backend/services/`), Data Models (`backend/models.py`), and Configuration (`backend/config.py`).

3. **Persistence & Integration Tier**:
   - **SQLite Database (`pr_intelligence.db`)**: Stores cached PR metadata, AI review analysis, chat history, custom tags, staging groups, and saved release notes.
   - **GitHub CLI (`gh`) Integration**: Fetches open PR lists, raw diffs, and repository metadata without requiring direct OAuth tokens.
   - **Multi-Provider LLM Engine**: Interfaces with Google Gemini, OpenAI, Anthropic, Ollama, or fallback heuristic parsers.

---

## 🛠️ Local Setup & Execution

### Environment Setup
Create a `.env` file at root with API credentials:
```env
GEMINI_API_KEY=your_key_here
AI_PROVIDER=gemini
PR_FETCH_LIMIT=100
DB_PATH=pr_intelligence.db
```

### Running Backend
```bash
python backend/main.py
```

### Running Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 🧪 Testing Policy

Run all automated tests before committing code:
```bash
python run_tests.py
```
