import uuid
from datetime import datetime
import json
from sqlalchemy import Column, String, Float, Integer, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String(255), nullable=False)
    storage_path = Column(String(512), nullable=False)
    file_size = Column(Integer, default=0)
    mime_type = Column(String(100), nullable=False)
    thumbnail_path = Column(String(512), nullable=True)
    
    # Metadata fields
    owner_id = Column(String(255), nullable=True, index=True)
    document_type = Column(String(50), default="Receipt") # Receipt, Tax Invoice, Purchase Order, Bill, Medical Bill, Transport Bill, Utility Bill, Other
    merchant_name = Column(String(255), nullable=True)
    merchant_address = Column(Text, nullable=True)
    customer_name = Column(String(255), nullable=True)
    invoice_number = Column(String(100), nullable=True)
    invoice_date = Column(String(50), nullable=True)
    due_date = Column(String(50), nullable=True)
    tax_id = Column(String(100), nullable=True) # GSTIN, Tax ID, etc.
    currency = Column(String(10), default="INR")
    
    # Financial fields
    subtotal = Column(Float, nullable=True)
    discount = Column(Float, default=0.0)
    tax_amount = Column(Float, nullable=True)
    total_amount = Column(Float, nullable=True)
    
    payment_status = Column(String(50), nullable=True) # Paid, Unpaid, Pending, Partial, etc.
    review_status = Column(String(50), default="ready_for_review") # ready_for_review, needs_review, verified
    processing_status = Column(String(50), default="pending") # pending, reading, extracting, validating, completed, failed
    error_message = Column(Text, nullable=True)
    confidence_score = Column(Float, default=0.9)
    raw_text = Column(Text, nullable=True)
    
    # JSON encoded tags and uncertain fields list
    tags_json = Column(Text, default="[]")
    uncertain_fields_json = Column(Text, default="[]")
    
    # Secure share token
    share_token = Column(String(64), unique=True, default=lambda: uuid.uuid4().hex)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    line_items = relationship("LineItem", back_populates="document", cascade="all, delete-orphan", lazy="joined")

    @property
    def tags(self):
        try:
            return json.loads(self.tags_json) if self.tags_json else []
        except Exception:
            return []

    @tags.setter
    def tags(self, val):
        self.tags_json = json.dumps(val or [])

    @property
    def uncertain_fields(self):
        try:
            return json.loads(self.uncertain_fields_json) if self.uncertain_fields_json else []
        except Exception:
            return []

    @uncertain_fields.setter
    def uncertain_fields(self, val):
        self.uncertain_fields_json = json.dumps(val or [])


class LineItem(Base):
    __tablename__ = "line_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    description = Column(String(255), nullable=False)
    category = Column(String(100), default="General")
    quantity = Column(Float, default=1.0)
    unit_price = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    is_suggested_category = Column(Boolean, default=False)
    
    document = relationship("Document", back_populates="line_items")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
