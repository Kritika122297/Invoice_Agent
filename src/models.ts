

export interface LineItem {
  sku: string | null;
  description: string;
  qty: number;
  unitPrice: number;
}

export interface ExtractedFields {
  invoiceNumber: string;
  invoiceDate: string;      
  serviceDate: string | null;
  currency: string | null;
  poNumber?: string | null;
  netTotal: number;
  taxRate: number;
  taxTotal: number;
  grossTotal: number;
  lineItems: LineItem[];
}

export interface ExtractedInvoice {
  invoiceId: string;        
  vendor: string;           
  fields: ExtractedFields;
  confidence: number;
  rawText: string;
}

// memory + decision types stay as before
export type MemoryType = 'VENDOR' | 'CORRECTION' | 'RESOLUTION';

export interface MemoryEntry {
  id?: number;
  vendorName?: string;
  type: MemoryType;
  key: string;
  value: unknown;
  confidence: number;
  positiveReinforcements: number;
  negativeReinforcements: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AuditStep = 'recall' | 'apply' | 'decide' | 'learn';

export interface AuditEntry {
  step: AuditStep;
  timestamp: string;
  details: string;
}

export interface DecisionResult {
  normalizedInvoice: Record<string, unknown>;
  proposedCorrections: string[];
  requiresHumanReview: boolean;
  reasoning: string;
  confidenceScore: number;
  memoryUpdates: string[];
  auditTrail: AuditEntry[];
}
