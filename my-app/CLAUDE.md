# CORPORIGHT CRM — Claude Code Instructions

## Project identity

CORPORIGHT CRM is an internal CRM for managing company formation, company changes, finance, AML, relations, documents, and tasks.

The system is process-driven. Data correctness, auditability, and explicit manual-first workflows are non-negotiable.

## Stack

- Next.js 15 App Router
- TypeScript
- PostgreSQL + Drizzle ORM
- shadcn/ui + Tailwind CSS
- Zod validation
- NextAuth.js v5, internal credentials-based access

## Module boundaries

- subjects — identity registry for persons and companies
- orders — central business aggregate
- relations — temporal legal/business relationship history between subjects
- finance — ledger: payment groups, financial movements, payment allocations
- AML — compliance records per subject/order participant
- tasks — operational todos linked to business context
- documents — generated and uploaded documents
- long-term services — registered office, residence, recurring services
- shelf companies — companies for sale inventory
- VAT registrations — internal VAT registration workflow
- administration — users, roles, dictionaries, audit log

## Non-negotiable invariants

### Orders
- Orders are the central aggregate.
- order_participants are transactional roles in a specific order.
- relations are historical legal/business records between subjects.
- Do not merge order_participants and relations.
- client_subject_id is a denormalized cache only; order_participants are authoritative.

### Subjects
- subjects.type is immutable after insert.
- Do not flatten person/company profiles into one table.
- future_subjects remain real rows until resolved.

### Role definitions and AML
- role_definitions are the source of truth for role codes.
- role_definitions.requires_aml determines AML requirement.
- Do not hardcode AML requirements by order type.

### Relations
- Relations are temporal and append-only.
- Relation mutation means closing an old row and inserting a new row.
- Every relation mutation must produce an immutable relation_event.

### Finance
- Finance is ledger-based.
- Core model: payment_groups → financial_movements + payment_allocations.
- One PaymentGroup may contain multiple FinancialMovements.
- One PaymentGroup may be allocated to one or more Orders.
- financial_movements are ledger/classification rows.
- payment_allocations link PaymentGroup amounts to Orders.
- orders.payment_status is computed from allocations, not manually edited.
- Financial tree model is:
  financial_tree_categories → financial_tree_types → financial_tree_details.
- financial_tree_categories.direction may be INCOME, EXPENSE, INTERNAL, or BOTH.
- Manual finance workflow must be stable before bank import, automation, reports, or dashboards.

### Audit and safety
- Audit safety first.
- Do not add premature automation.
- Prefer explicit, readable, transaction-safe logic.
- Do not introduce hidden magic or broad refactors.

## Session governance

Before implementation always:
- verify current branch
- verify git status
- read the current session todo file if present
- inspect before implementing when scope is unclear
- work in bounded subwaves
- stop after verification gates
- run relevant verification commands
- always report changed files, verification, unresolved risks, and branch continuity
- do not commit until explicitly instructed

## Repository continuity

Canonical worktree:
C:\Corporight\Claude\Corporight CRM 1.0\.worktrees\crm-phase-1-foundation\my-app

Canonical branch:
feat/crm-phase-1-foundation

Normal workflow:
- Claude Code implements inside VS Code.
- ChatGPT acts as senior architect/reviewer/prompt composer.
- User pastes Claude outputs to ChatGPT after inspection or implementation waves.
- Final executable prompts for Claude are written in English.
