"""Global exception handlers for the FastAPI application.

Register these in main.py (6A-10) via:
    register_exception_handlers(app)
"""

import logging

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.exceptions import AppException

logger = logging.getLogger(__name__)


async def app_exception_handler(_request: Request, exc: AppException) -> JSONResponse:
    """Handle all AppException subclasses → standard JSON error response."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": exc.error_code,
            "detail": exc.detail,
            "timestamp": exc.timestamp,
        },
    )


async def generic_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unhandled exceptions → 500 with safe message."""
    logger.exception("Unhandled exception: %s", exc)
    from datetime import datetime, timezone

    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "internal_error",
            "detail": "An unexpected error occurred",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Log validation errors so we can debug 422s from production logs."""
    logger.warning("Validation error on %s %s: %s", request.method, request.url.path, exc.errors())
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )


def register_exception_handlers(app) -> None:
    """Register all exception handlers on the FastAPI app instance."""
    app.add_exception_handler(AppException, app_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)
