import logging

from pydantic import model_validator
from pydantic_settings import BaseSettings
from functools import lru_cache

_PLACEHOLDER_SECRETS = {"change-me-in-production", "your-super-secret-key-change-in-production", "change-me"}


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/drs_inventory"

    # JWT
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # External API
    API_KEY: str = "change-me"

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    BACKUP_BUCKET: str = "inventory-backups"

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # App
    APP_ENV: str = "development"

    @model_validator(mode="after")
    def _validate_production_secrets(self):
        if self.APP_ENV == "production":
            if self.JWT_SECRET in _PLACEHOLDER_SECRETS or len(self.JWT_SECRET) < 32:
                raise ValueError(
                    "PRODUCTION STARTUP BLOCKED: JWT_SECRET is a placeholder or too short (min 32 chars). "
                    "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
                )
        elif self.JWT_SECRET in _PLACEHOLDER_SECRETS:
            logging.warning(
                "JWT_SECRET is a placeholder — acceptable for development, "
                "but must be changed before production deployment."
            )
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
