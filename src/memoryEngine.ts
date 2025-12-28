// src/memoryEngine.ts
import { MemoryStore } from './memoryStore.js';
import type {
  ExtractedInvoice,
  DecisionResult,
  MemoryEntry,
  AuditEntry,
} from './models.js';

const MIN_VENDOR_MEMORY_CONF = 0.4;
const CONF_AUTO_ACCEPT = 0.85;

export class MemoryEngine {
  private store: MemoryStore;

  constructor(store: MemoryStore) {
    this.store = store;
  }

  process(invoice: ExtractedInvoice): DecisionResult {
    const auditTrail: AuditEntry[] = [];
    const memoryUpdates: string[] = [];
    const proposedCorrections: string[] = [];

    const now = new Date().toISOString();

    // 1) recall
    const vendorMemories = this.store.getVendorMemories(
      invoice.vendor,
      MIN_VENDOR_MEMORY_CONF,
    );
    auditTrail.push({
      step: 'recall',
      timestamp: now,
      details: `Recalled ${vendorMemories.length} memories for vendor ${invoice.vendor}`,
    });

    // 2) apply
    const normalizedInvoice: Record<string, unknown> = {
      ...invoice.fields,
    };

    let confidenceScore = invoice.confidence; // start from extraction confidence
    let requiresHumanReview = true;
    const reasoningParts: string[] = [];

    // 2a) Supplier GmbH: serviceDate from "Leistungsdatum"
    if (invoice.vendor === 'Supplier GmbH') {
      const serviceMem = vendorMemories.find(
        (m) => m.key === 'label_mapping:Leistungsdatum',
      );

      const hasLeistungsdatum = invoice.rawText.includes('Leistungsdatum:');

      if (serviceMem && hasLeistungsdatum && !invoice.fields.serviceDate) {
        const match = invoice.rawText.match(/Leistungsdatum:\s*([0-9.]+)/);
        if (match && match[1]) {
          const rawDate = match[1];
          const parts = rawDate.split('.');
          if (parts.length === 3) {
            const [dd, mm, yyyy] = parts;
            const isoDate = `${yyyy}-${mm}-${dd}`;

            normalizedInvoice['serviceDate'] = isoDate;
            proposedCorrections.push(
              `Set serviceDate=${isoDate} based on vendor memory for Leistungsdatum`,
            );
            confidenceScore = Math.min(1, confidenceScore + 0.15);
            reasoningParts.push(
              'Applied learned mapping: "Leistungsdatum" → serviceDate for Supplier GmbH.',
            );
          } else {
            reasoningParts.push(
              'Found Leistungsdatum but date format was unexpected; left for human review.',
            );
          }
        } else {
          reasoningParts.push(
            'Could not parse service date from Leistungsdatum; left for human review.',
          );
        }
      } else if (hasLeistungsdatum && !invoice.fields.serviceDate) {
        reasoningParts.push(
          'Found "Leistungsdatum" in rawText but no vendor memory yet; kept for human review.',
        );
      }

      // later: add PO matching for INV-A-003 here
    }

    // 2b) Parts AG: VAT-inclusive + currency from rawText
    if (invoice.vendor === 'Parts AG') {
      const raw = invoice.rawText;

      // VAT inclusive vendor memory
      const vatMem = vendorMemories.find(
        (m) => m.key === 'tax_behavior:VAT_INCLUSIVE',
      );
      const vatInclusive =
        raw.includes('MwSt. inkl.') || raw.includes('Prices incl. VAT');

      if (vatInclusive) {
        if (vatMem) {
          reasoningParts.push(
            'Detected "MwSt. inkl." / "Prices incl. VAT" and vendor memory VAT_INCLUSIVE for Parts AG.',
          );
          proposedCorrections.push(
            'Recompute net and tax from gross because prices are VAT-inclusive (Parts AG strategy).',
          );
          confidenceScore = Math.min(1, confidenceScore + 0.15);
        } else {
          reasoningParts.push(
            'Detected "MwSt. inkl." / "Prices incl. VAT" for Parts AG but no stored strategy yet; flag for human review.',
          );
        }
      }

      // Missing currency: recover from rawText
      if (!invoice.fields.currency) {
        const currencyMatch = raw.match(/\b(EUR|USD|GBP)\b/);
        if (currencyMatch && currencyMatch[1]) {
          const curr = currencyMatch[1];
          normalizedInvoice['currency'] = curr;
          proposedCorrections.push(
            `Recovered missing currency from raw text: ${curr}`,
          );
          confidenceScore = Math.min(1, confidenceScore + 0.1);
          reasoningParts.push(
            `Recovered currency "${curr}" for Parts AG from raw text.`,
          );
        } else {
          reasoningParts.push(
            'Currency missing and not found in raw text; keep for human review.',
          );
        }
      }
    }

    // 2c) Freight & Co: Skonto terms + FREIGHT SKU mapping
    if (invoice.vendor === 'Freight & Co') {
      const raw = invoice.rawText;

      // Skonto terms
      const skontoMem = vendorMemories.find(
        (m) => m.key === 'payment_terms:skonto',
      );
      const skontoMatch = raw.match(/(\d+)%\s+Skonto.*?(\d+)\s+days?/i);
      if (skontoMatch && skontoMatch[1] && skontoMatch[2]) {
        const percent = Number(skontoMatch[1]);
        const days = Number(skontoMatch[2]);
        const existingTerms = (normalizedInvoice['paymentTerms'] ??
          {}) as Record<string, unknown>;
        normalizedInvoice['paymentTerms'] = {
          ...existingTerms,
          skonto: { percent, days },
        };
        proposedCorrections.push(
          `Extracted Skonto terms: ${percent}% if paid within ${days} days.`,
        );
        confidenceScore = Math.min(1, confidenceScore + 0.1);
        reasoningParts.push(
          'Detected and structured Skonto payment terms for Freight & Co.',
        );
      } else if (skontoMem) {
        reasoningParts.push(
          'Applied known Skonto payment pattern from memory for Freight & Co.',
        );
      }

      // FREIGHT SKU mapping for freight-like descriptions
      const freightMem = vendorMemories.find(
        (m) => m.key === 'sku_mapping:freight',
      );

      const items = invoice.fields.lineItems;
      const updated = [...items];
      let changed = false;

      items.forEach((item, idx) => {
        const descLower = item.description.toLowerCase();
        const looksFreight =
          descLower.includes('seefracht') ||
          descLower.includes('shipping') ||
          descLower.includes('transport');

        if (looksFreight && freightMem) {
          updated[idx] = { ...item, sku: 'FREIGHT' };
          changed = true;
          proposedCorrections.push(
            `Mapped line ${idx + 1} "${item.description}" to SKU FREIGHT.`,
          );
          confidenceScore = Math.min(1, confidenceScore + 0.1);
          reasoningParts.push(
            'Applied learned freight SKU mapping for Freight & Co.',
          );
        } else if (looksFreight && !freightMem) {
          reasoningParts.push(
            'Detected freight-like description but no SKU mapping yet; kept for human review.',
          );
        }
      });

      if (changed) {
        normalizedInvoice['lineItems'] = updated;
      }
    }

    auditTrail.push({
      step: 'apply',
      timestamp: new Date().toISOString(),
      details: `Applied vendor memories for ${invoice.vendor}; proposed ${proposedCorrections.length} corrections.`,
    });

    // 2d) duplicate detection (all vendors)
    this.store.saveInvoiceMeta(
      invoice.invoiceId,
      invoice.vendor,
      invoice.fields.invoiceNumber,
      invoice.fields.invoiceDate,
    );

    const dup = this.store.findDuplicate(
      invoice.vendor,
      invoice.fields.invoiceNumber,
      invoice.fields.invoiceDate,
    );

    if (dup && dup.id !== invoice.invoiceId) {
      proposedCorrections.push(`Flagged as possible duplicate of ${dup.id}`);
      confidenceScore = Math.max(confidenceScore - 0.2, 0);
      requiresHumanReview = true;
      reasoningParts.push(
        `Detected potential duplicate (same vendor + invoiceNumber + close dates) with ${dup.id}.`,
      );

      auditTrail.push({
        step: 'apply',
        timestamp: new Date().toISOString(),
        details: `Duplicate check: found possible duplicate ${dup.id}.`,
      });
    }

    // 3) decide
    if (confidenceScore >= CONF_AUTO_ACCEPT && proposedCorrections.length === 0) {
      requiresHumanReview = false;
      reasoningParts.push(
        'High confidence and no unresolved issues → auto-accept.',
      );
    } else {
      requiresHumanReview = true;
      reasoningParts.push(
        'Invoice requires human review due to missing or low-confidence rules or corrections.',
      );
    }

    auditTrail.push({
      step: 'decide',
      timestamp: new Date().toISOString(),
      details: `requiresHumanReview=${requiresHumanReview}, confidenceScore=${confidenceScore.toFixed(
        2,
      )}`,
    });

    const reasoning = reasoningParts.join(' ');

    return {
      normalizedInvoice,
      proposedCorrections,
      requiresHumanReview,
      reasoning,
      confidenceScore,
      memoryUpdates,
      auditTrail,
    };
  }

  // Parts AG learning
  learnFromPartsAG(correction: {
  invoiceId: string;
  vendor: string;
  corrections: { field: string; from: unknown; to: unknown; reason: string }[];
  finalDecision: string;
}): string[] {
  const updates: string[] = [];
  const now = new Date().toISOString();

  if (correction.vendor !== 'Parts AG') return updates;

  // VAT inclusive strategy (any correction that indicates VAT-inclusive behavior)
  const vatCorrection = correction.corrections.find(
    (c) => c.field === 'vatBehavior' || c.field === 'grossTotal' || c.field === 'taxTotal',
  );
  if (vatCorrection) {
    const existing = this.store
      .getVendorMemories('Parts AG', 0)
      .find((m) => m.key === 'tax_behavior:VAT_INCLUSIVE');

    if (existing) {
      const reinforced: MemoryEntry = {
        ...existing,
        confidence: existing.confidence + 0.1,
        positiveReinforcements: existing.positiveReinforcements + 1,
      };
      const saved = this.store.updateMemory(reinforced);
      updates.push(
        `Reinforced vendor memory #${saved.id} for Parts AG: VAT inclusive behavior.`,
      );
    } else if (vatCorrection.to === 'VAT_INCLUSIVE') {
      const mem: Omit<MemoryEntry, 'id'> = {
        vendorName: 'Parts AG',
        type: 'VENDOR',
        key: 'tax_behavior:VAT_INCLUSIVE',
        value: { strategy: 'RECOMPUTE_FROM_GROSS' },
        confidence: 0.7,
        positiveReinforcements: 1,
        negativeReinforcements: 0,
        createdAt: now,
        updatedAt: now,
      };
      const saved = this.store.saveMemory(mem);
      updates.push(
        `Created vendor memory #${saved.id} for Parts AG: VAT inclusive behavior.`,
      );
    }

    this.store.recordAudit(correction.invoiceId, {
      step: 'learn',
      timestamp: now,
      details:
        'Learned/reinforced VAT inclusive tax behavior for Parts AG from human correction.',
    });
  }

  // Default currency strategy
  const currencyCorr = correction.corrections.find(
    (c) => c.field === 'currency',
  );
  if (currencyCorr && typeof currencyCorr.to === 'string') {
    const existing = this.store
      .getVendorMemories('Parts AG', 0)
      .find((m) => m.key === 'currency_default');

    if (existing) {
      const reinforced: MemoryEntry = {
        ...existing,
        confidence: existing.confidence + 0.1,
        positiveReinforcements: existing.positiveReinforcements + 1,
      };
      const saved = this.store.updateMemory(reinforced);
      updates.push(
        `Reinforced vendor memory #${saved.id} for Parts AG: default currency ${currencyCorr.to}.`,
      );
    } else {
      const mem: Omit<MemoryEntry, 'id'> = {
        vendorName: 'Parts AG',
        type: 'VENDOR',
        key: 'currency_default',
        value: { currency: currencyCorr.to },
        confidence: 0.7,
        positiveReinforcements: 1,
        negativeReinforcements: 0,
        createdAt: now,
        updatedAt: now,
      };
      const saved = this.store.saveMemory(mem);
      updates.push(
        `Created vendor memory #${saved.id} for Parts AG: default currency ${currencyCorr.to}.`,
      );
    }

    this.store.recordAudit(correction.invoiceId, {
      step: 'learn',
      timestamp: now,
      details:
        'Learned/reinforced default currency for Parts AG from human correction.',
    });
  }

  return updates;
}

  // Freight & Co learning
 learnFromFreightCo(correction: {
  invoiceId: string;
  vendor: string;
  corrections: { field: string; from: unknown; to: unknown; reason: string }[];
  finalDecision: string;
}): string[] {
  const updates: string[] = [];
  const now = new Date().toISOString();

  if (correction.vendor !== 'Freight & Co') return updates;

  // Skonto memory
  const skontoCorr = correction.corrections.find(
    (c) => c.field === 'discountTerms' || c.field === 'paymentTerms.skonto',
  );
  if (skontoCorr) {
    const existing = this.store
      .getVendorMemories('Freight & Co', 0)
      .find((m) => m.key === 'payment_terms:skonto');

    if (existing) {
      const reinforced: MemoryEntry = {
        ...existing,
        confidence: existing.confidence + 0.1,
        positiveReinforcements: existing.positiveReinforcements + 1,
      };
      const saved = this.store.updateMemory(reinforced);
      updates.push(
        `Reinforced vendor memory #${saved.id} for Freight & Co: Skonto terms.`,
      );
    } else {
      const mem: Omit<MemoryEntry, 'id'> = {
        vendorName: 'Freight & Co',
        type: 'VENDOR',
        key: 'payment_terms:skonto',
        value: skontoCorr.to,
        confidence: 0.7,
        positiveReinforcements: 1,
        negativeReinforcements: 0,
        createdAt: now,
        updatedAt: now,
      };
      const saved = this.store.saveMemory(mem);
      updates.push(
        `Created vendor memory #${saved.id} for Freight & Co: Skonto terms.`,
      );
    }

    this.store.recordAudit(correction.invoiceId, {
      step: 'learn',
      timestamp: now,
      details:
        'Learned/reinforced Skonto payment terms for Freight & Co from human correction.',
    });
  }

  // FREIGHT SKU mapping
  const skuCorr = correction.corrections.find(
    (c) => c.field === 'lineItems0.sku' || c.field === 'freightSku',
  );
  if (skuCorr && skuCorr.to === 'FREIGHT') {
    const existing = this.store
      .getVendorMemories('Freight & Co', 0)
      .find((m) => m.key === 'sku_mapping:freight');

    if (existing) {
      const reinforced: MemoryEntry = {
        ...existing,
        confidence: existing.confidence + 0.1,
        positiveReinforcements: existing.positiveReinforcements + 1,
      };
      const saved = this.store.updateMemory(reinforced);
      updates.push(
        `Reinforced vendor memory #${saved.id} for Freight & Co: FREIGHT SKU mapping.`,
      );
    } else {
      const mem: Omit<MemoryEntry, 'id'> = {
        vendorName: 'Freight & Co',
        type: 'VENDOR',
        key: 'sku_mapping:freight',
        value: { sku: 'FREIGHT' },
        confidence: 0.6,
        positiveReinforcements: 1,
        negativeReinforcements: 0,
        createdAt: now,
        updatedAt: now,
      };
      const saved = this.store.saveMemory(mem);
      updates.push(
        `Created vendor memory #${saved.id} for Freight & Co: FREIGHT SKU mapping.`,
      );
    }

    this.store.recordAudit(correction.invoiceId, {
      step: 'learn',
      timestamp: now,
      details:
        'Learned/reinforced freight SKU mapping for Freight & Co from human correction.',
    });
  }

  return updates;
}


  /**
   * Learn from human_corrections.json entry for Supplier GmbH INV-A-001:
   * - Create vendor memory mapping "Leistungsdatum" -> serviceDate
   */
 learnFromHumanCorrection(correction: { 
  invoiceId: string;
  vendor: string;
  corrections: { field: string; from: unknown; to: unknown; reason: string }[];
  finalDecision: string;
}): string[] {
  const updates: string[] = [];
  const now = new Date().toISOString();

  if (
    correction.vendor === 'Supplier GmbH' &&
    correction.corrections.some((c) => c.field === 'serviceDate')
  ) {
    // Check for existing memory first (REINFORCEMENT)
    const existing = this.store
      .getVendorMemories('Supplier GmbH', 0)
      .find((m) => m.key === 'label_mapping:Leistungsdatum');

    if (existing) {
      const reinforced: MemoryEntry = {
        ...existing,
        confidence: Math.min(1, existing.confidence + 0.1),
        positiveReinforcements: existing.positiveReinforcements + 1,
      };
      const saved = this.store.updateMemory(reinforced);
      updates.push(
        `Reinforced vendor memory #${saved.id} for Supplier GmbH: Leistungsdatum -> serviceDate`,
      );
    } else {
      const mem: Omit<MemoryEntry, 'id'> = {
        vendorName: 'Supplier GmbH',
        type: 'VENDOR',
        key: 'label_mapping:Leistungsdatum',
        value: { targetField: 'serviceDate' },
        confidence: 0.6,
        positiveReinforcements: 1,
        negativeReinforcements: 0,
        createdAt: now,
        updatedAt: now,
      };
      const saved = this.store.saveMemory(mem);
      updates.push(
        `Created vendor memory #${saved.id} for Supplier GmbH: Leistungsdatum -> serviceDate`,
      );
    }

    this.store.recordAudit(correction.invoiceId, {
      step: 'learn',
      timestamp: now,
      details:
        'Learned/reinforced vendor-specific label mapping from human correction: "Leistungsdatum" → serviceDate.',
    });
  }

  return updates;
}

//Dispatcher method (separate, at class level)
learnFromCorrection(correction: {
  invoiceId: string;
  vendor: string;
  corrections: { field: string; from: unknown; to: unknown; reason: string }[];
  finalDecision: string;
}): string[] {
  switch (correction.vendor) {
    case 'Supplier GmbH':
      return this.learnFromHumanCorrection(correction);
    case 'Parts AG':
      return this.learnFromPartsAG(correction);
    case 'Freight & Co':
      return this.learnFromFreightCo(correction);
    default:
      console.log(`No learning handler for vendor: ${correction.vendor}`);
      return [];
  }
}
}
