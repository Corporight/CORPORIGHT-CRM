# CC Session 12.1 — Finance Standalone UI Foundation: PaymentGroups
## Intended for immediate pasteback to ChatGPT

---

## Session Summary

Implemented the first complete standalone Finance operator vertical: PaymentGroups
create / list / detail. All tasks passed spec compliance review and code quality
review (with fixes applied). TypeScript typecheck: zero errors.

---

## Changed Files

| File | Change |
|---|---|
| `src/lib/finance/actions.ts` | Added `listCenters()` + `CenterListItem` type; added `getPaymentGroupDetail()` + `PaymentGroupDetail`, `PaymentGroupMovementItem`, `PaymentGroupAllocationItem` types; updated header comment |
| `src/lib/finance/labels.ts` | Added `DIRECTION_LABELS`, `PROCESSING_STATUS_LABELS`, `SOURCE_LABELS` |
| `src/app/finance/payment-groups/page.tsx` | NEW — list page with filters, table, total count |
| `src/app/finance/payment-groups/new/page.tsx` | NEW — create page wrapper (async server component, loads centers) |
| `src/app/finance/payment-groups/new/_components/create-payment-group-form.tsx` | NEW — client form: all required + optional fields, NaN guard, redirect on success |
| `src/app/finance/payment-groups/[id]/page.tsx` | NEW — detail page: header card, movements table, allocations table |
| `src/components/layout/crm-sidebar.tsx` | Finance sidebar: 'Platební skupiny' → /finance/payment-groups (wired); 'Přehled pohybů' disabled (no route yet) |

---

## New Routes

| Route | Status | Notes |
|---|---|---|
| `/finance/payment-groups` | ✅ Operational | List with direction + status filters via searchParams |
| `/finance/payment-groups/new` | ✅ Operational | Full create form, redirect to detail on success |
| `/finance/payment-groups/[id]` | ✅ Operational | Detail: info card + movements table + allocations table |

---

## Verification

```
npx tsc --noEmit
```
Result: **0 errors, 0 warnings**

---

## What Operators Can Do Now

1. Navigate to **Platební skupiny** from the sidebar
2. View all payment groups in a table (date, direction, source, amounts, status)
3. Create a new PaymentGroup (center, direction, source, amount, date, counterparty, symbols, note)
4. View PaymentGroup detail with:
   - Full info card (all fields, computed remaining amount)
   - Movements table (empty placeholder for now)
   - Allocations table (empty placeholder for now)

---

## What Is NOT Yet Implemented (Wave 12.2 scope)

| Feature | Notes |
|---|---|
| Create FinancialMovement form | No create form on PaymentGroup detail yet |
| Allocate PaymentGroup to Order | No allocation dialog from PaymentGroup side |
| /finance/movements list | No standalone movements route |
| Order-side allocation refresh | add-allocation-dialog exists in orders module and remains working |

---

## Architectural Notes

- `getPaymentGroupDetail` uses `innerJoin(centers)` — safe because `centerId` is NOT NULL
- `listCenters` defaults `activeOnly=true` — form only shows active centers
- `DIRECTION_LABELS` / `PROCESSING_STATUS_LABELS` / `SOURCE_LABELS` now exist in labels.ts for all UI use
- `createPaymentGroupForm` passes `totalAmount` as `parseFloat(raw).toFixed(2)` string — matches `decimalString()` regex in validator
- NaN guard on amount input prevents confusing validator error on empty field
- Tree category/type/detail cascade selects deferred to Wave 12.2 (FinancialMovement form)

---

## Unresolved Issues / Risks

1. **Movement creation from PaymentGroup detail** — the PaymentGroup detail page shows a movements section but has no "add movement" button. This is intentional (Wave 12.2 scope). The section shows empty state cleanly.
2. **Allocation from PaymentGroup side** — similarly deferred. The existing `add-allocation-dialog` on order detail side continues to work. The reverse flow (PaymentGroup → pick order) is Wave 12.2.
3. **processingStatus filter on list page** — list page reads from searchParams but no filter UI exists yet. Filters can be added as a client component in a future sub-wave.

---

## Branch and Repository Continuity

- Branch: `feat/relations-phase-1a`
- Worktree: `C:\Corporight\Claude\Corporight CRM 1.0\.worktrees\feat-relations-phase-1a\my-app`
- All changes in this session are uncommitted — git commit when ready
- No migrations required — no schema changes in this session

---

## Recommended Next Implementation Step (Wave 12.2)

**Option A (minimal):** Add "create movement" form on PaymentGroup detail page.
Requires: cascaded category→type→detail dropdowns (filter client-side), VAT amount
calculation UI, direction pre-filled from parent PaymentGroup.

**Option B (standalone):** Build /finance/movements list page + CreateFinancialMovement
form as a standalone route accessible from the Pohyby sidebar item.

**Option C (allocation loop):** Add "Alokovat na zakázku" dialog on PaymentGroup
detail — reverse of the existing add-allocation-dialog (caller = PaymentGroup, user
picks order). This completes the full operator loop for INCOME payment groups.

Recommended order: A → C → B
(Movement creation + allocation from PG side = complete INCOME loop first,
then movements list as reporting/audit view.)
