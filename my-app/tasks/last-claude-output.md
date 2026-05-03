# CC Session 12.2 — Implementation Report

## Mission

FinancialMovement creation inside PaymentGroups — standalone finance operator workflow.

## Base commit

`33a2b24` — CC Session 12.1: add standalone finance payment groups UI

---

## Changed Files

### Modified
- `src/lib/finance/actions.ts` — added 3 read helpers + `or`/`SQL` imports

### Created (new, untracked)
- `src/app/finance/payment-groups/[id]/movements/new/page.tsx`
- `src/app/finance/payment-groups/[id]/movements/new/_components/create-movement-form.tsx`

### Modified (single-line change)
- `src/app/finance/payment-groups/[id]/page.tsx` — added "Přidat pohyb" link to movements section header

---

## What Was Built

### 1. Backend: finance tree list helpers (`actions.ts`)

Three new exported read functions:

```ts
listFinancialTreeCategories(input?: { activeOnly?: boolean; direction?: string })
```
- Filters by `isActive` (default true)
- `direction` filter: returns categories where `direction = input.direction OR direction = 'BOTH'`
- Uses `or()` + correctly typed `(SQL | undefined)[]` conditions array
- Returns `ActionResult<{ items: FinancialTreeCategoryListItem[] }>`

```ts
listFinancialTreeTypes(input?: { categoryId?: string; activeOnly?: boolean })
```
- Optional `categoryId` filter; `activeOnly` defaults true
- Returns `ActionResult<{ items: FinancialTreeTypeListItem[] }>`

```ts
listFinancialTreeDetails(input?: { typeId?: string; activeOnly?: boolean })
```
- Optional `typeId` filter; `activeOnly` defaults true
- Returns `ActionResult<{ items: FinancialTreeDetailListItem[] }>`

All three exported list item types also added.

### 2. UI: "Přidat pohyb" button (`payment-groups/[id]/page.tsx`)

Movements section header is now a flex row:
- "Finanční pohyby" heading on the left
- "Přidat pohyb" link button on the right → `/finance/payment-groups/[id]/movements/new`

### 3. New route: `movements/new/page.tsx` (server component)

- Awaits `params: Promise<{ id: string }>` (Next.js 15 pattern)
- Calls `getPaymentGroupDetail(id)` — `notFound()` if missing
- Loads `listFinancialTreeCategories({ direction: pg.direction })` — filtered by PG direction + BOTH
- Loads `listFinancialTreeTypes()` + `listFinancialTreeDetails()` — all active, for client-side cascade
- Computes `defaultMovementDate = new Date().toISOString().split('T')[0]`
- Renders page header + back link + `<CreateMovementForm>`

### 4. New component: `create-movement-form.tsx` (client component)

Full form for creating a FinancialMovement inside an existing PaymentGroup:

**Fixed/inherited from PaymentGroup:**
- `centerId`, center display name, and `direction` — read-only, not user-editable

**User-editable fields:**
- `movementDate` — date input (default today)
- `description` — required text input
- Category → Type → Detail cascading selects (client-side filtering, fully controlled state)
- `vatMode` — NO_VAT / STANDARD / REVERSE_CHARGE
- `amountNet` — number input (controlled)
- `vatRate` — number input (visible only when vatMode ≠ NO_VAT)

**Computed read-only display:**
- `vatAmount = Math.round(amountNet * (vatRate/100) * 100) / 100` (0 when NO_VAT)
- `amountGross` computed via integer-scaled addition: `(Math.round(amountNet*100) + Math.round(vatAmount*100)) / 100`
  — guarantees server-side check `scaledGross === scaledNet + scaledVat` always passes

**Optional:**
- `note` — textarea

**On submit:** calls `createFinancialMovement()`, redirects to `/finance/payment-groups/[pgId]` on success, shows inline error on failure.

---

## Verification

- `npx tsc --noEmit` — zero errors
- Spec compliance reviewed by dedicated reviewer subagent — all requirements verified
- Code quality reviewed — 4 issues found and fixed before completion:
  - VAT float accumulation fixed (integer-scaled amountGross)
  - `name` attributes added to controlled inputs
  - Detail select made fully controlled with correct reset on category/type change
  - Dead `name="vatMode"` removed from controlled vatMode select

---

## Unresolved Risks / Deferred Items

- **Server page uses `getPaymentGroupDetail`** — fetches all movements + allocations unnecessarily for this form. Acceptable in Phase 1; a dedicated `getPaymentGroupHeader` is worth adding before data volume grows.
- **`defaultMovementDate` is UTC-based** — may show yesterday for European users past local midnight. Low risk for internal operator tool.
- **`PaymentGroupDetail.direction` typed as `string`** (not `FinanceDirection`) — causes cast in the form component. Upstream type tightening deferred.
- **No empty-detail-list guard** — if a type has zero active details the submit fails at server with ID-not-found rather than a friendly message.

---

## Branch Continuity

Branch: `feat-relations-phase-1a`
Last clean commit: `33a2b24`
Status: Wave 12.2 complete, NOT YET committed (per instruction)

Next logical step: Wave 12.3 — PaymentGroup → Order allocation from the finance side.
