# CORPORIGHT CRM — Claude Engineering Lessons

This file stores persistent repository workflow lessons and non-negotiable engineering discipline discovered during development.

It is not feature planning.
It is operational governance memory.

Claude must read this before major implementation sessions.

---

## 1. Canonical Branch Discipline

Before any major coding wave, always verify:

- current branch name
- git status
- branch lineage
- whether current branch truly contains all prior completed implementation waves

Never assume the current worktree is the correct continuation base without verification.

Repository continuity is mandatory.

---

## 2. Divergent Branches Are Not Auto-Merge Candidates

If two feature branches diverged for multiple sessions:

- do not default to git merge,
- do not default to git rebase.

First perform a file-aware integration audit.

Use manual selective porting when one branch is canonical and the other is only an additive donor.

---

## 3. Minimal Touch Policy

Touch only files necessary for the current mission.

Do not perform opportunistic cleanup, refactors, naming harmonization, or architectural beautification unless explicitly requested.

Avoid unnecessary blast radius.

---

## 4. Shared File Ownership Awareness

When integrating donor code:

- determine which branch owns each shared file,
- preserve the more evolved source-of-truth version,
- import only explicitly needed additive assets.

Never overwrite a more evolved file with an older donor version.

---

## 5. Guarded Multi-Step Sessions

For sessions with multiple architectural steps:

- maintain a task checklist,
- execute in guarded subwaves,
- stop after each subwave for verification and review before proceeding.

Do not run long uncontrolled implementation chains.

---

## 6. Verification Before Completion

Never declare a session complete without evidence.

At minimum run:

- TypeScript compile verification
- relevant migration verification
- targeted smoke/runtime sanity checks when applicable

Implementation without verification is not considered complete.

---

## 7. Stop If Drift Appears

If compile failures, migration inconsistencies, architectural drift, or unexpected dependency conflicts appear:

STOP.

Do not continue stacking patches blindly.

Reassess and update the plan first.

---

## 8. Preserve Domain Invariants

Never sacrifice domain architecture for implementation convenience.

The following remain non-negotiable:

- Subjects as canonical legal registry
- Relations as historical legal graph
- FutureSubjects as real entities
- Order completion hooks preserving legal mutations
- Finance as ledger model
- AML as auditable non-blocking compliance layer

---

## 9. Session Closing Discipline

At the end of each major session always summarize:

- files changed,
- verification executed,
- unresolved risks,
- whether current branch remains canonical continuation base.