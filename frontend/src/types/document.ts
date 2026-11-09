export interface LineItem {
  id?: string;
  document_id?: string;
  description: string;
  category: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  total: number;
  is_suggested_category?: boolean;
}

export interface DocumentData {
  id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  thumbnail_url?: string | null;
  file_url: string;
  document_type: string;
  merchant_name?: string | null;
  merchant_address?: string | null;
  customer_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  tax_id?: string | null;
  currency: string;
  subtotal?: number | null;
  discount?: number | null;
  tax_amount?: number | null;
  total_amount?: number | null;
  payment_status?: string | null;
  review_status: 'ready_for_review' | 'needs_review' | 'verified';
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string | null;
  confidence_score: number;
  tags: string[];
  uncertain_fields: string[];
  line_items: LineItem[];
  share_token: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentListItem {
  id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  thumbnail_url?: string | null;
  document_type: string;
  merchant_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  currency: string;
  total_amount?: number | null;
  line_items_count: number;
  processing_status: string;
  review_status: string;
  created_at: string;
}

export interface AppSettings {
  gemini_api_key?: string;
  gemini_model?: string;
  default_currency?: string;
  has_api_key: boolean;
}
