# ⚡ PR Intelligence App (`pr-intelligence-app`)

An AI-powered PR analysis, triage, code review, and release planning application designed for high-volume developers and teams.

---

## 🌟 Key Features

- **Provider-Agnostic AI Engine**: Connects seamlessly to **Google Gemini**, **OpenAI (GPT-4o)**, **Anthropic (Claude 3.5)**, **Ollama (local)**, or **DeepSeek** via environment configuration.
- **SHA-Based Local Caching**: SQLite persistence (`.pr_ai_cache.db`) caches AI code reviews keyed by PR ID + commit SHA (`headRefOid`), optimizing execution speed and API cost.
- **Tiered Context Pipeline**: Full diff analysis for small/medium PRs; intelligent chunking & file structure mapping for large refactors.
- **Interactive AI Chat per PR**: Multi-turn persistent chat thread per PR allowing developers to ask follow-up questions, request unit test code, or clarify code changes.
- **Cross-PR File Collision Matrix**: Visual mapping of file collisions across open PRs to catch rebase conflicts early.
- **AI Conflict Resolution & Rebase Wizard**: Explains conflict root causes, provides step-by-step terminal rebase commands, previews 3-way merged code, and exports downloadable `.patch` files.
- **Release Builder & Changelog Generator**: Multi-selects PRs and groups them into coherent feature epics with draft release notes.

---

## 🚀 Quick Start Guide

### 1. Clone & Navigate

```bash
cd /path/to/pr-intelligence-app
```

### 2. Environment Configuration (`.env`)

Copy `.env.example` to `.env` and set your preferred AI API key (e.g. Google Gemini):

```bash
cp .env.example .env
```

Edit `.env`:

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
DEFAULT_REPO=owner/repository
DEFAULT_PR_COUNT=40
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

*Optional CLI overrides:*
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

## 🛠️ Windows Troubleshooting

### PowerShell Script Execution Policy Error

If running `npm install` in Windows PowerShell throws the following error:
```
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system.
PSSecurityException: UnauthorizedAccess
```

#### Option A: Use `npm.cmd` directly (Instant Fix)
Use `npm.cmd` instead of `npm` to bypass PowerShell script restrictions:

```powershell
npm.cmd install
npm.cmd run dev
```

#### Option B: Enable PowerShell Script Execution (Permanent Fix)
Run this command once in your PowerShell terminal to allow local script execution for your user account:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then run `npm install` and `npm run dev` normally.

---

## ⚙️ Environment Config vs CLI Overrides

Settings are loaded from `.env` and can be overridden via CLI flags at startup:

| Setting | `.env` Key | CLI Flag | Protected? |
| :--- | :--- | :--- | :---: |
| Server Host | `HOST` | `--host` | No |
| Server Port | `PORT` | `--port` | No |
| AI Provider | `AI_PROVIDER` | `--ai-provider` | No |
| Debug Mode | `DEBUG` | `--debug` | No |
| Environment | `APP_ENV` | Locked | **Yes** |

---

## 📄 License
MIT License. Created for high-volume developer workflows.
