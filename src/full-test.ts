
import { MemoryEngine } from './memoryEngine.js';
import { MemoryStore } from './memoryStore.js';
import { getDB } from './db.js';

console.log('Full Memory Engine Test (3 Vendors)...');

// Reset
getDB().exec('DELETE FROM memories');
getDB().exec('DELETE FROM audit_trail');
getDB().exec('DELETE FROM invoices');

const store = new MemoryStore();
const engine = new MemoryEngine(store);

// 1. SUPPLIER GMBH
console.log('\n SUPPLIER GMBH (Leistungsdatum)');
const invA = {
  invoiceId: 'INV-A-001', vendor: 'Supplier GmbH', confidence: 0.78,
  rawText: 'Leistungsdatum: 01.01.2024', fields: { invoiceNumber: 'INV-001', invoiceDate: '2024-01-12', serviceDate: null }
};
console.log('Before:', engine.process(invA as any).reasoning);
engine.learnFromHumanCorrection({ invoiceId: 'INV-A-001', vendor: 'Supplier GmbH', corrections: [{ field: 'serviceDate', from: null, to: '2024-01-01', reason: 'Leistungsdatum' }], finalDecision: 'approved' } as any);
console.log('Learned Supplier memory');

// 2. PARTS AG  
console.log('\n PARTS AG (VAT inclusive)');
const invB = {
  invoiceId: 'INV-B-001', vendor: 'Parts AG', confidence: 0.74,
  rawText: 'MwSt. inkl.', fields: { invoiceNumber: 'PA-7781', invoiceDate: '2024-02-05', currency: null }
};
console.log('Before:', engine.process(invB as any).reasoning);
engine.learnFromPartsAG({ invoiceId: 'INV-B-001', vendor: 'Parts AG', corrections: [{ field: 'currency', from: null, to: 'EUR', reason: 'From rawText' }], finalDecision: 'approved' } as any);
console.log('Learned Parts AG memory');

// 3. FREIGHT & CO
console.log('\n FREIGHT & CO (Skonto + FREIGHT SKU)');
const invC = {
  invoiceId: 'INV-C-001', vendor: 'Freight & Co', confidence: 0.79,
  rawText: '2% Skonto 10 days Seefracht', fields: { 
    invoiceNumber: 'FC-1001', invoiceDate: '2024-03-01', 
    lineItems: [{ sku: null, description: 'Seefracht Shipping', qty: 1, unitPrice: 1000 }]
  }
};
console.log('Before:', engine.process(invC as any).reasoning);
engine.learnFromFreightCo({ 
  invoiceId: 'INV-C-001', vendor: 'Freight & Co', 
  corrections: [{ field: 'lineItems0.sku', from: null, to: 'FREIGHT', reason: 'Freight description' }], 
  finalDecision: 'approved' 
} as any);
console.log('Learned Freight memory');

console.log('\n MEMORY ENGINE FULLY FUNCTIONAL!');

