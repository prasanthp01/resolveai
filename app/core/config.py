from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+asyncpg://resolveai_app:unset@127.0.0.1:55433/resolveai"
    demo_mode: bool = True
    public_origin: str = "http://localhost:8130"
    cookie_secure: bool = True
    connector_key: str = ""
    allowed_connector_networks: str = ""
    llm_enabled: bool = False
    llm_api_key: str = ""
    llm_model: str = ""
    llm_daily_requests: int = 20
    build_sha: str = "development"


@lru_cache
def settings():
    return Settings()
