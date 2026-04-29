# CC Session 10.0 — Orders + Finance Production Core Completion

Canonical branch/worktree: feat-relations-phase-1a  
Repository path: C:\Corporight\Claude\Corporight CRM 1.0\.worktrees\feat-relations-phase-1a\my-app

Mission type: BOUNDED PRODUCTION-CORE IMPLEMENTATION

Session 9 delivered:
- global CRM shell,
- visual stabilization,
- accessible orders list/detail shell,
- basic finance allocation visibility.

Session 10 now upgrades Orders + Finance from structural placeholders into the first business-usable transactional core.

---

## NON-NEGOTIABLE PRESERVATION RULES

Do NOT break:

- src/lib/subjects/**
- src/lib/relations/**
- src/lib/aml/enforcement.ts
- src/lib/orders/completion.ts
- src/lib/orders/future-subjects.ts
- all audited Session 9 shell layout files unless explicitly required

Do NOT install packages.
Do NOT perform uncontrolled broad UI redesign.
All work must stay bounded to Orders/Finance production-core enablement.

Schema changes are allowed only if strictly necessary and must remain minimal, explicit, and justified.

---

## SUB-WAVE A — Orders Operational Completion

Goal:
Turn Orders from a basic registry row into a usable operational business aggregate.

Implement:

- [ ] enrich order creation flow so new orders capture meaningful business-operational fields, not just minimal stub fields
- [ ] ensure order overview/detail exposes:
      - order type
      - primary client/orderer context
      - recipient context
      - internal note
      - due date / created / confirmed / completed timeline where available
      - financial expectation summary placeholder
- [ ] improve order detail overview so it becomes a readable operational summary rather than raw data shell
- [ ] ensure order list columns reflect meaningful operational information and not dead placeholders
- [ ] preserve existing audited order completion backend invariants

Mandatory Verification Gate A:
- [ ] TypeScript passes
- [ ] npm run build passes
- [ ] orders can be created and reviewed through a meaningful operational flow

---

## SUB-WAVE B — Finance Expected vs Actual Core

Goal:
Introduce the first real financial expectation loop per order.

Implement:

- [ ] establish expected incoming financial amount per order derived from order items / pricing
- [ ] establish expected outgoing cost summary placeholder per order
- [ ] surface expected vs allocated actual incoming payments inside order finance section
- [ ] surface basic expected margin/profit visibility
- [ ] keep using existing finance backend/payment allocation foundations where possible

Do NOT build full standalone finance module UI yet.

Mandatory Verification Gate B:
- [ ] TypeScript passes
- [ ] npm run build passes
- [ ] order detail finance tab shows meaningful expected vs actual business information

---

## SUB-WAVE C — Payment Status / Order Financial Logic

Goal:
Make order payment status reflect actual transactional business reality.

Implement:

- [ ] compute order payment state from expected incoming amount vs allocated incoming payments
- [ ] support:
      UNPAID
      PARTIALLY_PAID
      PAID
      OVERPAID
- [ ] expose payment state visibly in:
      - orders list
      - order detail header/overview
- [ ] ensure payment state updates automatically from finance allocations

Do NOT create a fake manually edited payment status field.

Mandatory Verification Gate C:
- [ ] payment status changes correctly when allocations change
- [ ] build passes

---

## SUB-WAVE D — Administration Dictionary Plumbing (Minimal)

Goal:
Begin using administration/config sources where already structurally available.

Implement minimally where safe:

- [ ] connect visible business selectors to canonical dictionary/config sources where repository already contains them
- [ ] reduce hardcoded placeholder select values in Orders/Finance where possible
- [ ] preserve bounded scope — do not attempt full Administration module implementation

Mandatory Verification Gate D:
- [ ] build passes
- [ ] no uncontrolled admin sprawl introduced

---

## EXPLICITLY OUT OF SCOPE FOR SESSION 10

Do NOT implement yet:

- full standalone finance route vertical
- payment group browser pages
- full administration CRUD module
- long-term services vertical
- VAT registrations vertical
- tasks vertical
- localization/polish pass
- broad visual redesign

These come later.

---

## SESSION SUCCESS CONDITION

By the end of CC Session 10.0 the repository should provide:

- materially more useful operational Orders flow,
- first meaningful order financial expectation visibility,
- automatic payment status logic tied to allocations,
- first minimal config-source plumbing,

while preserving repository stability.

---

## POST-SESSION ROADMAP ANCHOR

Expected progression after successful Session 10:

### CC Session 11.0 — Finance Standalone Operational UI
- finance routes
- payment group browsing
- movement creation
- allocation management expansion

### CC Session 12.0 — Administration + Master Data Layer
- service definitions
- finance tree
- business areas / trade licences
- user/admin basics

### CC Session 13.0 — Remaining Business Vertical Expansion
- AML standalone
- long-term services
- VAT registrations
- tasks