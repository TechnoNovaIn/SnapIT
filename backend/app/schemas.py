from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator
from datetime import datetime


class LineItemBase(BaseModel):
    description: str = Field(default="Item", max_length=255)
    category: str = Field(default="General", max_length=100)
    quantity: float = Field(default=1.0, ge=0)
    unit_price: float = Field(default=0.0, ge=0)
    tax_amount: float = Field(default=0.0, ge=0)
    total: float = Field(default=0.0, ge=0)
    is_suggested_category: bool = False

    @field_validator("description", mode="before")
    @classmethod
    def _non_empty_description(cls, v):
        v = (v or "").strip() if isinstance(v, str) or v is None else str(v)
        return v or "Item"

    @field_validator("category", mode="before")
    @classmethod
    def _non_empty_category(cls, v):
        v = (v or "").strip() if isinstance(v, str) or v is None else str(v)
        return v or "General"


class LineItemCreate(LineItemBase):
    pass


class ManualExpenseCreate(BaseModel):
    merchant_name: str = Field(min_length=1, max_length=255)
    total_amount: float = Field(ge=0)
    category: str = Field(default="Others", max_length=100)
    invoice_date: Optional[str] = Field(default=None, max_length=50)
    invoice_number: Optional[str] = Field(default=None, max_length=100)


class LineItemResponse(LineItemBase):
    id: str
    document_id: str
    model_config = ConfigDict(from_attributes=True)


class DocumentUpdate(BaseModel):
    document_type: Optional[str] = Field(default=None, max_length=50)
    merchant_name: Optional[str] = Field(default=None, max_length=255)
    merchant_address: Optional[str] = None
    customer_name: Optional[str] = Field(default=None, max_length=255)
    invoice_number: Optional[str] = Field(default=None, max_length=100)
    invoice_date: Optional[str] = Field(default=None, max_length=50)
    due_date: Optional[str] = Field(default=None, max_length=50)
    tax_id: Optional[str] = Field(default=None, max_length=100)
    currency: Optional[str] = Field(default=None, max_length=10)
    subtotal: Optional[float] = Field(default=None, ge=0)
    discount: Optional[float] = Field(default=None, ge=0)
    tax_amount: Optional[float] = Field(default=None, ge=0)
    total_amount: Optional[float] = Field(default=None, ge=0)
    payment_status: Optional[str] = Field(default=None, max_length=50)
    review_status: Optional[str] = Field(default=None, pattern="^(ready_for_review|needs_review|verified)$")
    tags: Optional[List[str]] = None
    uncertain_fields: Optional[List[str]] = None
    line_items: Optional[List[LineItemBase]] = None


class DocumentResponse(BaseModel):
    id: str
    filename: str
    file_size: int
    mime_type: str
    thumbnail_url: Optional[str] = None
    file_url: str
    document_type: str
    merchant_name: Optional[str] = None
    merchant_address: Optional[str] = None
    customer_name: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    tax_id: Optional[str] = None
    currency: str
    subtotal: Optional[float] = None
    discount: Optional[float] = 0.0
    tax_amount: Optional[float] = None
    total_amount: Optional[float] = None
    payment_status: Optional[str] = None
    review_status: str
    processing_status: str
    error_message: Optional[str] = None
    confidence_score: float = 0.9
    tags: List[str] = []
    uncertain_fields: List[str] = []
    line_items: List[LineItemResponse] = []
    share_token: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class DocumentListItem(BaseModel):
    id: str
    filename: str
    file_size: int
    mime_type: str
    thumbnail_url: Optional[str] = None
    document_type: str
    merchant_name: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    currency: str
    total_amount: Optional[float] = None
    line_items_count: int = 0
    processing_status: str
    review_status: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TagUpdate(BaseModel):
    tags: List[str]


class SettingsSchema(BaseModel):
    """Settings as returned to the client. The API key is always masked."""
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = "gemini-2.5-flash"
    default_currency: Optional[str] = "INR"
    has_api_key: bool = False
    ocr_engine: Optional[str] = None


class SettingsUpdate(BaseModel):
    """Settings as sent by the client. Only fields that are present are changed."""
    gemini_api_key: Optional[str] = Field(default=None, max_length=200)
    gemini_model: Optional[str] = Field(default=None, max_length=100)
    default_currency: Optional[str] = Field(default=None, max_length=10)


class ProcessStepEvent(BaseModel):
    step: str
    message: str
    status: str # in_progress, completed, failed
