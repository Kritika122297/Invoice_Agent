# Invoice Memory Layer

This is a smart system that **learns from human invoice fixes** so it can **auto-fix similar invoices later**.

This project is a small “memory layer” for an invoice processing system.

The idea is simple:

An extraction model reads invoices but sometimes misses or mislabels fields.

Humans correct those mistakes.

This memory layer learns from those human corrections and auto-fixes similar invoices in the future.

It also detects possible duplicate invoices from the same vendor.

# What this project does

The app processes invoices and:

Fixes some fields using vendor-specific rules it has learned:

For Supplier GmbH: learns that the German word “Leistungsdatum” means serviceDate.

For Parts AG: learns how to handle invoices where VAT is already included and how to recover missing currency.

For Freight & Co: learns Skonto (early payment discount) terms and maps freight-like descriptions to a FREIGHT SKU.

Detects duplicate invoices with:

Same vendor

Same invoice number

Invoice dates within 2 days

Keeps an audit trail of what it did and why.

Adjusts a confidence score and decides if the invoice still needs human review.

Over time, the system needs less human intervention because it remembers patterns.

## Project Structure 

Main files:

src/db.ts – sets up the SQLite database (tables for memories, invoices, audit trail).

src/models.ts – TypeScript types (invoice, memory entry, audit entry, etc.).

src/memoryStore.ts – helper to read/write from the database:

Save and update memories

Get vendor memories

Save invoice metadata

Find duplicates

Record audit events

src/memoryEngine.ts – the “brain”:

process(invoice):

Reads relevant memories for the vendor.

Applies vendor-specific rules.

Checks for duplicates.

Updates confidence and decides if human review is needed.

learnFromHumanCorrection, learnFromPartsAG, learnFromFreightCo:

Learn new memories from human corrections.

Reinforce or weaken existing memories.

learnFromCorrection:

Dispatches to the correct learn method based on vendor.

src/index.ts – demo entrypoint:

Initializes DB.

Loads sample invoices (or real data if present).

Runs:

First pass: detect issues.

Learning pass: apply human corrections.

Second pass: show auto-fixes using memory.


## What it learned

- **Supplier GmbH**: "Leistungsdatum" = service date
- **Parts AG**: "MwSt. inkl." = VAT already included  
- **Freight & Co**: "Seefracht" = FREIGHT SKU + 2% Skonto

## How it works

1. **First time**: Spots issues → "Needs human review"
2. **Human fixes it** → System remembers the fix
3. **Next time**: Auto-fixes! No human needed 

Also catches **duplicate invoices** (same number, close dates).

## Results

What you should see:

Database is initialized and reset.

If data/invoicesextracted.json is missing:

It runs on a few built-in sample invoices.

If data/invoicesextracted.json exists:

It processes all invoices from the sample file.

It logs for each invoice:

Vendor

Whether it needs human review

Confidence score

Any proposed corrections (like setting serviceDate, fixing currency, mapping SKU, duplicate flags)

It simulates human corrections and then re-runs processing to show that the system now auto-corrects those patterns.


## How the flow works (simple)
Input: An extracted invoice (with fields like invoiceNumber, invoiceDate, currency, totals, line items, rawText).

Recall: Fetch memories for that vendor from the DB.

Apply:

Try to fill missing or wrong fields using memories and patterns in rawText.

Example: Parse “Leistungsdatum: 01.01.2024” and set serviceDate.

Example: If “MwSt. inkl.” is present, treat totals as VAT-inclusive.

Example: Map freight descriptions to SKU FREIGHT.

Duplicate check:
Store invoice meta and see if a close match already exists.

Decide:
Based on confidence and unresolved issues, decide if it still needs human review.

Learn:
After human corrections are available, call learnFromCorrection() so the system can update or create memories.

Run again:
When a similar invoice arrives later, it will be fixed automatically.




## Files

- `memoryEngine.ts` = the brain
- `index.ts` = run demo  
- `data/` = test invoices

## Why this is useful
In real life, teams get many similar invoices from the same vendors.
They fix the same kind of errors again and again.

This project shows how to:

Capture those corrections as “memories”.

Reuse them on future invoices.

Reduce manual work while keeping humans in control.

It is a small but realistic example of a learning layer on top of a traditional extraction pipeline.

**Simple idea: Humans teach once, AI remembers forever.**


