# Invoice Memory Layer

This is a smart system that **learns from human invoice fixes** so it can **auto-fix similar invoices later**.

## Try it (30 seconds)


## What it learned

- **Supplier GmbH**: "Leistungsdatum" = service date
- **Parts AG**: "MwSt. inkl." = VAT already included  
- **Freight & Co**: "Seefracht" = FREIGHT SKU + 2% Skonto

## How it works

1. **First time**: Spots issues → "Needs human review"
2. **Human fixes it** → System remembers the fix
3. **Next time**: Auto-fixes! No human needed ✅

Also catches **duplicate invoices** (same number, close dates).

## Results


## Files

- `memoryEngine.ts` = the brain
- `index.ts` = run demo  
- `data/` = test invoices

**Simple idea: Humans teach once, AI remembers forever.**
 

