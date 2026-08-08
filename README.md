# ⚡ PR Intelligence App (`pr-intelligence-app`)

An enterprise-grade **AI-powered Pull Request Triage, Analysis, Code Review, Conflict Resolution, and Release Planning Application** built for high-volume developers, tech leads, and DevOps engineers.

---

## 🌟 Modern Features & Capabilities

### 🏷️ Custom Tagging Engine & Quick Flags
- **Quick Preset Tags**: 1-click tagging with `⭐ Starred`, `🚀 Must Review`, `🧪 Needs QA`, `⏳ Waiting on Author`, and `🚫 Blocked`.
- **Custom Tags**: Create and attach arbitrary custom tags per PR.
- **Matrix Filtering**: Instant matrix row filtering by active tag, review status, or risk level.

### 📦 PR Workspaces & Staging Buckets (`PR Workspaces` Tab)
- **Custom Release Buckets**: Group PRs into feature iterations, sprint release buckets, or security triage queues (`pr_groups`, `pr_group_items`).
- **Batch AI Operations**: Execute multi-PR batch AI code reviews across staged items in a workspace.
- **Group Changelogs**: Generate single-click release notes for entire staging buckets.

### 🚀 Release Builder & Saved Changelogs History
- **Typeahead Instant Filter**: Filter PRs by `#1874` PR number, branch names (`feature/admin`), title, or author.
- **Saved Changelogs Sidebar**: All generated release notes are stored in SQLite (`changelogs` table) with PR numbers, branch metadata, and timestamps.
- **1-Click Loading**: Load, view, copy, or delete historical changelogs instantly in a condensed 3-column layout.

### ⚔️ Actionable Conflict Resolver & Bash Script Generator
- **Categorized Step Groups**: Structural step-by-step conflict resolution guide (Fetch & Sync, Rebase/Cherry-pick, Conflict Staging, Verification).
- **1-Click Bash Script Download**: Download executable `.sh` shell scripts pre-filled with git commands to resolve conflicts locally in one terminal run.
- **Patch Preview**: Download generated `.patch` files or preview 3-way resolved code logic.

### 🔍 Centered Extra-Wide PR Workspace Modal & AI Chat
- **Centered 1240px Extra-Wide Modal**: Maximized view for code inspection and overview data.
- **Tight Overview Grid**: Display Code Quality Score (0–100), Risk Badges, AI Executive Synthesis, Architectural Impact, Security & Breaking Changes, and QA Test Scenarios.
- **Persistent AI Chat per PR**: Multi-turn chat thread per PR connected to real diff analysis for asking follow-up questions, asking for unit tests, or rebase advice.

### ⚡ Performance & Caching Architecture
- **Provider-Agnostic AI Engine**: Connects to **Google Gemini**, **OpenAI**, **Anthropic**, **Ollama**, or **DeepSeek**.
- **SHA-Based SQLite Cache**: Stores AI reviews keyed by `repo_name#pr_number` and commit SHA (`head_sha`), avoiding redundant LLM calls.
- **Configurable PR Fetch Limit**: Configurable `PR_FETCH_LIMIT=100` setting with background sync and local SQLite caching for instant cold starts.
- **Multi-Repository Manager**: Easily add, switch, or remove active GitHub repositories dynamically from the header UI.

---

## 🧪 Comprehensive Test Layer

The application includes unit, feature, and integration test coverage across Python and React.

### Running All Tests (1-Click Unified Runner)
```bash
python run_tests.py
```

### Running Backend Tests (Pytest)
```bash
python -m pytest backend/tests -v
```

### Running Frontend Tests (Vitest + React Testing Library)
```bash
cd frontend
npm test
```

---

## 🚀 Quick Start Guide

### 1. Clone & Navigate

```bash
cd /path/to/pr-intelligence-app
```

### 2. Environment Configuration (`.env`)

Copy `.env.example` to `.env` and set your preferred AI API key:

```bash
cp .env.example .env
```

Example `.env` configuration:

```env
# Server Settings
HOST=0.0.0.0
PORT=8000
RELOAD=true
DEBUG=false

# Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Preferred AI Provider (gemini, openai, anthropic, ollama, auto)
AI_PROVIDER=gemini

# App Defaults
DEFAULT_REPO=rpnunez/wp-ai-scheduler
PR_FETCH_LIMIT=100
DB_PATH=pr_intelligence.db
```

---

### 3. Backend Setup (FastAPI)

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Start the FastAPI backend server
python backend/main.py
```

*Optional CLI flags:*
```bash
python backend/main.py --port 9000 --ai-provider gemini --debug
```

---

### 4. Frontend Setup (React / Vite)

```bash
cd frontend

# Install Node dependencies
npm install

# Start Vite dev server
npm run dev
```

Open your browser to 👉 **`http://localhost:3000`** *(or `http://localhost:8000`)*.

---

## ⚙️ Environment Config vs CLI Overrides

Settings are loaded from `.env` and can be overridden via CLI flags at startup:

| Setting | `.env` Key | CLI Flag | Protected? |
| :--- | :--- | :--- | :---: |
| Server Host | `HOST` | `--host` | No |
| Server Port | `PORT` | `--port` | No |
| AI Provider | `AI_PROVIDER` | `--ai-provider` | No |
| Debug Mode | `DEBUG` | `--debug` | No |
| PR Fetch Limit | `PR_FETCH_LIMIT` | -- | No |
| Environment | `APP_ENV` | Locked | **Yes** |

---

## 📁 Repository Structure

```
pr-intelligence-app/
├── backend/
│   ├── main.py                  # FastAPI Application Entrypoint
│   ├── config.py                # Environment & CLI Configuration Loader
│   ├── database.py              # SQLite Schema & Operations Manager
│   ├── models.py                # Pydantic Schemas
│   ├── routers/                 # API Endpoint Routers (prs, conflicts, changelog, tags, export, repos)
│   ├── services/                # Business Logic Services (AIService, ConflictResolution, GitHubService, etc.)
│   └── tests/                   # Pytest Test Suite (test_database, test_services, test_routers)
├── frontend/
│   ├── src/
│   │   ├── api/client.js        # Frontend API Client Wrappers
│   │   ├── components/          # React Components (PRMatrix, PRDetailDrawer, ReleaseBuilder, PRTagBar, etc.)
│   │   └── __tests__/           # Vitest Unit & Feature Component Test Suite
│   ├── vite.config.js           # Vite & Vitest Configuration
│   └── package.json             # NPM Scripts & Dependencies
├── run_tests.py                 # Unified Backend + Frontend Test Suite Runner
├── requirements.txt             # Python Package Dependencies
└── README.md                    # Project Documentation
```

---

## 🛠️ Windows Troubleshooting

### PowerShell Script Execution Policy Error

If running `npm install` in Windows PowerShell throws a `PSSecurityException`:

#### Option A: Use `npm.cmd` directly (Instant Fix)
```powershell
npm.cmd install
npm.cmd run dev
```

#### Option B: Enable PowerShell Script Execution (Permanent Fix)
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## 📄 License
MIT License. Built for high-velocity software engineering teams.
