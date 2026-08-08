# AGENTS.md — PR Intelligence App (`pr-intelligence-app`)

## Canonical Project Context
- This file is the canonical cross-agent instruction source for `pr-intelligence-app`.
- Project: AI-powered Pull Request Triage, Analysis, Code Review, Conflict Resolution, and Release Planning Application.
- Application Root: `C:\Users\rpnunez\Projects\pr-intelligence-app\`.
- Runtimes: Python 3.10+ (FastAPI Backend) and Node 18+ (React / Vite Frontend).

## Key Paths
- **Backend Entrypoint**: `backend/main.py`
- **Config & Settings**: `backend/config.py` (reads `.env` with CLI overrides)
- **Database & Persistence**: `backend/database.py` (SQLite schema & functions)
- **Data Models**: `backend/models.py` (Pydantic request/response schemas)
- **API Routers**: `backend/routers/` (`prs.py`, `conflicts.py`, `changelog.py`, `tags.py`, `export.py`, `repos.py`)
- **Business Logic Services**: `backend/services/` (`ai_service.py`, `conflict_resolution_service.py`, `github_service.py`, `changelog_service.py`, `diff_parser.py`, `conflict_service.py`)
- **Frontend App Root**: `frontend/src/`
- **Frontend Components**: `frontend/src/components/` (`PRMatrix.jsx`, `PRDetailDrawer.jsx`, `ReleaseBuilder.jsx`, `PRTagBar.jsx`, `StagingWorkspacesTab.jsx`, `FormattedMarkdown.jsx`)
- **Frontend API Client**: `frontend/src/api/client.js`
- **Test Suite**: `backend/tests/` (Pytest) and `frontend/src/__tests__/` (Vitest)
- **Unified Test Runner**: `run_tests.py`
- **Deeper Docs**: [README.md](README.md), [docs/DEVELOPMENT_GUIDELINES.md](docs/DEVELOPMENT_GUIDELINES.md), [docs/AI_AGENT_REFERENCE.md](docs/AI_AGENT_REFERENCE.md).

## Coding Conventions
- **Backend (Python)**:
  - PEP 8 formatting, clear type hints (`List[Dict]`, `Optional[str]`).
  - Keep SQL queries centralized in `backend/database.py`; avoid raw SQL in router files.
  - Wrap API responses in clean JSON structures or Pydantic models.
  - Handle LLM API rate limits & network exceptions gracefully with fallback heuristic algorithms.
- **Frontend (JavaScript / React)**:
  - Functional React components using modern hooks (`useState`, `useEffect`, `useCallback`, `useMemo`).
  - Centralize all HTTP API calls in `frontend/src/api/client.js`.
  - Use custom CSS variables defined in `App.css` (dark mode HSL tokens, glassmorphic cards).

## Architecture Rules
- **FastAPI Endpoints**: Register routers in `backend/main.py` using standard `/api` prefix.
- **SQLite Caching**: AI code reviews are keyed by `repo_name#pr_number` + `head_sha` in `ai_reviews` table.
- **State Flow**: Frontend state updates are driven by API responses from `client.js`.
- **Environment Rules**: Environment variables load from `.env`. Protected system variables (`APP_ENV`, `PROTECTED_SYSTEM_ID`) cannot be overridden via CLI args.

## Testing & Verification Policy
- **Mandatory Verification**: Always verify code changes by executing the unified test runner:
  ```bash
  python run_tests.py
  ```
- **Test Integrity**: Never comment out or delete failing assertions. Fix the root cause in logic.

## Documentation Ownership
- Keep `AGENTS.md` concise (40–70 lines) and high-level.
- Store detailed table catalogs, API routes inventory, and LLM prompt specifications in `docs/AI_AGENT_REFERENCE.md` and `.agents/rules/`.
