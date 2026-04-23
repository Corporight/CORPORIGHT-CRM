# Relations Phase 2A — Orders Integration: Revised Implementation Plan

> **STATUS: AWAITING APPROVAL — do not implement until approved**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move COMPANY_CHANGE relation mutations from a manual pre-apply step into the order completion transaction, making them atomic with the status change, and establish a canonical dedicated `share_percentage` column on `order_change_actions` as the primary source for SHARE_TRANSFER amounts.

**Architecture:** `runCompletionHookInTx` routes by `orders.order_type`: `COMPANY_FORMATION` uses a renamed `applyParticipantGeneratedRelationsInTx` (no behavior change), `COMPANY_CHANGE` uses the new `applyOrderChangeActionsToRelationsInTx` which applies all PENDING actions inside the completion transaction. A prerequisite schema migration adds `share_percentage` to `order_change_actions`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Drizzle ORM + drizzle-kit migrations, Zod v4, PostgreSQL

---

## A. Current Schema Reality Audit

### `order_change_actions` — exact columns in DB today

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `order_id` | uuid FK → orders | |
| `action_type` | text | CHECK: `DIRECTOR_APPOINTMENT \| DIRECTOR_REMOVAL \| SHARE_TRANSFER \| ADDRESS_CHANGE \| NAME_CHANGE \| STATUTORY_REP_CHANGE \| CAPITAL_CHANGE \| OTHER` |
| `target_subject_id` | uuid FK → subjects (nullable) | The company being modified |
| `old_value` | jsonb (nullable) | Pre-change snapshot; shape varies by action type |
| `new_value` | jsonb (nullable) | Post-change intent; shape varies by action type |
| `status` | text | CHECK: `PENDING \| APPLIED \| CANCELLED` |
| `applied_at` | timestamptz (nullable) | |
| `resulting_relation_id` | uuid FK → relations (nullable) | Set on apply |
| `notes` | text (nullable) | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `created_by` | uuid FK → users (nullable) | |

**Confirmed absent:** `share_percentage`, `effective_date`, `subject_id` (dedicated), `amount`, `text_value`, `is_active`, `change_action_type_id`.

### Current JSONB payload shapes (from `change-actions.ts`)

For DIRECTOR_APPOINTMENT: `new_value = { subjectId: uuid }` — the appointee  
For DIRECTOR_REMOVAL: `old_value = { subjectId: uuid }` — the removed director  
For SHARE_TRANSFER: `old_value = { subjectId: uuid, sharePercentage?: string }` — transferor  
 `new_value = { subjectId: uuid, sharePercentage?: string }` — acquirer  

### Current completion routing discriminator

`orders.order_type` text column. Values in use: `COMPANY_FORMATION`, `COMPANY_CHANGE`, `SHELF_PURCHASE`, `VAT_REGISTRATION`, `REGISTERED_OFFICE`, `ACCOUNTING`, `OTHER`.

`COMPANY_CHANGE_NOTARY` and `COMPANY_CHANGE_COURT` are **business variants of `COMPANY_CHANGE`** — they do not exist as separate `order_type` values and must not be added as such. Routing in the completion hook branches on `orderType === 'COMPANY_CHANGE'`.

### Current `order_participants` fields relevant to SHARE_TRANSFER

| Column | Notes |
|--------|-------|
| `subject_id` | UUID of the real subject (nullable — XOR with future_subject_id) |
| `future_subject_id` | UUID of future subject (nullable — XOR with subject_id) |
| `role_code` | e.g. `SHAREHOLDER` |
| `participant_context_type` | e.g. `TRANSFEROR`, `ACQUIRER`, `SIGNER`, `STANDARD` |
| `share_percentage` | numeric(5,2) — participant's share in the context of the order |

---

## B. Mapping to Target Spec Semantics

| Spec concept | Current field | Phase 2A canonical source | Notes |
|---|---|---|---|
| Action type identity | `action_type` (text enum) | `action_type` (unchanged) | `change_action_type_id` FK deferred |
| Target company (subject B) | `target_subject_id` | `target_subject_id` | ✅ already canonical |
| Actor subject (subject A) for DIRECTOR_* | `new_value.subjectId` / `old_value.subjectId` (JSONB) | JSONB — unchanged for Phase 2A | Dedicated `subject_id` column deferred |
| Actor subjects for SHARE_TRANSFER | JSONB (prior model) | `order_participants` with `participant_context_type IN (TRANSFEROR, ACQUIRER)` and `role_code = SHAREHOLDER` | **Phase 2A change** |
| Transferred share amount | `new_value.sharePercentage` (JSONB — prior model) | `order_change_actions.share_percentage` (dedicated column) | **Requires schema migration** |
| `effective_date` | Not present | Not present — use `now()` at completion as `validFrom` | Deferred to later phase |
| `amount` | Not present | Not in scope for Phase 2A | — |
| `text_value` | Not present | Not in scope for Phase 2A | — |
| `is_active` semantic | `status` (PENDING/APPLIED/CANCELLED) | `status` unchanged | Rename/refactor deferred |
| `note` | `notes` | `notes` (unchanged) | Naming difference is cosmetic, deferred |
| Apply timestamp | `applied_at` | `applied_at` | ✅ already present |
| Resulting relation | `resulting_relation_id` | `resulting_relation_id` | ✅ already present |

### What is canonical for Phase 2A

- **`target_subject_id`** on the change action = the company (subject B for all relations)
- **`order_change_actions.share_percentage`** (new dedicated column) = the transferred share amount for SHARE_TRANSFER
- **`order_participants.subject_id`** (TRANSFEROR / ACQUIRER rows) = the persons involved in SHARE_TRANSFER
- **`new_value.subjectId` / `old_value.subjectId`** (JSONB) = actor for DIRECTOR_APPOINTMENT / DIRECTOR_REMOVAL (unchanged)
- **`orders.order_type === 'COMPANY_CHANGE'`** = routing discriminator for the change-actions pipeline

---

## C. Minimal Refactor Plan

### Files touched (3)

| File | Change type | What changes |
|------|-------------|-------------|
| `src/db/schema/orders.ts` | Add field | Add `sharePercentage` numeric column to `orderChangeActions` table definition |
| `drizzle/` | New migration | `npx drizzle-kit generate` produces the migration SQL |
| `src/lib/orders/completion.ts` | Surgical additions | Extract `applyParticipantGeneratedRelationsInTx`; add `applyOrderChangeActionsToRelationsInTx`; slim down `runCompletionHookInTx` to a router |
| `src/lib/orders/actions.ts` | Remove ~20 lines | Delete Guard 2 (PENDING change actions check) from `updateOrderStatus` |
| `src/lib/orders/change-actions.ts` | Deprecate function | Replace `applyOrderChangeActionsForOrder` body with a deprecation return |

### What stays in `completion.ts`

- `runCompletionHookInTx` — kept as the public API, signature unchanged; becomes a thin router
- All the COMPANY_FORMATION participant-to-relation logic — moved verbatim into `applyParticipantGeneratedRelationsInTx`, no behavior change

### What is added to `completion.ts`

- `applyParticipantGeneratedRelationsInTx(tx, orderId, completedBy, now)` — extracted from `runCompletionHookInTx`; contains the current COMPANY_FORMATION loop; exported
- `applyOrderChangeActionsToRelationsInTx(tx, orderId, completedBy, now)` — new; loads PENDING actions for the order, applies each; exported
- `CHANGE_ACTION_RELATION_FLAGS` — thin readability constant (exported); not a dispatch engine

### What is moved / removed

- COMPANY_FORMATION logic: moved from `runCompletionHookInTx` body into `applyParticipantGeneratedRelationsInTx`
- DIRECTOR_APPOINTMENT / DIRECTOR_REMOVAL / SHARE_TRANSFER logic: moved from `applyOrderChangeActionsForOrder` in `change-actions.ts` into `applyOrderChangeActionsToRelationsInTx` in `completion.ts`; SHARE_TRANSFER logic is replaced (new subject resolution approach)
- Guard 2 in `updateOrderStatus` (`actions.ts`): deleted — no longer valid now that completion applies pending actions itself

### What is deprecated

- `applyOrderChangeActionsForOrder` (`change-actions.ts`): body replaced with a `return { success: false, error: '...' }` deprecation message; `@deprecated` JSDoc added; all other exports in that file unchanged

### New imports required in `completion.ts`

```typescript
// Add to existing imports from '@/db/schema':
import {
  orders,
  orderParticipants,
  orderChangeActions,   // NEW
  futureSubjects,
  roleDefinitions,
  auditLog,             // NEW
  relations as relationsTable,  // NEW — must alias to avoid collision with Drizzle 'relations' helper
} from '@/db/schema'

// Add:
import { terminateRelationInTx } from '@/lib/relations/actions'  // createRelationInTx already imported

// Add:
import { z } from 'zod'
```

> **Import alias note:** `@/db/schema/index.ts` re-exports the `relations` pgTable from `relations.ts`. It does NOT re-export Drizzle ORM's `relations()` helper function — that lives in `drizzle-orm` package. The alias `relations as relationsTable` is precautionary and consistent with the existing pattern in `change-actions.ts`.

---

## D. SHARE_TRANSFER Plan

### Subject resolution

Source: `order_participants` rows for the same `orderId`.

```
transferors = participants WHERE participant_context_type = 'TRANSFEROR' AND role_code = 'SHAREHOLDER'
acquirers   = participants WHERE participant_context_type = 'ACQUIRER'   AND role_code = 'SHAREHOLDER'
```

Subject IDs come from `participant.subjectId`. Future subjects (`participant.futureSubjectId`) are not supported as transferors or acquirers in Phase 2A — hard fail if `subjectId` is null.

### Share amount resolution

Source: `orderChangeActions.sharePercentage` (the new dedicated numeric column added in the prerequisite migration).

This field holds the percentage of the company's share capital being transferred. It is set by the operator when recording the change action intent, before completion.

### Execution sequence

1. Validate `action.targetSubjectId` is non-null (the company)
2. Validate `action.sharePercentage` is non-null (from the new dedicated column)
3. Load `order_participants` for `orderId`, filter to TRANSFEROR + SHAREHOLDER and ACQUIRER + SHAREHOLDER
4. Assert exactly 1 TRANSFEROR participant → hard fail otherwise
5. Assert exactly 1 ACQUIRER participant → hard fail otherwise
6. Assert both have non-null `subjectId` → hard fail otherwise
7. Query `relations WHERE subject_a_id = transferorSubjectId AND subject_b_id = targetSubjectId AND relation_type = 'SHAREHOLDER' AND is_active = true`
8. Assert exactly 1 active SHAREHOLDER relation found → hard fail if 0 or >1
9. `terminateRelationInTx(tx, { relationId: ..., triggeredByOrderId, terminatedBy: completedBy })`
10. `createRelationInTx(tx, { subjectAId: acquirerSubjectId, subjectBId: targetSubjectId, relationType: 'SHAREHOLDER', validFrom: now, sharePercentage: action.sharePercentage, triggeredByOrderId, createdBy: completedBy })`
11. Set `resultingRelationId` to the new relation's ID

### Hard-fail conditions (throw, rolls back entire completion)

| Condition | Error message pattern |
|---|---|
| `action.targetSubjectId` is null | `SHARE_TRANSFER requires targetSubjectId` |
| `action.sharePercentage` is null | `SHARE_TRANSFER requires sharePercentage to be set on the change action` |
| TRANSFEROR participants count ≠ 1 | `SHARE_TRANSFER requires exactly 1 TRANSFEROR participant with roleCode=SHAREHOLDER. Found: N` |
| ACQUIRER participants count ≠ 1 | `SHARE_TRANSFER requires exactly 1 ACQUIRER participant with roleCode=SHAREHOLDER. Found: N` |
| TRANSFEROR participant has no `subjectId` | `SHARE_TRANSFER: TRANSFEROR participant has no resolved subjectId. Future subjects are not supported in Phase 2A` |
| ACQUIRER participant has no `subjectId` | `SHARE_TRANSFER: ACQUIRER participant has no resolved subjectId. Future subjects are not supported in Phase 2A` |
| No active SHAREHOLDER relation found for transferor | `SHARE_TRANSFER: no active SHAREHOLDER relation found for transferor {id} → company {id}` |
| Multiple active SHAREHOLDER relations for transferor | `SHARE_TRANSFER: N active SHAREHOLDER relations found for transferor {id} → company {id}. Expected exactly 1` |

---

## E. Manual Test Scenarios

### Scenario 1 — DIRECTOR_APPOINTMENT happy path

1. Create a `COMPANY_CHANGE` order, `targetSubjectId = <company uuid>`
2. Insert a `DIRECTOR_APPOINTMENT` change action: `targetSubjectId = <company>`, `newValue = { "subjectId": "<person uuid>" }`, `status = PENDING`
3. Advance order to `EXECUTION`
4. Call `updateOrderStatus({ orderId, newStatus: 'COMPLETED' })`

**Expected:**
- Order status → `COMPLETED`
- Change action → `status = APPLIED`, `appliedAt` set, `resultingRelationId` set
- New `DIRECTOR` relation in `relations` table: `subject_a_id = <person>`, `subject_b_id = <company>`, `is_active = true`
- `relation_events` row: `event_type = CREATED`, `triggered_by_order_id = <orderId>`
- `audit_log` row: `action = CHANGE_ACTION_APPLIED`, `entity_id = <action id>`

### Scenario 2 — SHARE_TRANSFER happy path

1. Create a `COMPANY_CHANGE` order
2. Pre-create an active `SHAREHOLDER` relation: `subject_a_id = <person A>`, `subject_b_id = <company>`, `is_active = true`
3. Insert a `SHARE_TRANSFER` change action: `targetSubjectId = <company>`, `sharePercentage = 50.00`, `status = PENDING` (no relevant JSONB fields needed)
4. Add participant: `subjectId = <person A>`, `roleCode = SHAREHOLDER`, `participantContextType = TRANSFEROR`
5. Add participant: `subjectId = <person B>`, `roleCode = SHAREHOLDER`, `participantContextType = ACQUIRER`
6. Advance order to `EXECUTION`
7. Call `updateOrderStatus({ orderId, newStatus: 'COMPLETED' })`

**Expected:**
- Order status → `COMPLETED`
- Old SHAREHOLDER relation for person A: `is_active = false`, `valid_to` set
- New SHAREHOLDER relation for person B: `is_active = true`, `share_percentage = 50.00`
- Change action → `status = APPLIED`, `resulting_relation_id` = ID of new relation
- Two `relation_events` rows: one `TERMINATED` (person A), one `CREATED` (person B)

### Scenario 3 — SHARE_TRANSFER hard fail: two TRANSFEROR participants

1. Same setup as Scenario 2
2. Add a **second** participant with `participantContextType = TRANSFEROR` and `roleCode = SHAREHOLDER`
3. Call `updateOrderStatus({ orderId, newStatus: 'COMPLETED' })`

**Expected:**
- Returns `{ success: false, error: "Order completion failed at action SHARE_TRANSFER ... exactly 1 TRANSFEROR ... Found: 2 ..." }`
- Order status remains `EXECUTION`
- No relations created or terminated
- No change actions marked APPLIED

### Scenario 4 — SHARE_TRANSFER hard fail: missing sharePercentage on action

1. Setup as Scenario 2 but with `sharePercentage = null` on the change action
2. Call `updateOrderStatus({ orderId, newStatus: 'COMPLETED' })`

**Expected:**
- Returns `{ success: false, error: "... SHARE_TRANSFER requires sharePercentage to be set ..." }`
- Order status remains `EXECUTION`
- No mutations committed

### Scenario 5 — documented-only action (ADDRESS_CHANGE)

1. Create a `COMPANY_CHANGE` order
2. Insert an `ADDRESS_CHANGE` change action: `oldValue = { "address": "..." }`, `newValue = { "address": "..." }`, `status = PENDING`
3. Advance to `EXECUTION`, complete the order

**Expected:**
- Change action → `status = APPLIED`, `resulting_relation_id = null`
- No `relations` rows created or terminated
- Order status → `COMPLETED`

### Scenario 6 — COMPANY_FORMATION regression check

1. Create a `COMPANY_FORMATION` order with future subject (COMPANY)
2. Resolve the future subject
3. Add participants with `generates_relation = true` roles (DIRECTOR, SHAREHOLDER)
4. Complete the order

**Expected:** Exact same behavior as before Phase 2A — participant relations created as usual. `applyOrderChangeActionsToRelationsInTx` is NOT called for this order type.

### Scenario 7 — deprecated `applyOrderChangeActionsForOrder`

1. Call `applyOrderChangeActionsForOrder({ orderId: '...', appliedBy: '...' })` directly

**Expected:**
- Returns `{ success: false, error: "applyOrderChangeActionsForOrder is deprecated ..." }`
- No DB mutations
- No exceptions thrown

---

## Task Order (for implementation after approval)

1. **Schema migration** — add `sharePercentage` to `order_change_actions` in schema + generate + apply migration
2. **Rewrite `completion.ts`** — extract `applyParticipantGeneratedRelationsInTx`, add `applyOrderChangeActionsToRelationsInTx`, slim router
3. **Remove Guard 2** from `actions.ts`
4. **Deprecate** `applyOrderChangeActionsForOrder` in `change-actions.ts`
5. **Build check** — `npm run build`
6. **Commit**

---

## Open Questions Before Implementation

1. **`effective_date` on `order_change_actions`:** The spec model includes this field. Should Phase 2A also add it, using it as `validFrom` on created relations (falling back to `now()` if null)? Or defer entirely?

2. **SHARE_TRANSFER `sharePercentage` validation range:** Should the completion hook enforce `0 < sharePercentage ≤ 100` at apply time, or rely on the DB CHECK constraint on `relations.share_percentage`?

3. **`applyOrderChangeActionsForOrder` cleanup:** Confirm it's safe to replace the body with a deprecation return — no callers exist in the current codebase, but confirm no external scripts reference it.
