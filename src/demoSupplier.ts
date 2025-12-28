
import { initSchema } from './db.js';
import { MemoryStore } from './memoryStore.js';
import { MemoryEngine } from './memoryEngine.js';
import type { ExtractedInvoice } from './models.js';

const invA1: ExtractedInvoice = {
  invoiceId: 'INV-A-001',
  vendor: 'Supplier GmbH',
  fields: {
    invoiceNumber: 'INV-2024-001',
    invoiceDate: '12.01.2024',
    serviceDate: null,
    currency: 'EUR',
    poNumber: 'PO-A-050',
    netTotal: 2500.0,
    taxRate: 0.19,
    taxTotal: 475.0,
    grossTotal: 2975.0,
    lineItems: [
      {
        sku: 'WIDGET-001',
        description: 'Widget',
        qty: 100,
        unitPrice: 25.0,
      },
    ],
  },
  confidence: 0.78,
  rawText:
    'Rechnungsnr: INV-2024-001\nLeistungsdatum: 01.01.2024\nBestellnr: PO-A-050\n...',
};

const invA2: ExtractedInvoice = {
  invoiceId: 'INV-A-002',
  vendor: 'Supplier GmbH',
  fields: {
    invoiceNumber: 'INV-2024-002',
    invoiceDate: '18.01.2024',
    serviceDate: null,
    currency: 'EUR',
    poNumber: 'PO-A-050',
    netTotal: 2375.0,
    taxRate: 0.19,
    taxTotal: 451.25,
    grossTotal: 2826.25,
    lineItems: [
      {
        sku: 'WIDGET-001',
        description: 'Widget',
        qty: 95,
        unitPrice: 25.0,
      },
    ],
  },
  confidence: 0.72,
  rawText:
    'Rechnungsnr: INV-2024-002\nLeistungsdatum: 15.01.2024\nBestellnr: PO-A-050\nHinweis: Teillieferung\n...',
};

async function runDemo() {
  initSchema();
  const store = new MemoryStore();
  const engine = new MemoryEngine(store);

  console.log('--- Step 1: Process INV-A-001 BEFORE learning ---');
  const resultBefore = engine.process(invA1);
  console.dir(resultBefore, { depth: null });

  console.log('\n--- Step 2: Simulate human correction for INV-A-001 ---');
  const humanCorrection = {
    invoiceId: 'INV-A-001',
    vendor: 'Supplier GmbH',
    corrections: [
      {
        field: 'serviceDate',
        from: null,
        to: '2024-01-01',
        reason: 'Leistungsdatum found in raw text',
      },
    ],
    finalDecision: 'approved',
  };
  const updates = engine.learnFromHumanCorrection(humanCorrection);
  console.log('Memory updates:', updates);

  console.log('\n--- Step 3: Process INV-A-002 AFTER learning ---');
  const resultAfter = engine.process(invA2);
  console.dir(resultAfter, { depth: null });
}

runDemo().catch((err) => {
  console.error(err);
});
