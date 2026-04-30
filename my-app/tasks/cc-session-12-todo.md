# CC Session 12 — Finance Standalone Operational Vertical

## Mission
Build the first production-usable standalone Finance operator workflow on top of the already prepared finance schema and seeded finance dictionaries.

Finance must become manually operable before any automation, imports, reporting, or advanced accounting tooling.

Primary target:
manual creation, classification, tracking, and allocation of financial transactions.

---

## Confirmed Starting Baseline (after Session 11)

### Existing repository state
- finance schema foundation exists
- payment_groups / financial_movements / payment_allocations expected in DB layer
- finance master dictionaries seeded:
  - centers
  - financial_tree_categories
  - financial_tree_types
  - financial_tree_details
- CORRECTION category supports BOTH directions
- service_types table exists (empty by design)
- role definition helper exists

### Known missing business layer
- no completed standalone finance operator routes
- no validated end-to-end manual finance entry workflow
- likely partial finance remnants inside order detail only
- unknown backend completeness pending Session 12 inspection

---

## Core Business Objective of Session 12

Operator must be able to:

1. create a manual PaymentGroup
2. create one or more FinancialMovements under that PaymentGroup
3. classify each movement through seeded finance dictionaries
4. view PaymentGroups and FinancialMovements in standalone Finance module
5. manually allocate all or part of a PaymentGroup to one or more Orders
6. reflect allocation into:
   - allocated/unallocated payment state
   - PaymentGroup processing_status
   - Order payment_status

This is the minimum first usable finance ledger surface.

---

# CC Wave 12.1 — Repository Truth Audit + Foundation Gap Mapping

## Mandatory goals
- inspect all existing finance routes
- inspect finance backend actions
- inspect finance UI remnants/components
- inspect allocation dialog
- inspect DB/schema consistency
- inspect navigation shell integration
- determine exact reusable assets vs missing layers

## Mandatory outputs
- tasks/last-claude-output.md inspection report
- precise bounded implementation proposal for Wave 12.2

## No implementation unless explicitly instructed after review.

---

# CC Wave 12.2 — Standalone PaymentGroups + FinancialMovements Foundation

## Intended implementation target
Build the first usable standalone Finance entry surface:

### Standalone routes
- Finance PaymentGroups listing
- PaymentGroup detail
- FinancialMovements listing
- New manual finance entry form

### Backend
- create/list/detail PaymentGroup actions
- create/list/detail FinancialMovement actions
- allocated/unallocated helper calculations
- processing_status recomputation if missing

### UI
- operator-usable manual entry form
- consumption of existing Centers and Financial Tree dictionaries
- proper validation
- no placeholder screens

## Explicit non-goals
- no bank import
- no reports
- no closures
- no dashboard widgets
- no financial templates/default rules unless trivial reuse

---

# CC Wave 12.3 — Manual Allocation Wiring + Order Finance Synchronization

## Intended implementation target
- reusable allocation dialog from standalone PaymentGroup detail
- manual allocation create/delete
- PaymentGroup allocated_amount updates
- PaymentGroup processing_status updates
- Orders payment_status synchronization
- verify/add Order Finance tab consistency against standalone finance module

## Secondary review target
- remove or refactor broken legacy finance remnants discovered during inspection

---

# Possible CC Wave 12.4 — Finance Stabilization / Technical Debt Cleanup (only if needed)

Potential scope depending on inspection findings:
- navigation polish
- duplicated components consolidation
- broken old finance code removal
- validation hardening
- audit trail completion
- permission placeholders alignment

Not guaranteed — execute only if Session 12.3 leaves unstable remnants.

---

## Explicitly Deferred Beyond Session 12

These are NOT part of first finance operator vertical:

- bank API import / CSV import
- automatic payment matching
- FinancialDefaultRules engine
- MovementTemplates UX
- PeriodClosures
- finance reports
- dashboard analytics
- VAT registration finance special flows
- subject finance overview

These may become Session 13+ topics after manual finance workflow is stable.

---

## Governing Rule

Do not overbuild accounting software.

Session 12 is about:
a clean, manually operable internal finance ledger.

Correctness, usability, and order-payment linkage first.
Automation and analytics later.