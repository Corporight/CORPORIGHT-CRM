# CC Session 7.0 — Repository Integration Wave

Canonical base: feat/relations-phase-1a  
Donor branch: feature/finance-module

Mission type: controlled manual selective port (NOT git merge / NOT rebase)

---

## SUBWAVE A — Backend / Infrastructure Integration ✓ COMPLETE

### Package + Style Layer
- [x] add shadcn/radix dependencies into package.json
- [x] add components.json
- [x] run npm install / regenerate lock file
- [x] replace globals.css with shadcn-compatible version
- [x] add src/lib/utils.ts
- [x] add src/lib/format.ts

### Finance Schema Layer
- [x] add src/db/schema/finance.ts
- [x] update src/db/schema/index.ts finance export
- [x] append finance migration as 0012
- [x] update drizzle meta journal safely
- [x] regenerate or safely align drizzle snapshot metadata

### Finance Backend Layer
- [x] add src/lib/finance/validators.ts
- [x] add src/lib/finance/helpers.ts
- [x] add src/lib/finance/actions.ts
- [x] add src/lib/orders/reads.ts

### Mandatory Verification Gate A ✓ PASSED
- [x] TypeScript compile passes
- [x] drizzle migration integrity verified
- [x] imports resolved
- [x] no regression in existing relations/subjects backend

---

## SUBWAVE B — UI Consolidation ✓ COMPLETE

### shadcn UI primitives
- [x] add badge/button/card/dialog/input/label/select/table

### Orders UI shell
- [x] add order detail header
- [x] add order detail tabs
- [x] add finance order widgets (summary-card, income-tab, expenses-tab, allocations-table, add-allocation-dialog, cancel-allocation-dialog)
- [x] add /orders page
- [x] add /orders/[id] page

### Mandatory Verification Gate B ✓ PASSED
- [x] TypeScript compile passes
- [x] app builds (Next.js 16.2.3 Turbopack, 9 routes)
- [x] /orders route renders (static)
- [x] /orders/[id] route renders (dynamic)

---

## NON-NEGOTIABLE PRESERVATION RULES

Do NOT overwrite:

- current relations schema evolution
- current subjects CRUD files
- current AML enforcement
- current order completion hooks
- current future subject workflows
- current relation lifecycle logic

Finance branch is donor only.
Current branch remains source of truth.
