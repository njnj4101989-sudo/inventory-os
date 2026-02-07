"""Custom exception classes — maps to STEP4 §4.5 error codes.

All domain exceptions inherit from AppException.  Global handlers in
error_handlers.py convert these into the standard JSON error response.
"""

from datetime import datetime, timezone


class AppException(Exception):
    """Base exception for all application errors."""

    status_code: int = 500
    error_code: str = "internal_error"

    def __init__(self, detail: str = "An unexpected error occurred"):
        self.detail = detail
        self.timestamp = datetime.now(timezone.utc).isoformat()
        super().__init__(detail)


class ValidationError(AppException):
    status_code = 400
    error_code = "validation_error"


class InvalidStateTransitionError(AppException):
    status_code = 400
    error_code = "invalid_state_transition"


class UnauthorizedError(AppException):
    status_code = 401
    error_code = "unauthorized"


class TokenExpiredError(AppException):
    status_code = 401
    error_code = "token_expired"


class ForbiddenError(AppException):
    status_code = 403
    error_code = "forbidden"


class NotFoundError(AppException):
    status_code = 404
    error_code = "not_found"


class DuplicateError(AppException):
    status_code = 409
    error_code = "duplicate"


class InsufficientStockError(AppException):
    status_code = 409
    error_code = "insufficient_stock"


class AlreadyAssignedError(AppException):
    status_code = 409
    error_code = "already_assigned"


class ReservationExpiredError(AppException):
    status_code = 410
    error_code = "reservation_expired"


class BusinessRuleViolationError(AppException):
    status_code = 422
    error_code = "business_rule_violation"
