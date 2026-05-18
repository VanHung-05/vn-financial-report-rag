from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo root: apps/api/app/config.py -> parents[3]
_REPO_ROOT = Path(__file__).resolve().parents[3]
_ENV_FILES = (str(_REPO_ROOT / ".env"), ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://raguser:ragpass@localhost:5433/vnfinrag"
    database_url_sync: str = "postgresql://raguser:ragpass@localhost:5433/vnfinrag"
    redis_url: str = "redis://localhost:6379/0"

    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    embedding_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    embedding_model: str = "nomic-embed-text"
    embedding_dimensions: int = 768

    llm_provider: str = "gemini"
    gemini_api_key: str = ""
    llm_model: str = "gemini-2.0-flash"

    ocr_provider: str = "none"
    seed_data_rate_limit: int = 2


settings = Settings()
