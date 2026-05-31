from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo root: apps/worker/worker/config.py -> parents[3]
_REPO_ROOT = Path(__file__).resolve().parents[3]
_ENV_FILES = (str(_REPO_ROOT / ".env"), ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url_sync: str = "postgresql://raguser:ragpass@localhost:5433/vnfinrag"
    redis_url: str = "redis://localhost:6379/0"

    embedding_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    embedding_model: str = "bge-m3"
    embedding_dimensions: int = 1024

    llm_provider: str = "gemini"
    gemini_api_key: str = ""
    llm_model: str = "gemini-2.0-flash"

    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    # Auto-index lần đầu (khi DB trống và chạy run_worker.py)
    auto_seed_enabled: bool = True
    auto_seed_manifest: str = "public_demo.jsonl"
    auto_seed_limit: int = 5
    seed_data_rate_limit: float = 2.0

    # OCR cho PDF scan (Vietstock thường là ảnh)
    ocr_enabled: bool = True
    ocr_lang: str = "vie+eng"
    ocr_dpi: int = 300


settings = Settings()
