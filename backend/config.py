import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "PR Intelligence Application"
    VERSION: str = "1.0.0"
    
    # AI Provider Keys
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    
    # Preferred Provider (auto, gemini, openai, anthropic, ollama)
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "auto").lower()
    
    # Database
    DB_PATH: str = os.getenv("DB_PATH", "pr_intelligence.db")
    
settings = Settings()
