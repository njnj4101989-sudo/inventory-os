"""Common base schemas and re-exports."""

from pydantic import BaseModel, ConfigDict, Field


class BaseSchema(BaseModel):
    """All response schemas inherit this for ORM compatibility."""

    model_config = ConfigDict(from_attributes=True)


class PaginatedParams(BaseModel):
    """Query parameters for paginated list endpoints."""

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=0, le=500)
    sort_by: str = "created_at"
    sort_order: str = "desc"


class PaginatedResponse(BaseSchema):
    """Wrapper for paginated list responses."""

    total: int
    page: int
    pages: int
