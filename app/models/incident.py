from app.db.base import Base
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from uuid import uuid4, UUID


class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    event_id: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    

