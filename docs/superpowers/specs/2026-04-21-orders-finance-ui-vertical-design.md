# Orders + Finance UI Vertical — Phase 1 Design

Date: 2026-04-21  
Branch: feature/finance-module  
Status: Approved for implementation

---

## Goal

Build the first usable Orders + Finance UI vertical on top of the existing Phase 1 backend.
No redesign of the backend domain model. No speculative scope.

---

## Stack additions

Install shadcn/ui in minimal scope alongside the existing Next.js 16 + Tailwind v4 setup.

shadcn components to install: `button`, `dialog`, `input`, `label`, `badge`, `card`, `table`, `select`

Do not install components not required by this vertical.

---

## Architecture

### Tab navigation approach

URL-based tabs. Active tab is read from `searchParams.tab` in the server page component.
Default tab when no param is present: `overview`.

Routes:
- `/orders/[id]?tab=overview`
- `/orders/[id]?tab=income`
- `/orders/[id]?tab=expenses`

Tab navigation rendered as plain `<Link>` elements styled as tabs — **not** shadcn `Tabs`.
shadcn `Tabs` is designed for client-side state switching and adds a client boundary with no benefit here.
The active tab is passed as a prop from the server page.

### Data fetching

All data fetching is server-side (server components, server actions called from server).
No `useEffect` data fetching. No client-side state used as source of truth for finance data.

### Mutation pattern

Client dialog components call server actions. On success, call `router.refresh()`.
The server re-renders the full page subtree with fresh data.
Do not maintain local copies of finance state in client components.

---

## Data flow

```
/orders                              server page
  listOrders()
  → table; order number is a link to /orders/[id]

/orders/[id]?tab=overview            server page (default)
  getOrderDetail(id)                 → 404 via notFound() if null
  → OrderDetailHeader
  → tab nav links
  → overview: order metadata grid

/orders/[id]?tab=income              server page
  getOrderDetail(id)
  getOrderEconomics(id)
  listAllocationsForOrder(id)
  → OrderFinanceSummaryCard
  → OrderAllocationsTable
      AddAllocationDialog            client component, nested
      CancelAllocationDialog         client component, one per ACTIVE row

/orders/[id]?tab=expenses            server page
  getOrderDetail(id)
  listFinancialMovements({ orderId, direction: 'EXPENSE' })
  → read-only movements table
```

---

## Backend changes

### New: `getOrderDetail(orderId)` in `src/lib/orders/actions.ts`

Simple single-row read. Returns:

```ts
{
  id, number, orderType, status,
  clientSubjectId, assignedTo,
  dueDate, notes,
  confirmedAt, completedAt, cancelledAt,
  createdAt, updatedAt,
}
```

Returns `null` if not found. Page calls `notFound()` on null.
No joins. No computed fields.

### Minor extension: `cancelPaymentAllocation` accepts `cancelledReason`

Add `cancelledReason: z.string().optional()` to `cancelPaymentAllocationSchema`.
Store in audit log `diff` alongside existing fields.
No DB schema change — `diff` is JSONB.

---

## Files to create

```
src/app/orders/page.tsx
src/app/orders/[id]/page.tsx

src/components/orders/order-detail-header.tsx
src/components/orders/order-detail-tabs.tsx

src/components/orders/finance/order-finance-income-tab.tsx
src/components/orders/finance/order-finance-expenses-tab.tsx
src/components/orders/finance/order-finance-summary-card.tsx
src/components/orders/finance/order-allocations-table.tsx
src/components/orders/finance/add-allocation-dialog.tsx
src/components/orders/finance/cancel-allocation-dialog.tsx
```

Files to modify:
- `src/lib/orders/actions.ts` — add `getOrderDetail`
- `src/lib/finance/actions.ts` — add `cancelledReason` to `cancelPaymentAllocation`
- `src/lib/finance/validators.ts` — add `cancelledReason` to `cancelPaymentAllocationSchema`
- `src/app/layout.tsx` — update title/metadata, ensure body styles support CRM layout

---

## Component specifications

### Orders list page (`src/app/orders/page.tsx`)

Server component.

- Calls `listOrders()` (default limit 50, no filters in Phase 1)
- Renders a table with columns: `Number | Type | Status | Due Date | Created`
- **Navigation:** the order `number` cell is a `<Link href="/orders/[id]">`. Do not wrap the entire row in a Link.
- Status shown as a `Badge`
- Empty state: plain message "Žádné zakázky"

### Order detail page (`src/app/orders/[id]/page.tsx`)

Server component. Receives `params.id` and `searchParams`.

- Calls `getOrderDetail(params.id)`
- If result is null, calls `notFound()` from `next/navigation`
- Resolves `activeTab` from `searchParams.tab`, defaulting to `'overview'`
- Renders: `OrderDetailHeader`, tab nav, then the active tab content

### `order-detail-header.tsx`

Server component. Receives the order object.

Shows:
- Order number (large, prominent)
- Order type (human-readable label)
- Status badge
- Due date (if set)
- Created date

### `order-detail-tabs.tsx`

Server component. Receives `orderId` and `activeTab`.

Renders three tab links:
- Přehled → `?tab=overview`
- Finance — Příjmy → `?tab=income`
- Finance — Výdaje → `?tab=expenses`

Each is a `<Link href={/orders/${orderId}?tab=X}>`.
Active tab is highlighted via prop comparison, not client hook.

### Overview tab content (inline in page or small sub-component)

Server-rendered metadata grid:
- Order number, type, status
- Client subject ID (Phase 1: raw ID, no subject name lookup)
- Assigned to (raw ID or "—")
- Due date
- Notes
- Confirmed / completed / cancelled timestamps if set

### `order-finance-income-tab.tsx`

Server component. Receives `orderId`.

Calls:
- `getOrderEconomics(orderId)` → passes result to `OrderFinanceSummaryCard`
- `listAllocationsForOrder(orderId)` → passes result to `OrderAllocationsTable`

Renders both in sequence.

### `order-finance-summary-card.tsx`

Server component. Receives economics data.

Displays as a `Card`:
- Order Total: formatted amount
- Allocated Payments: formatted amount
- Remaining: formatted amount (order total minus allocated; may be negative for OVERPAID)
- Payment Status: `Badge` with status value

Amount formatting: `Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' })`.

### `order-allocations-table.tsx`

Server component. Receives `orderId` and the list of allocations.

Table columns: `Created | Amount | Payment Group | Note | Action`

Only ACTIVE allocations appear in the main table body.
CANCELLED allocations: if any exist, show a collapsed section below ("Zrušené alokace: N") — no full table needed for them in Phase 1.

Each ACTIVE row has a "Zrušit" button that opens `CancelAllocationDialog`.
Above the table, a "Přidat alokaci" button opens `AddAllocationDialog`.

Both dialogs are client components rendered alongside the server table shell.
The table shell passes `orderId` into the dialogs as a prop.

### `add-allocation-dialog.tsx`

Client component.

**On dialog open:**
- Calls `listPaymentGroups()` with no status filter — loads all payment groups
- Filters client-side to those with `direction === 'INCOME'` and `processingStatus` in `['NEW', 'PARTIALLY_ALLOCATED']`

**Payment group select options show:**
```
PG-{truncated id} | {transactionDate} | {counterpartyName ?? counterpartyAccountNumber ?? '—'} | VS: {variableSymbol ?? '—'} | Zbývá: {remaining} CZK
```
Where `remaining = totalAmount - allocatedAmount` (computed client-side from the loaded data).

**Form fields:**
- Payment group: `<select>` (shadcn `Select`)
- Amount (CZK): `<input type="number">` (shadcn `Input`)
- Note: `<input>` optional (shadcn `Input`)

**On submit:**
- Calls `createPaymentAllocation({ paymentGroupId, orderId, allocatedAmount, note })`
- On success: close dialog, call `router.refresh()`
- On error: display error message inline in the dialog, do not close

**Loading state:** while payment groups are loading, show a spinner or disabled select.

### `cancel-allocation-dialog.tsx`

Client component. Receives `allocationId` and `orderId` as props.

Confirm dialog with:
- Confirmation text identifying the allocation amount
- Optional reason field (shadcn `Input`, maps to `cancelledReason`)

On submit:
- Calls `cancelPaymentAllocation({ paymentAllocationId, cancelledReason })`
- On success: close dialog, call `router.refresh()`
- On error: display inline error, do not close

### `order-finance-expenses-tab.tsx`

Server component. Receives `orderId`.

Read-only Phase 1 view. No create, edit, or delete actions.

Calls `listFinancialMovements({ orderId, direction: 'EXPENSE' })`.

Table columns: `Date | Description | Amount Gross | VAT Mode | Payment Group`

Empty state: "Žádné výdaje k tomuto příkazu."

---

## Explicit scope boundaries

Not in scope for this implementation:

- Auth/session guard (no auth setup exists in the project yet)
- Order creation form
- Order status transition UI
- Payment group create/detail pages
- Expense movement create or edit
- Bank import UI
- Filters or search on orders list
- Pagination UI (list uses existing backend default of 50)
- Subject name resolution (client subject shown as raw ID in Phase 1)
- Financial analytics, charts, or profit summaries beyond what `getOrderEconomics` returns

---

## Safe assumptions

- `listPaymentGroups()` called with no args returns all groups (backend defaults to limit 50). This is sufficient for Phase 1 — a large number of income groups is not expected yet.
- No auth middleware is added. Pages are accessible without login.
- Czech locale is used for amount formatting throughout.
- Status labels are displayed as-is from the backend (English enum values). Czech translations of status labels are out of scope for this implementation.
- `assignedTo` and `clientSubjectId` are displayed as raw UUIDs in Phase 1. Subject name lookups are a Phase 2 concern.

---

## Follow-up items (not required now)

- A dedicated `listAllocatablePaymentGroups(orderId)` helper that returns only INCOME + allocatable groups with remaining capacity pre-computed — simplifies the add-allocation dialog and removes client-side filtering
- Subject name display alongside IDs on order detail and allocations table
- Orders list pagination
- Status label translations (Czech)
- Auth guard once NextAuth is wired up
