import { getDB } from './db.js';
import type { MemoryEntry, MemoryType, AuditEntry } from './models.js';

export class MemoryStore {
  private db = getDB();

  saveMemory(entry: Omit<MemoryEntry, 'id'>): MemoryEntry {
    const now = new Date().toISOString();

    const toInsert = {
      vendorName: entry.vendorName ?? null,
      type: entry.type,
      key: entry.key,
      value: JSON.stringify(entry.value),
      confidence: entry.confidence,
      positiveReinforcements: entry.positiveReinforcements,
      negativeReinforcements: entry.negativeReinforcements,
      lastUsedAt: entry.lastUsedAt ?? null,
      createdAt: entry.createdAt ?? now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO memories (
        vendorName, type, key, value, confidence,
        positiveReinforcements, negativeReinforcements,
        lastUsedAt, createdAt, updatedAt
      )
      VALUES (@vendorName, @type, @key, @value, @confidence,
              @positiveReinforcements, @negativeReinforcements,
              @lastUsedAt, @createdAt, @updatedAt)
    `);

    const info = stmt.run(toInsert);

    return {
      ...entry,
      id: Number(info.lastInsertRowid),
      createdAt: toInsert.createdAt,
      updatedAt: toInsert.updatedAt,
    };
  }

  updateMemory(mem: MemoryEntry): MemoryEntry {
    const nextConfidence = Math.max(0, Math.min(1, mem.confidence));
    const stmt = this.db.prepare(`
      UPDATE memories
      SET
        confidence = ?,
        positiveReinforcements = ?,
        negativeReinforcements = ?,
        updatedAt = ?
      WHERE id = ?
    `);

    stmt.run(
      nextConfidence,
      mem.positiveReinforcements,
      mem.negativeReinforcements,
      new Date().toISOString(),
      mem.id,
    );

    return { ...mem, confidence: nextConfidence };
  }

  getVendorMemories(vendorName: string, minConfidence = 0): MemoryEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM memories
      WHERE (vendorName = ? OR vendorName IS NULL)
        AND confidence >= ?
    `);

    const rows = stmt.all(vendorName, minConfidence) as any[];

    return rows.map((row) => ({
      id: row.id,
      vendorName: row.vendorName ?? undefined,
      type: row.type as MemoryType,
      key: row.key,
      value: JSON.parse(row.value),
      confidence: row.confidence,
      positiveReinforcements: row.positiveReinforcements,
      negativeReinforcements: row.negativeReinforcements,
      lastUsedAt: row.lastUsedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  recordAudit(invoiceId: string, entry: AuditEntry): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_trail (invoiceId, step, timestamp, details)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(invoiceId, entry.step, entry.timestamp, entry.details);
  }

  saveInvoiceMeta(
    invoiceId: string,
    vendor: string,
    invoiceNumber: string,
    invoiceDate: string,
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO invoices (id, vendorName, invoiceNumber, invoiceDate)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(invoiceId, vendor, invoiceNumber, invoiceDate);
  }

  findDuplicate(
    vendor: string,
    invoiceNumber: string,
    invoiceDate: string,
  ): { id: string; invoiceDate: string } | null {
    const stmt = this.db.prepare(`
      SELECT id, invoiceDate
      FROM invoices
      WHERE vendorName = ?
        AND invoiceNumber = ?
        AND ABS(julianday(invoiceDate) - julianday(?)) <= 2
      LIMIT 1
    `);
    const row = stmt.get(vendor, invoiceNumber, invoiceDate) as any;
    return row ? { id: row.id, invoiceDate: row.invoiceDate } : null;
  }
}
