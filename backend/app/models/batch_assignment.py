from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BatchAssignment(Base):
    __tablename__ = "batch_assignments"

    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("batches.id", ondelete="CASCADE"), index=True)
    tailor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("public.users.id", ondelete="RESTRICT"), index=True)
    checker_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("public.users.id", ondelete="SET NULL"), index=True)
    assigned_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("public.users.id", ondelete="RESTRICT"), index=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    batch: Mapped[Batch] = relationship(back_populates="assignments")
    tailor: Mapped[User] = relationship(foreign_keys=[tailor_id])
    checker: Mapped[User | None] = relationship(foreign_keys=[checker_id])
    assigned_by_user: Mapped[User] = relationship(foreign_keys=[assigned_by])
