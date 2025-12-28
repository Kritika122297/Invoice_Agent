
import { MemoryEngine } from './memoryEngine.js';
import { MemoryStore } from './memoryStore.js';
import { getDB } from './db.js';

console.log('Testing Memory Engine...');

// Reset DB
getDB().exec('DELETE FROM memories');
getDB().exec('DELETE FROM audit_trail');
getDB().exec('DELETE FROM invoices');

const store = new MemoryStore();
const engine = new MemoryEngine(store);

const invoice = {
  invoiceId: 'TEST-001',
  vendor: 'Supplier GmbH',
  confidence: 0.7,
  rawText: 'Rechnungsnr INV-001 Leistungsdatum: 01.01.2024',
  fields: { 
    invoiceNumber: 'INV-001', 
    invoiceDate: '2024-01-12', 
    serviceDate: null,
    currency: 'EUR',
    lineItems: [{ sku: 'WIDGET-001', description: 'Widget', qty: 100, unitPrice: 25.0 }]
  }
};

// Test 1: BEFORE learning
console.log('\n BEFORE learning:');
const result1 = engine.process(invoice as any);
console.log('Reasoning:', result1.reasoning);
console.log('Review?', result1.requiresHumanReview);

// Test 2: Learn from human correction
console.log('\n LEARNING...');
const correction = {
  invoiceId: 'TEST-001',
  vendor: 'Supplier GmbH',
  corrections: [{ field: 'serviceDate', from: null, to: '2024-01-01', reason: 'Leistungsdatum found' }],
  finalDecision: 'approved'
};
const learned = engine.learnFromHumanCorrection(correction as any);
console.log('Learned:', learned);

// Test 3: AFTER learning - should auto-correct!
console.log('\n AFTER learning:');
const result2 = engine.process(invoice as any);
console.log('Reasoning:', result2.reasoning);
console.log('Review?', result2.requiresHumanReview);
console.log('Corrections:', result2.proposedCorrections);
