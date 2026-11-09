from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime

class LineItemBase(BaseModel):
    description: str
    category: str = "General"
    quantity: float = 1.0
    unit_price: float = 0.0
    tax_amount: float = 0.0
    total: float = 0.0
    is_suggested_category: bool = False

class LineItemCreate(LineItemBase):
    pass

class ManualExpenseCreate(BaseModel):
    merchant_name: str
    total_amount: float
    category: str = "Others"
    invoice_date: Optional[str] = None
    invoice_number: Optional[str] = None

class LineItemResponse(LineItemBase):
    id: str
    document_id: str
    model_config = ConfigDict(from_attributes=True)


class DocumentUpdate(BaseModel):
    document_type: Optional[str] = None
    merchant_name: Optional[str] = None
    merchant_address: Optional[str] = None
    customer_name: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    tax_id: Optional[str] = None
    currency: Optional[str] = None
    subtotal: Optional[float] = None
    discount: Optional[float] = None
    tax_amount: Optional[float] = None
    total_amount: Optional[float] = None
    payment_status: Optional[str] = None
    review_status: Optional[str] = None
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
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = "gemini-2.5-flash"
    default_currency: Optional[str] = "INR"
    has_api_key: bool = False


class ProcessStepEvent(BaseModel):
    step: str
    message: str
    status: str # in_progress, completed, failed
