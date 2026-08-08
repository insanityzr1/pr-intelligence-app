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
    
    # AI Provider Keys
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    
    # Preferred Provider (auto, gemini, openai, anthropic, ollama)
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "auto").lower()
    
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
