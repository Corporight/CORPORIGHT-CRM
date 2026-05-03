# CC Session 12.4 — Implementation Report

## Mission

Replace the single-row FinancialMovement creation form with an invoice-style multi-line movement builder. Completes the spec reconciliation identified after live UI review of Waves 12.1–12.3.

## Base commit

`764a78c` — CC Session 12.2 (plus uncommitted 12.3 changes)

---

## Changed Files

### Modified
- `src/lib/finance/validators.ts` — added `movementRowSchema` + `createFinancialMovementsSchema` (lines 157–182)
- `src/lib/finance/actions.ts` — added `createFinancialMovements()` bulk server action + import additions (~193 new lines)
- `src/app/finance/payment-groups/[id]/movements/new/page.tsx` — added orders loading + truncation flag prop
- `src/app/finance/payment-groups/[id]/movements/new/_components/create-movement-form.tsx` — FULL REPLACEMENT: multi-row invoice-style builder

---

## What Was Built

### 1. `movementRowSchema` + `createFinancialMovementsSchema` (`validators.ts`)

Two new schemas appended. Existing schemas are unchanged.

**`movementRowSchema`** — per-row shape:
- Required: `categoryId`, `typeId`, `detailId` (all UUID), `amountNet` (decimalString), `description` (min 1)
- Defaulted: `vatMode` (default `NO_VAT`), `vatRate` (optional, default `'0'`)
- Optional: `orderId` (UUID), `note`

**`createFinancialMovementsSchema`** — outer bulk payload:
- Required: `paymentGroupId`, `centerId`, `direction`, `movementDate`
- Optional: `createdBy`
- `rows`: array of `movementRowSchema`, min 1

---

### 2. `createFinancialMovements()` (`actions.ts`)

New bulk server action. Does NOT alter `createFinancialMovement` (singular).

**Three-phase execution:**

**Phase 1 — PG verification (3 checks):**
- PG exists
- PG direction matches input direction
- PG centerId matches input centerId ← new check not present in singular action

**Phase 2 — Pre-validate ALL rows before inserting any:**
Per row (with row label in error messages):
- `detail.typeId` matches input `typeId`
- `type.categoryId` matches input `categoryId`
- `category.direction === direction OR category.direction === 'BOTH'`
- `vatMode === NO_VAT` → `vatRate` must be 0
- Integer-scaled amountGross = amountNet + vatAmount
- If `orderId` present: order existence check

**Phase 3 — Single `db.transaction()` for all N inserts:**
- N `financial_movements` inserts
- N `audit_log` inserts (one per movement, same transaction)
- Returns `ActionResult<{ ids: string[] }>`

---

### 3. Page update (`movements/new/page.tsx`)

- Added `listOrders({ limit: 50 })` to `Promise.all`
- CANCELLED orders excluded client-side
- `ordersTruncated = ordersTotal > ordersRaw.length` computed and passed as prop
- `orders` and `ordersTruncated` passed to `<CreateMovementForm>`

---

### 4. `CreateMovementForm` replacement (`create-movement-form.tsx`)

Full replacement. The new component is a multi-row invoice-style builder.

**Architecture:**
- `RowState` type + `newEmptyRow()` helper
- `computeRowAmounts(row)` helper at module scope — single source of VAT arithmetic used for both preview display and submit mapper (no duplication)
- State: `rows: RowState[]` (starts with one), controlled `movementDate`, `globalError`
- `updateRow`, `addRow`, `removeRow` helpers; remove disabled when only 1 row

**Per-row UI (each row in a bordered card):**
- Cascading selects: Kategorie → Typ (filtered) → Detail (filtered), with downstream reset on change
- Popis text input
- Způsob DPH select
- Základ daně number input
- Sazba DPH % (shown only when vatMode ≠ NO_VAT)
- Inline computed preview: DPH and Hrubá per row
- Zakázka optional select from orders prop; amber warning shown when `ordersTruncated` is true
- Poznámka textarea

**Footer:** Total gross sum across all rows

**Submit:** Validates all rows client-side first → calls `createFinancialMovements()` → `router.push` to PG detail on success

**Type safety:** `direction` prop typed as `'INCOME' | 'EXPENSE' | 'INTERNAL'` (not `string`); no unsafe casts in component.

**Navigation:** Cancel uses `<Link>` (not `<a>`), consistent with codebase pattern.

---

## Verification

- `npx tsc --noEmit` — zero errors (confirmed after all fixes applied)
- Spec compliance reviewed by dedicated subagent — all requirements verified (SPEC_COMPLIANT)
- Code quality reviewed — 4 issues found and fixed:
  1. Duplicate VAT arithmetic → extracted into `computeRowAmounts()` helper
  2. `direction: string` prop → narrowed to literal union, cast removed
  3. Cancel `<a>` → replaced with `<Link>`
  4. Truncation warning missing → `ordersTruncated` flag computed in page, amber warning in form
- Final quality re-review: APPROVED

---

## Unresolved Risks / Deferred Items

- **50-order limit with no server-side search** — same deferred item as 12.3; the `ordersTruncated` warning now at least informs operators when they may be missing entries.
- **N+1 pre-validation queries outside transaction** — Phase 1 acceptable (2–5 rows typical, small team). TOCTOU window between validation and insert exists but is not a practical risk at current data volumes.
- **UTC-vs-local default date** — `new Date().toISOString()` gives UTC date; pre-existing pattern across all forms in the codebase.
- **`orders` truncation logic** — `ordersTruncated` is computed against `ordersRaw.length` (before CANCELLED filter), not `orders.length` (after). If all 50 fetched records are non-CANCELLED this has no effect; edge case only when CANCELLED orders occupy a meaningful portion of the 50-item cap.

---

## Branch Continuity

Branch: `feat/relations-phase-1a`
Last clean commit: `764a78c`
Status: Wave 12.4 complete, NOT YET committed (per instruction)

The multi-row invoice-style movement builder is now in place. The Finance standalone vertical is functionally complete for Phase 1: create PaymentGroup → create FinancialMovements (multi-row) → allocate to Order.

Next logical step: commit Wave 12.3 + 12.4 together, or branch finish.
