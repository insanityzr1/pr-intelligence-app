import os
import sys
from dotenv import load_dotenv

# Load .env file from project root or current dir
dotenv_path = os.path.join(os.path.dirname(__file__), "..", ".env")
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
else:
    load_dotenv()

class Settings:
    PROJECT_NAME: str = "PR Intelligence Application"
    VERSION: str = "1.0.0"
    
    # Server Settings
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", 8000))
    RELOAD: bool = os.getenv("RELOAD", "true").lower() == "true"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "info")
    
    # Event-driven freshness (L4).
    # Secret shared with GitHub's webhook config; when empty, deliveries are
    # accepted unverified and a warning is logged.
    GITHUB_WEBHOOK_SECRET: str = os.getenv("GITHUB_WEBHOOK_SECRET", "")
    # Periodic reconciliation for missed webhooks. 0 disables the loop.
    SYNC_INTERVAL_SECONDS: int = int(os.getenv("SYNC_INTERVAL_SECONDS", 0))

    # Environment mode: 'development' (default) or 'production'
    APP_ENV: str = os.getenv("APP_ENV", "development").lower()

    # Shared-secret auth (L8).
    # In development mode, defaults to "dev-secret-key" if unset.
    # In production mode, MUST be explicitly set via environment variable or .env.
    API_KEY: str = os.getenv(
        "API_KEY",
        "dev-secret-key" if os.getenv("APP_ENV", "development").lower() in ("development", "dev") else ""
    )

    def validate_security(self):
        if self.APP_ENV == "production" and not self.API_KEY:
            raise ValueError("APP_ENV=production requires a non-empty API_KEY to be set in environment or .env file.")

    # Git merge engine.
    # GITHUB_TOKEN was absent entirely before: auth was ambient via `gh auth
    # login`. When unset, GitService falls back to `gh auth token` so existing
    # installs keep working without new configuration.
    GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")
    GIT_MIRROR_DIR: str = os.getenv("GIT_MIRROR_DIR", ".git-mirrors")
    GIT_FETCH_TTL: int = int(os.getenv("GIT_FETCH_TTL", 300))
    # Real merges require cloning. Set false for offline/air-gapped runs; the
    # app then falls back to the file-overlap heuristic.
    GIT_MERGE_ENABLED: bool = os.getenv("GIT_MERGE_ENABLED", "true").lower() == "true"
    # Guard against pathological workspaces: pairwise simulation is O(n^2).
    GIT_MAX_PAIRWISE_PRS: int = int(os.getenv("GIT_MAX_PAIRWISE_PRS", 25))

    # CORS. Comma-separated list, or "*" for any origin.
    CORS_ALLOW_ORIGINS: list = [
        o.strip() for o in os.getenv("CORS_ALLOW_ORIGINS", "*").split(",") if o.strip()
    ]

    # AI Provider Keys
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")

    # Preferred Provider (auto, gemini, openai, anthropic, deepseek, ollama)
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "auto").lower()

    # Model IDs per provider. Previously hardcoded in six places across
    # AIService, which made them impossible to update without a code change.
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    ANTHROPIC_MODEL: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")
    DEEPSEEK_MODEL: str = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.1")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

    # Outbound request timeout for AI provider calls, in seconds.
    AI_TIMEOUT: int = int(os.getenv("AI_TIMEOUT", 30))

    # Application Fetch Limits & Defaults
    PR_FETCH_LIMIT: int = int(os.getenv("PR_FETCH_LIMIT", 100))
    DEFAULT_REPO: str = os.getenv("DEFAULT_REPO", "rpnunez/wp-ai-scheduler")
    DEFAULT_PR_COUNT: int = int(os.getenv("DEFAULT_PR_COUNT", 100))
    DEFAULT_ORDERBY: str = os.getenv("DEFAULT_ORDERBY", "updated-desc")
    DB_PATH: str = os.getenv("DB_PATH", "pr_intelligence.db")
    
    # Protected Settings (Cannot be overridden via CLI flags)
    APP_ENV: str = os.getenv("APP_ENV", "production")
    PROTECTED_SYSTEM_ID: str = os.getenv("PROTECTED_SYSTEM_ID", "pr-intel-master-v1")
    SYSTEM_SALT: str = os.getenv("SYSTEM_SALT", "pr_intel_sec_key_2026")
    
    PROTECTED_FIELDS = {"APP_ENV", "PROTECTED_SYSTEM_ID", "SYSTEM_SALT"}

    def apply_cli_overrides(self, cli_args: dict):
        """
        Apply CLI argument overrides to settings.
        Ignores overrides for protected fields and prints a warning.
        """
        for key, val in cli_args.items():
            if val is None:
                continue
                
            attr_name = key.upper()
            
            # Check protected field invariant
            if attr_name in self.PROTECTED_FIELDS:
                print(f"[SECURITY WARNING] '{attr_name}' is a protected configuration field and cannot be overridden via CLI args.", file=sys.stderr)
                continue
                
            if hasattr(self, attr_name):
                current_val = getattr(self, attr_name)
                if isinstance(current_val, bool) and not isinstance(val, bool):
                    casted_val = str(val).lower() in ("true", "1", "yes")
                elif isinstance(current_val, int) and not isinstance(val, int):
                    casted_val = int(val)
                else:
                    casted_val = val
                    
                setattr(self, attr_name, casted_val)
                print(f"[CONFIG OVERRIDE] {attr_name} = {casted_val} (via CLI flag)")

settings = Settings()
