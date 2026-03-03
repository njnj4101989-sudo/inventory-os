"""Inventory-OS — FastAPI Application Entry Point.

Run with: uvicorn app.main:app --reload
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import engine
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


app = FastAPI(
    title="Inventory-OS",
    version="0.1.0",
    description="Textile Inventory Management System",
    lifespan=lifespan,
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
    openapi_url="/api/v1/openapi.json",
)

# CORS — explicit origins for dev + production
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
register_exception_handlers(app)

# Routes
app.include_router(api_router, prefix="/api/v1")


@app.get("/api/v1/health", tags=["health"])
async def health_check():
    return {"status": "ok", "service": "inventory-os"}
