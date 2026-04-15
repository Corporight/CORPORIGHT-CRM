# Finance Module — Phase 1 Design

**Date:** 2026-04-15
**Branch:** feature/finance-module
**Status:** Approved — proceeding to implementation

---

## Scope

Phase 1 finance core for Corporight CRM. Supports:
- Manual income / expense recording
- Payment allocation to orders
- Computed order payment status (UNPAID → PARTIALLY_PAID → PAID → OVERPAID)
- Actual order economics (allocated payments, expense total, actual profit)

### Explicitly out of scope (Phase 2)

- Bank import (Fio / BANK_IMPORT source)
- Period closures
- Financial default rules
- Movement templates
- Planned-cost analytics
- `vat_registrations` FK on movements (table not yet in schema)
- `movement_templates` FK on movements
- Snapshot-based order total (orders.snapshot is `{}` in Phase 1)
- Registration-cost aggregation via vat_registration_id
- Full REVERSE_CHARGE mechanics (vocabulary present, no special logic)

---

## Architecture

### New files

| File | Purpose |
|---|---|
| `src/db/schema/finance.ts` | All seven finance tables |
| `src/lib/finance/validators.ts` | Zod input schemas |
| `src/lib/finance/helpers.ts` | Internal: recalculate helpers, computeOrderTotal, computeOrderPaymentStatus |
| `src/lib/finance/actions.ts` | `'use server'` public API |
| `scripts/smoke-finance.ts` | Smoke test |

### Modified files

| File | Change |
|---|---|
| `src/db/schema/index.ts` | Add `export * from './finance'` |

---

## Schema

### `centers`

```
id              UUID PK
code            TEXT NOT NULL UNIQUE
name            TEXT NOT NULL
vat_mode        TEXT NOT NULL
is_active       BOOLEAN NOT NULL DEFAULT true
sort_order      INTEGER NOT NULL DEFAULT 0
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL  ← explicit on every UPDATE
```

### `financial_tree_categories`

```
id              UUID PK
code            TEXT NOT NULL UNIQUE
name            TEXT NOT NULL
direction       TEXT NOT NULL  CHECK IN ('INCOME','EXPENSE','INTERNAL')
is_active       BOOLEAN NOT NULL DEFAULT true
sort_order      INTEGER NOT NULL DEFAULT 0
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
```

**Spec inconsistency:** Seed data assigns direction `BOTH` to CORRECTION category, but the vocabulary definition lists only `INCOME | EXPENSE | INTERNAL`. Phase 1 uses `INTERNAL` for CORRECTION. Spec should be reconciled.

### `financial_tree_types`

```
id              UUID PK
code            TEXT NOT NULL UNIQUE
category_id     UUID NOT NULL FK → financial_tree_categories
name            TEXT NOT NULL
is_active       BOOLEAN NOT NULL DEFAULT true
sort_order      INTEGER NOT NULL DEFAULT 0
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
```

### `financial_tree_details`

```
id              UUID PK
code            TEXT NOT NULL UNIQUE
type_id         UUID NOT NULL FK → financial_tree_types
name            TEXT NOT NULL
is_active       BOOLEAN NOT NULL DEFAULT true
sort_order      INTEGER NOT NULL DEFAULT 0
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
```

### `payment_groups`

```
id                          UUID PK
center_id                   UUID NOT NULL FK → centers
direction                   TEXT NOT NULL  CHECK IN ('INCOME','EXPENSE','INTERNAL')
total_amount                NUMERIC(14,2) NOT NULL  CHECK > 0
allocated_amount            NUMERIC(14,2) NOT NULL DEFAULT 0  CHECK >= 0
processing_status           TEXT NOT NULL DEFAULT 'NEW'
                            CHECK IN ('NEW','PARTIALLY_ALLOCATED','FULLY_ALLOCATED','CANCELLED')
currency                    TEXT NOT NULL DEFAULT 'CZK'
transaction_date            DATE NOT NULL
counterparty_subject_id     UUID FK → subjects (nullable)
counterparty_name           TEXT (nullable)
counterparty_account_number TEXT (nullable)
counterparty_bank_code      TEXT (nullable)
variable_symbol             TEXT (nullable)
constant_symbol             TEXT (nullable)
specific_symbol             TEXT (nullable)
bank_reference              TEXT (nullable)
source                      TEXT NOT NULL DEFAULT 'MANUAL'
                            CHECK IN ('MANUAL','CASH','BANK_IMPORT')
note                        TEXT (nullable)
note_internal               TEXT (nullable)
version                     INTEGER NOT NULL DEFAULT 1   ← optimistic locking, inc on every UPDATE
created_at                  TIMESTAMPTZ NOT NULL
updated_at                  TIMESTAMPTZ NOT NULL
created_by                  UUID FK → users ON DELETE SET NULL
```

**Spec inconsistency (processing_status):** The spec uses `NEW` as the initial state in the entity definition but `UNALLOCATED` in some prose sections. Phase 1 uses `NEW` as defined in the entity schema. `UNALLOCATED` is not a valid value.

**Phase 1 simplification:** `source = BANK_IMPORT` is in the CHECK vocabulary but the service layer rejects creating a payment group with that source. Bank import mechanics are Phase 2.

### `financial_movements`

```
id                  UUID PK
payment_group_id    UUID FK → payment_groups (nullable)
order_id            UUID FK → orders (nullable)
order_item_id       UUID FK → order_items (nullable)
subject_id          UUID FK → subjects (nullable)
vat_registration_id UUID (nullable, no FK — table not yet in schema; FK added Phase 2)
center_id           UUID NOT NULL FK → centers
direction           TEXT NOT NULL  CHECK IN ('INCOME','EXPENSE','INTERNAL')
amount_gross        NUMERIC(14,2) NOT NULL  CHECK >= 0
amount_net          NUMERIC(14,2) NOT NULL  CHECK >= 0
vat_amount          NUMERIC(14,2) NOT NULL DEFAULT 0  CHECK >= 0
vat_mode            TEXT NOT NULL DEFAULT 'NO_VAT'
                    CHECK IN ('NO_VAT','STANDARD','REVERSE_CHARGE')
vat_rate            NUMERIC(5,2) NOT NULL DEFAULT 0
category_id         UUID NOT NULL FK → financial_tree_categories
type_id             UUID NOT NULL FK → financial_tree_types
detail_id           UUID NOT NULL FK → financial_tree_details
description         TEXT NOT NULL
movement_date       DATE NOT NULL
accounting_date     DATE (nullable)
document_number     TEXT (nullable)
document_date       DATE (nullable)
template_id         UUID (nullable, no FK — movement_templates is Phase 2)
note                TEXT (nullable)
note_internal       TEXT (nullable)
created_at          TIMESTAMPTZ NOT NULL
updated_at          TIMESTAMPTZ NOT NULL
created_by          UUID FK → users ON DELETE SET NULL
```

**Direction consistency rule:** If `payment_group_id` is set, `movement.direction` must equal `payment_group.direction`. Enforced in service layer.

**Phase 1 simplification:** `amount_gross = amount_net + vat_amount` and `NO_VAT → vat_amount = 0` enforced in Zod + service layer only. Multi-column arithmetic DB CHECK deferred.

### `payment_allocations`

```
id                  UUID PK
payment_group_id    UUID NOT NULL FK → payment_groups
order_id            UUID NOT NULL FK → orders
allocated_amount    NUMERIC(14,2) NOT NULL  CHECK > 0
status              TEXT NOT NULL DEFAULT 'ACTIVE'  CHECK IN ('ACTIVE','CANCELLED')
cancelled_at        TIMESTAMPTZ (nullable)
note                TEXT (nullable)
created_at          TIMESTAMPTZ NOT NULL
updated_at          TIMESTAMPTZ NOT NULL
created_by          UUID FK → users ON DELETE SET NULL
```

**Phase 1 design choice (soft-cancel):** Spec requires cancellation and auditability but does not specify storage model. Soft-cancel (status = CANCELLED, row retained) is chosen for consistency with the append-only principle applied to relations, relation_events, and aml_records in this codebase. Hard-delete + audit_log-only history is the alternative.

**Allocation restriction:** Only `INCOME` payment groups may have allocations created against them.

---

## Service Layer

### Return type

All public functions return `ActionResult<T>`:
```ts
type ActionResult<T> = { success: true; data: T } | { success: false; error: string }
```

### Internal helpers (`helpers.ts`)

#### `computeOrderTotal(tx, orderId) → string`
Sums `order_items.total_price` for the order.
**Phase 1 note:** Uses live order_items. Phase 2 switches to `orders.snapshot` after confirmation.

#### `computeOrderPaymentStatus(allocatedAmount: string, orderTotal: string) → PaymentStatus`
Pure function. No DB access.
```
allocated = 0              → UNPAID
0 < allocated < total      → PARTIALLY_PAID
allocated = total          → PAID
allocated > total          → OVERPAID
```

#### `recalculatePaymentGroupAllocationState(tx, paymentGroupId) → { allocatedAmount, processingStatus }`
Sums ACTIVE allocations. Updates `payment_groups`:
```
allocated = 0              → NEW
0 < allocated < total      → PARTIALLY_ALLOCATED
allocated >= total         → FULLY_ALLOCATED
```
Always recalculates from scratch — no "stays" or history-based branching.

#### `recalculateOrderPaymentStatus(tx, orderId) → PaymentStatus`
Sums ACTIVE allocations for the order, calls `computeOrderTotal`, returns `computeOrderPaymentStatus(...)`.
Does not write. Caller decides whether to audit.

### Public actions (`actions.ts`)

#### Setup functions
- `createCenter(input)` → `{ id }`
- `createFinancialTreeCategory(input)` → `{ id }`
- `createFinancialTreeType(input)` → `{ id }` — validates category exists
- `createFinancialTreeDetail(input)` → `{ id }` — validates type exists

#### Core finance
- `createPaymentGroup(input)` → `{ id }`
  - Rejects `source = BANK_IMPORT`
  - Audit: `PAYMENT_GROUP_CREATED`

- `createFinancialMovement(input)` → `{ id }`
  - Validates: `amount_gross = amount_net + vat_amount`
  - Validates: `NO_VAT → vat_amount = 0`
  - Validates tree linkage: type.category_id must match input category_id; detail.type_id must match input type_id
  - If `payment_group_id` set: validates payment group exists and `movement.direction = payment_group.direction`
  - Audit: `FINANCIAL_MOVEMENT_CREATED`

- `createPaymentAllocation(input)` → `{ id }`
  - Pre-checks: order exists; payment group exists, is INCOME, is not CANCELLED
  - Inside tx:
    1. `SELECT FOR UPDATE` on payment_group row (concurrency lock)
    2. Compute old order payment status
    3. Guard: `payment_group.allocated_amount + new_amount ≤ total_amount`
    4. INSERT allocation
    5. `recalculatePaymentGroupAllocationState`
    6. Compute new order payment status
    7. If changed → INSERT `ORDER_PAYMENT_STATUS_CHANGED` audit row
    8. INSERT `PAYMENT_ALLOCATION_CREATED` audit row
  - Audit payload for `ORDER_PAYMENT_STATUS_CHANGED`: `{ orderId, previousStatus, newStatus, allocatedAmount, orderTotal }`

- `cancelPaymentAllocation(input)` → `{ id }`
  - Inside tx (conditional UPDATE pattern from existing codebase):
    1. Read allocation (must exist and be ACTIVE)
    2. `SELECT FOR UPDATE` on payment_group
    3. Compute old order payment status
    4. `UPDATE ... SET status='CANCELLED', cancelled_at=now WHERE id=... AND status='ACTIVE'` + `.returning()`
    5. 0-row → business error
    6. `recalculatePaymentGroupAllocationState`
    7. Compute new order payment status
    8. If changed → INSERT `ORDER_PAYMENT_STATUS_CHANGED`
    9. INSERT `PAYMENT_ALLOCATION_CANCELLED`

#### Read functions
- `listPaymentGroups(input)` — filter by direction, processing_status; paginated
- `listFinancialMovements(input)` — filter by order_id, direction, movement_date range; paginated
- `listAllocationsForOrder(orderId)` — returns ACTIVE and CANCELLED allocations
- `getOrderPaymentStatus(orderId)` — computed on demand
- `getOrderEconomics(orderId)` → `{ allocatedPayments, expenseTotal, actualProfit, paymentStatus }`
  - `allocatedPayments` = SUM(ACTIVE allocations for order)
  - `expenseTotal` = SUM(financial_movements.amount_gross WHERE order_id AND direction = EXPENSE)
  - `actualProfit` = allocatedPayments - expenseTotal
  - `paymentStatus` = computed

---

## Audit log entries

| Action | Trigger |
|---|---|
| `PAYMENT_GROUP_CREATED` | createPaymentGroup |
| `FINANCIAL_MOVEMENT_CREATED` | createFinancialMovement |
| `PAYMENT_ALLOCATION_CREATED` | createPaymentAllocation |
| `PAYMENT_ALLOCATION_CANCELLED` | cancelPaymentAllocation |
| `ORDER_PAYMENT_STATUS_CHANGED` | allocation create or cancel, when derived status changes. Payload: `{ orderId, previousStatus, newStatus, allocatedAmount, orderTotal }` |

---

## Smoke test scenarios

1. Full lifecycle: order UNPAID → PARTIALLY_PAID → PAID
2. Overpaid order: second allocation exceeds order total → OVERPAID
3. Expense movement linked to order → getOrderEconomics returns correct profit
4. Allocation cancellation: payment group recalculates, order reverts to PARTIALLY_PAID
5. Guard: allocation exceeding payment group total_amount is rejected
6. Guard: allocation against non-INCOME payment group is rejected

---

## Known spec inconsistencies

| Inconsistency | Phase 1 resolution |
|---|---|
| `CORRECTION` category uses direction `BOTH` in seed data, but `BOTH` is not in the vocabulary definition | Use `INTERNAL` for CORRECTION in Phase 1 |
| `processing_status` initial value is `NEW` in entity definition but `UNALLOCATED` in prose | Use `NEW` |
| `COMPANY_SALE` in some spec sections vs `SHELF_PURCHASE` in codebase | Keep `SHELF_PURCHASE` — no rename |
| `BOTH` direction in spec seed data | Not implemented; `INTERNAL` used instead |

---

## Phase 2 follow-ups

- Populate `orders.snapshot` at confirmation time; switch `computeOrderTotal` to read from snapshot
- Add FK constraint from `financial_movements.vat_registration_id` to `vat_registrations`
- Add FK constraint from `financial_movements.template_id` to `movement_templates`
- Implement bank import mechanics (BANK_IMPORT source)
- Registration-cost aggregation via vat_registration_id
- Full REVERSE_CHARGE tax mechanics
- Period closures
- Financial default rules
- Movement templates
