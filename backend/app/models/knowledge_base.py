from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class KnowledgeCategory(str, Enum):
    BRAND_DNA = "BRAND_DNA"
    GUIDELINE = "GUIDELINE"
    COMPANY_FACT = "COMPANY_FACT"
    PRODUCT_SERVICE = "PRODUCT_SERVICE"
    PROMOTIONAL_CLAIM = "PROMOTIONAL_CLAIM"
    TERMINOLOGY = "TERMINOLOGY"
    OFFICIAL_ASSET = "OFFICIAL_ASSET"
    REFERENCE_DESIGN = "REFERENCE_DESIGN"
    PROHIBITED_MESSAGING = "PROHIBITED_MESSAGING"
    POLICY_EXCEPTION = "POLICY_EXCEPTION"


class KnowledgeProvenance(str, Enum):
    COMPANY_FACT = "COMPANY_FACT"          # Immutable ground truth verified by leadership
    OFFICIAL_POLICY = "OFFICIAL_POLICY"    # Formal legal or compliance policy
    APPROVED_AI = "APPROVED_AI"            # AI synthesis reviewed and signed off by authorized personnel
    UNAPPROVED_AI = "UNAPPROVED_AI"        # Draft AI recommendation (strictly prohibited in active facts)


class ClaimEvidence(BaseModel):
    """
    Approved promotional claim paired with auditable evidence source.
    """
    claim_text: str = Field(..., description="Approved marketing or promotional claim statement")
    evidence_source: str = Field(..., description="Formal evidence, audit certification, or benchmark study")
    evidence_ref: Optional[str] = Field(default=None, description="External URL, citation document, or audit ID")
    verified_date: Optional[str] = Field(default=None, description="Date verified by legal/compliance")
    valid_until: Optional[str] = Field(default=None, description="Expiration date of the claim validity")
    substantiated: bool = Field(default=True, description="True if evidence has been formally verified")


class PolicyExceptionData(BaseModel):
    """
    Formal policy exception exempting specific phrases or creatives for a defined campaign scope.
    """
    exception_id: str = Field(..., description="Unique exception identifier, e.g. EXP-2026-BF-01")
    rule_name: str = Field(..., description="Name of the standard rule or policy being exempted")
    permitted_phrase_or_pattern: str = Field(..., description="Specific phrase, regex, or claim exempted")
    campaign_scope: str = Field(..., description="Applicable campaign or creative scope (e.g. Black Friday 2026)")
    approved_by: str = Field(..., description="Authorizing legal, compliance, or brand executive")
    valid_from: str = Field(..., description="Start timestamp of exception window")
    valid_until: str = Field(..., description="End timestamp of exception window")
    legal_notes: Optional[str] = Field(default=None, description="Contextual justification or stipulations")


class KnowledgeItem(BaseModel):
    """
    Tenant-isolated Brand Knowledge Base entry with versioning, provenance, and pgvector embeddings.
    """
    item_id: str = Field(..., description="Unique knowledge item ID")
    org_id: str = Field(..., description="Tenant organization ID guaranteeing confidentiality")
    brand_id: str = Field(..., description="Associated brand identifier")
    category: KnowledgeCategory = Field(..., description="One of 10 official knowledge domains")
    title: str = Field(..., description="Concise title or descriptor")
    content: str = Field(..., description="Full text, guideline body, fact, or definition")
    structured_data: Optional[Dict[str, Any]] = Field(default=None, description="Domain-specific payload")
    provenance: KnowledgeProvenance = Field(..., description="Authenticity provenance source")
    is_approved: bool = Field(default=True, description="Must be approved to be retrieved during audits")
    approved_by: Optional[str] = Field(default=None, description="Sign-off authority")
    approved_at: Optional[str] = Field(default=None, description="Approval timestamp")
    version: int = Field(default=1, description="Sequential version number")
    is_active: bool = Field(default=True, description="Whether this version is currently active")
    superseded_by: Optional[str] = Field(default=None, description="ID of newer item if superseded")
    version_notes: Optional[str] = Field(default="Initial baseline version", description="Changelog for this version")
    tags: List[str] = Field(default_factory=list, description="Keywords for fast categorical retrieval")
    embedding: Optional[List[float]] = Field(default=None, description="384-dimensional pgvector semantic embedding")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @field_validator("is_approved")
    @classmethod
    def validate_provenance_approval(cls, v: bool, info) -> bool:
        prov = info.data.get("provenance")
        if prov == KnowledgeProvenance.UNAPPROVED_AI and v:
            raise ValueError("AI-generated recommendations can never be marked as approved company facts without explicit human review.")
        return v


class KnowledgeVersionSnapshot(BaseModel):
    """
    Immutable audit history record capturing changes and prior versions of guidelines.
    """
    snapshot_id: str = Field(..., description="Unique snapshot record identifier")
    item_id: str = Field(..., description="Target knowledge item ID")
    org_id: str = Field(..., description="Organization ID")
    version: int = Field(..., description="Version captured in this snapshot")
    changed_by: str = Field(..., description="User or system modifying the item")
    change_reason: str = Field(..., description="Audit changelog explanation")
    previous_data: Dict[str, Any] = Field(..., description="Full copy of the item at this version")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class KnowledgeItemCreate(BaseModel):
    org_id: str = Field(..., min_length=1)
    brand_id: str = Field(..., min_length=1)
    category: KnowledgeCategory
    title: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    structured_data: Optional[Dict[str, Any]] = None
    provenance: KnowledgeProvenance = KnowledgeProvenance.COMPANY_FACT
    is_approved: bool = True
    approved_by: Optional[str] = None
    version_notes: Optional[str] = "Initial registration"
    tags: List[str] = Field(default_factory=list)


class KnowledgeItemUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    structured_data: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None
    changed_by: str = Field(..., description="Identity of the person making the change")
    change_reason: str = Field(..., description="Mandatory audit trail changelog entry")


class KnowledgeSearchQuery(BaseModel):
    query: str
    org_id: str
    brand_id: Optional[str] = None
    categories: Optional[List[KnowledgeCategory]] = None
    top_k: int = 5
    min_similarity: float = 0.15
    active_only: bool = True


class KnowledgeSearchResult(BaseModel):
    item: KnowledgeItem
    similarity_score: float
    retrieval_method: str = "vector_cosine"
    matched_segment: Optional[str] = None
