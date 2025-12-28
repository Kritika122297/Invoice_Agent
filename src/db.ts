import Database from 'better-sqlite3';

// Internal singleton DB instance (not exported)
const DB = new Database('memory.db');
DB.pragma('journal_mode = WAL');

export function initSchema(): void {
  DB.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      vendorName TEXT NOT NULL,
      invoiceNumber TEXT NOT NULL,
      invoiceDate TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendorName TEXT,
      type TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence REAL NOT NULL,
      positiveReinforcements INTEGER NOT NULL DEFAULT 0,
      negativeReinforcements INTEGER NOT NULL DEFAULT 0,
      lastUsedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_trail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId TEXT NOT NULL,
      step TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      details TEXT NOT NULL
    );
  `);
}

export function getDB() {
  return DB; // type inferred, not exported as a named type
}
