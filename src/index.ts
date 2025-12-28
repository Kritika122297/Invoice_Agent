
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { initSchema, getDB } from './db.js';
import { MemoryEngine } from './memoryEngine.js';
import { MemoryStore } from './memoryStore.js';
import type { ExtractedInvoice } from './models.js';

function main() {
  initSchema();
  const db = getDB();
  console.log('Invoice Memory Layer - Full Demo');

  // Reset DB for clean demo
  db.exec('DELETE FROM memories');
  db.exec('DELETE FROM audit_trail');
  db.exec('DELETE FROM invoices');
  console.log('Database reset');

  const store = new MemoryStore();
  const engine = new MemoryEngine(store);

  // Try to load real data
  const dataDir = './data';
  try {
    const invoicesRaw = readFileSync(join(dataDir, 'invoicesextracted.json'), 'utf8');
    const invoices: ExtractedInvoice[] = JSON.parse(invoicesRaw);
    
    console.log(`\n PROCESSING ${invoices.length} REAL INVOICES...\n`);
    
    // Process all invoices
    const results = invoices.map((invoice) => {
      const result = engine.process(invoice);
      console.log(`INV-${invoice.invoiceId.padEnd(8)} ${invoice.vendor.padEnd(12)} → Review: ${result.requiresHumanReview} | Conf: ${result.confidence.toFixed(2)} | Fixes: ${result.proposedCorrections.length}`);
      return result;
    });

    // Simulate human corrections (based on spec)
    console.log('\n SIMULATING HUMAN CORRECTIONS & LEARNING...\n');
    const humanCorrections = [
      { invoiceId: 'INV-A-001', vendor: 'Supplier GmbH', corrections: [{ field: 'serviceDate', from: null, to: '2024-01-01', reason: 'Leistungsdatum' }], finalDecision: 'approved' },
      { invoiceId: 'INV-B-001', vendor: 'Parts AG', corrections: [{ field: 'grossTotal', from: 2400, to: 2380, reason: 'VAT inclusive' }], finalDecision: 'approved' },
      { invoiceId: 'INV-B-003', vendor: 'Parts AG', corrections: [{ field: 'currency', from: null, to: 'EUR', reason: 'From rawText' }], finalDecision: 'approved' },
      { invoiceId: 'INV-C-001', vendor: 'Freight & Co', corrections: [{ field: 'discountTerms', from: null, to: '2% Skonto 10 days', reason: 'Skonto terms' }], finalDecision: 'approved' },
      { invoiceId: 'INV-C-002', vendor: 'Freight & Co', corrections: [{ field: 'lineItems0.sku', from: null, to: 'FREIGHT', reason: 'Freight description' }], finalDecision: 'approved' }
    ];

    humanCorrections.forEach(correction => {
      const updates = engine.learnFromCorrection(correction);
      if (updates.length > 0) {
        console.log(` ${correction.invoiceId}:`, updates[0]);
      }
    });

    console.log('\n RE-PROCESSING WITH LEARNED MEMORIES...\n');
    invoices.slice(0, 5).forEach(invoice => {
      const result = engine.process(invoice);
      console.log(`RE-RUN ${invoice.invoiceId.padEnd(8)} → Review: ${result.requiresHumanReview} | Fixes: ${result.proposedCorrections.join('; ') || 'None'}`);
    });

  } catch (error: any) {
    console.log(' No real data found. Running SAMPLE DEMO...\n');
    
    // Sample invoices for demo
    const sampleInvoices: ExtractedInvoice[] = [
      {
        invoiceId: 'INV-A-001',
        vendor: 'Supplier GmbH',
        confidence: 0.78,
        rawText: 'Rechnungsnr INV-2024-001 Leistungsdatum: 01.01.2024',
        fields: {
          invoiceNumber: 'INV-2024-001',
          invoiceDate: '2024-01-12',
          serviceDate: null,
          currency: 'EUR',
          lineItems: [{ sku: 'WIDGET-001', description: 'Widget', qty: 100, unitPrice: 25.0 }],
          netTotal: 0,
          taxRate: 0,
          taxTotal: 0,
          grossTotal: 0
        }
      },
      {
        invoiceId: 'INV-B-001', 
        vendor: 'Parts AG',
        confidence: 0.74,
        rawText: 'PA-7781 MwSt. inkl. EUR',
        fields: {
          invoiceNumber: 'PA-7781',
          invoiceDate: '2024-02-05',
          currency: null,
          lineItems: [{ sku: 'BOLT-99', description: 'Bolts', qty: 200, unitPrice: 10.0 }],
          serviceDate: null,
          netTotal: 0,
          taxRate: 0,
          taxTotal: 0,
          grossTotal: 0
        }
      },
      {
        invoiceId: 'INV-C-001',
        vendor: 'Freight & Co',
        confidence: 0.79,
        rawText: 'FC-1001 2% Skonto 10 days Seefracht Shipping',
        fields: {
          invoiceNumber: 'FC-1001',
          invoiceDate: '2024-03-01',
          lineItems: [{ sku: null, description: 'Seefracht Shipping', qty: 1, unitPrice: 1000 }],
          serviceDate: null,
          currency: null,
          netTotal: 0,
          taxRate: 0,
          taxTotal: 0,
          grossTotal: 0
        }
      }
    ];

    console.log(' PROCESSING SAMPLES...\n');
    sampleInvoices.forEach(inv => {
      const result = engine.process(inv);
      console.log(`${inv.invoiceId.padEnd(10)} → ${result.reasoning}`);
    });

    console.log('\n HUMAN CORRECTIONS → LEARNING...\n');
    const corrections = [
      { invoiceId: 'INV-A-001', vendor: 'Supplier GmbH', corrections: [{ field: 'serviceDate', from: null, to: '2024-01-01', reason: 'Leistungsdatum' }], finalDecision: 'approved' },
      { invoiceId: 'INV-B-001', vendor: 'Parts AG', corrections: [{ field: 'currency', from: null, to: 'EUR', reason: 'From rawText' }], finalDecision: 'approved' },
      { invoiceId: 'INV-C-001', vendor: 'Freight & Co', corrections: [{ field: 'lineItems0.sku', from: null, to: 'FREIGHT', reason: 'Freight mapping' }], finalDecision: 'approved' }
    ];

    corrections.forEach(correction => {
      const updates = engine.learnFromCorrection(correction);
      console.log(`Learned: ${updates.join(', ') || 'Nothing new'}`);
    });

    console.log('\n RE-PROCESS WITH MEMORY...\n');
    sampleInvoices.forEach(inv => {
      const result = engine.process(inv);
      console.log(`${inv.invoiceId.padEnd(10)} → Fixes: ${result.proposedCorrections.join(', ') || 'None!'} | Review: ${result.requiresHumanReview}`);
    });
  }

  console.log('\n MEMORY ENGINE COMPLETE!');
  console.log(' Full cycle: Detect → Flag → Learn → Auto-fix!');
}

main();
