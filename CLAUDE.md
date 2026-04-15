# CORPORIGHT CRM — Architecture Reference

Internal CRM for managing company formation, changes, and related services.
Process-driven. Data correctness and auditability are non-negotiable.

---

## Stack

- **Next.js 15** (App Router, Server Actions, TypeScript)
- **PostgreSQL** + **Drizzle ORM**
- **shadcn/ui** + Tailwind CSS
- **NextAuth.js v5** (credentials, internal only)
- **Zod** for validation

---

## Module Boundaries

```
subjects         — identity registry (persons and companies)
orders           — central business aggregate
relations        — legal/ownership history between subjects
finance          — ledger: payment groups, movements, allocations
aml              — compliance records per subject (non-blocking)
tasks            — todos linked to subjects, orders, or AML records
documents        — files attached to subjects or orders
lt_services      — long-term recurring services
shelf_companies  — companies for sale inventory
vat_registrations— VAT registration tracking
administration   — users, role definitions, audit log
```

---

## Invariants — Never Violate These

### Subjects
- `subjects.type` (PERSON | COMPANY) is **immutable after INSERT**
- COMPANY must have a unique, non-null `registration_number` (IČO) on its profile
- Subject identity lives in three places: `subjects` (core) + `subject_person_profiles` or `subject_company_profiles` (type-specific) + `subject_addresses` (1:N)
- Do not flatten person/company fields back into a single table

### Orders
- Orders are the central aggregate — all business processes connect through them
- `order_items` are **read-only once `orders.confirmed_at` is set**
- `orders.client_subject_id` is a denormalized cache only — **not the authoritative client reference**
- The authoritative source for all participants is `order_participants`
- `order_participants` must reference either `subject_id` OR `future_subject_id` — never both, never neither (enforced by CHECK constraint)

### OrderParticipants vs Relations — NEVER merge these
- `order_participants` = role in a specific order (transactional)
- `relations` = legal/business relationship between subjects (historical record)
- A relation is typically created **when an order is COMPLETED**, not when a participant is added

### FutureSubjects
- `future_subjects` is a **real table** — do not collapse into nullable text fields on orders
- When a future subject becomes a real subject, set `resolved_subject_id` and `resolved_at` — do not delete the row

### OrderChangeActions
- `order_change_actions` is a **real foundation entity** — do not omit or defer it
- Required for any order of type `company_change`
- `old_value` / `new_value` are JSONB snapshots; `resulting_relation_id` links the action to the relation it created or ended

### Relations
- Relations are **temporal and append-only** — never update a relation row to change state
- Changing a relation = set `valid_to` + `status = HISTORICAL` on old row + INSERT new row
- Only ONE active relation of the same type between the same subject pair (enforced by partial unique index)
- Every relation mutation must produce an immutable `relation_events` row
- `relation_type` references `role_definitions.code` — not free text

### RoleDefinitions
- `role_definitions` is the single source of truth for roles across orders and relations
- `requires_aml` on a role definition is how AML requirement is determined — do not hardcode this in application logic
- Do not add free-text role strings anywhere; always FK to `role_definitions.code`

### Finance
- Finance is **ledger-based** — do not revert to a flat invoices-only model
- Core structure: `payment_groups` → `financial_movements` (entries) + `payment_allocations` (order links)
- `orders.payment_status` (UNPAID | PARTIAL | PAID | OVERPAID) is **computed from allocations** — never stored as a plain editable field
- `financial_categories` uses a self-referencing `parent_id` from day one — leave NULL in Phase 1, populate hierarchy in Phase 2 without schema changes
- Invoices are documents that drive payment expectation — they are linked to `payment_groups`, not a replacement for them

### AML
- AML records are **versioned and INSERT-only** — new state = new row, never UPDATE
- `status` is a three-state field: `COMPLETE | INCOMPLETE | WAIVED`
- WAIVED is a terminal decision state, not a modifier of INCOMPLETE
- AML is **non-blocking** — it generates a Task, it does not halt order workflow
- AML requirement is determined by `role_definitions.requires_aml` on the participant's role — not hardcoded per order type

### Audit
- `audit_log` exists from day one — do not defer it
- `relation_events` are immutable — no UPDATE or DELETE ever

---

## Implementation Guardrails

- **No polymorphic FK pairs** (`entity_type` + `entity_id`). Use explicit nullable FK columns instead.
- **No ENUM types in PostgreSQL** for domain values that may expand — use `TEXT` with CHECK constraints or reference tables.
- **All PKs are UUID** — `gen_random_uuid()` default.
- **File storage is abstracted** — `documents.storage_key` is a path or object key; never couple to a specific provider.
- `role_definitions`, `financial_categories`, and `order_change_actions.action_type` are designed for future extension — do not hardcode their values in application logic beyond seeded constants.
- Do not add automation before the manual workflow is stable and correct.

---

## Phase 1 Scope Boundary

Implement now:
- All tables in the schema (including `future_subjects`, `order_change_actions`, `relation_events`, `role_definitions`)
- Manual status transitions, manual AML records, manual finance entry
- Flat `financial_categories` (parent_id exists, stays NULL)
- `orders.snapshot` column exists as JSONB, populated as `{}` until Phase 2

Defer to Phase 2:
- Snapshot population at order confirmation
- Automated relation creation on order completion
- Automated AML task generation from role definitions
- Financial category hierarchy UI
- `role_definition_legal_forms` and `role_exclusivity_rules` join tables
- Bank import (Fio), Google Drive integration
