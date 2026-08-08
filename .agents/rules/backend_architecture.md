# Backend Architecture & Coding Rules

## FastAPI Router Pattern
- Place all API endpoint definitions under `backend/routers/<domain>.py`.
- Register new routers in `backend/main.py` using `app.include_router(<domain>.router, prefix="/api")`.
- Accept input parameters using Pydantic request models defined in `backend/models.py`.
- Raise `HTTPException` with clear error messages for invalid input or missing resources (e.g. `404 Not Found`).

## Persistence & SQLite Database Pattern
- All SQLite schema definitions, table creations, and SQL queries must reside in `backend/database.py`.
- Do NOT write raw `$wpdb` or direct `sqlite3.connect()` calls inside router or service classes.
- Use parameterized SQL queries (`?` placeholders) to prevent SQL injection vulnerabilities.
- SQLite tables:
  - `prs`: Cached PR metadata keyed by `f"{repo_name}#{pr_number}"`.
  - `ai_reviews`: AI analysis results keyed by `pr_number` and `head_sha`.
  - `pr_chats`: Chat history threads keyed by `pr_number` and `repo_name`.
  - `pr_tags`: Quick and custom PR tags keyed by `pr_number`, `repo_name`, and `tag`.
  - `pr_groups` & `pr_group_items`: Custom PR workspace staging buckets.
  - `changelogs`: Generated release notes markdown and metadata.
  - `repositories`: Multi-repo tracking list.

## Business Logic & Service Isolation
- Keep routers slim by delegating business logic to service modules in `backend/services/`:
  - `AIService`: Multi-provider LLM prompts (Gemini, OpenAI, Anthropic, Ollama) and fallback heuristic analyzers.
  - `ConflictResolutionService`: Git conflict step generation, bash script generation, and patch formatting.
  - `GitHubService`: GitHub CLI (`gh pr list/diff`) integration, text sanitization, and risk score calculation.
  - `ChangelogService`: Markdown release notes compiler.
  - `DiffParser`: Diff line parsing and context chunking for token optimization.
