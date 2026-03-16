"""Inventory-OS — FastAPI Application Entry Point.

Run with: uvicorn app.main:app --reload
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.database import engine
from app.core.security import verify_token, ACCESS_COOKIE_NAME
from app.api.router import api_router
from app.core.error_handlers import register_exception_handlers
from app.core.event_bus import event_bus
from app.tasks import (
    start_reservation_expiry,
    stop_reservation_expiry,
    start_backup_sync,
    stop_backup_sync,
)

settings = get_settings()

# --- P4-8: Structured logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Startup / shutdown lifecycle."""
    start_reservation_expiry()
    start_backup_sync()
    yield
    stop_reservation_expiry()
    stop_backup_sync()
    event_bus.close_all()
    await engine.dispose()


# --- P4-3: Disable Swagger UI in production ---
_is_prod = settings.APP_ENV == "production"

app = FastAPI(
    title="Inventory-OS",
    version="0.1.0",
    description="Textile Inventory Management System",
    lifespan=lifespan,
    docs_url=None if _is_prod else "/api/v1/docs",
    redoc_url=None if _is_prod else "/api/v1/redoc",
    openapi_url=None if _is_prod else "/api/v1/openapi.json",
)

# CORS — explicit origins for dev + production
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Tenant middleware — extract company_schema from JWT cookie ---
_mw_logger = logging.getLogger("tenant_middleware")

class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request.state.company_schema = "public"  # default
        token = request.cookies.get(ACCESS_COOKIE_NAME)
        if token:
            try:
                payload = verify_token(token)
                schema = payload.get("company_schema")
                if schema:
                    request.state.company_schema = schema
            except Exception as e:
                # Don't block the request — auth dependency will reject invalid tokens.
                # But log so we can diagnose stale-cookie issues.
                _mw_logger.debug("JWT decode skipped in middleware: %s", e)
        response = await call_next(request)
        return response

app.add_middleware(TenantMiddleware)

# Exception handlers
register_exception_handlers(app)

# Routes
app.include_router(api_router, prefix="/api/v1")


@app.get("/api/v1/health", tags=["health"])
async def health_check():
    return {"status": "ok", "service": "inventory-os"}
