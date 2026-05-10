import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class PlanType(str, PyEnum):
    free = "free"
    pro = "pro"
    business = "business"


class BillingCycle(str, PyEnum):
    monthly = "monthly"
    weekly = "weekly"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    # Refresh token criptografado com AES-256-GCM — NUNCA em texto plano
    encrypted_refresh_token: Mapped[str | None] = mapped_column(Text)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    picture_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    plan: Mapped[PlanType] = mapped_column(
        Enum(PlanType, name="plantype"), default=PlanType.free, nullable=False
    )
    billing_cycle: Mapped[BillingCycle | None] = mapped_column(
        Enum(BillingCycle, name="billingcycle"), nullable=True
    )
    plan_started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    plan_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deletions_this_month: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deletions_month_reset: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class EmailMetadata(Base):
    """
    Cache local de metadados — não armazena body do email.
    Fonte de verdade continua sendo o Gmail. Isso é só para queries rápidas.
    """

    __tablename__ = "email_metadata"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # Gmail message ID
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    sender: Mapped[str] = mapped_column(String(500), nullable=False)
    sender_domain: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str | None] = mapped_column(Text)
    date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    gmail_category: Mapped[str | None] = mapped_column(String(50))  # inbox/promotions/social
    ai_category: Mapped[str | None] = mapped_column(String(100))  # streaming/financial/spam
    has_unsubscribe: Mapped[bool] = mapped_column(Boolean, default=False)
    unsubscribe_url: Mapped[str | None] = mapped_column(Text)
    indexed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_email_user_domain", "user_id", "sender_domain"),
        Index("ix_email_user_category", "user_id", "ai_category"),
        Index("ix_email_user_date", "user_id", "date"),
    )


class SenderSummary(Base):
    """Agregação por remetente — atualizada após cada scan."""

    __tablename__ = "sender_summary"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True
    )
    sender_domain: Mapped[str] = mapped_column(String(255), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(255))
    ai_category: Mapped[str | None] = mapped_column(String(100))
    total_count: Mapped[int] = mapped_column(Integer, default=0)
    unread_count: Mapped[int] = mapped_column(Integer, default=0)
    oldest_email: Mapped[datetime | None] = mapped_column(DateTime)
    newest_email: Mapped[datetime | None] = mapped_column(DateTime)
    has_unsubscribe: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class ActionLog(Base):
    """
    Audit trail de TODA ação destrutiva.
    Obrigatório para suporte e compliance LGPD.
    """

    __tablename__ = "action_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    action_type: Mapped[str] = mapped_column(String(50), nullable=False)  # bulk_delete/label/unsub
    target: Mapped[str] = mapped_column(String(500), nullable=False)  # sender domain ou query
    gmail_query: Mapped[str | None] = mapped_column(Text)  # query exata usada
    affected_count: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending/running/done/failed
    dry_run: Mapped[bool] = mapped_column(Boolean, default=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)  # quando usuário confirmou
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (Index("ix_action_user", "user_id", "created_at"),)


class ScanJob(Base):
    """Rastreia progresso do scraping de 90k emails."""

    __tablename__ = "scan_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending/running/done/failed
    total_estimated: Mapped[int | None] = mapped_column(Integer)
    total_indexed: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AutoRule(Base):
    __tablename__ = "auto_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    condition_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "domain" | "category" | "keyword"
    condition_value: Mapped[str] = mapped_column(
        String(255), nullable=False
    )  # "newsletter.com" | "spam" | "promoção"
    action_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "trash" | "mark_read" | "label"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (Index("ix_rule_user", "user_id", "is_active"),)


class Subscription(Base):
    """Subscriptions registered by the user (e.g. newsletters / services to monitor)."""

    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    sender_domain: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    renewal_date: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (Index("ix_sub_user_domain", "user_id", "sender_domain", unique=True),)
