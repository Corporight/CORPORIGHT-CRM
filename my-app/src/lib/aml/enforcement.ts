// aml/enforcement.ts — AML enforcement layer for order processing
//
// ── Why AML is enforced at order boundaries ────────────────────────
// Orders represent business commitments — they trigger document preparation,
// legal filings, and financial transactions. Proceeding without verifying
// a client's identity or assessing their risk exposes the company to
// regulatory liability under AML/KYC obligations.
//
// Enforcement is applied at two points:
//   1. Order CREATION — early warning; most orders are still allowed to
//      be created in an unverified state so work can begin in parallel,
//      but the operator is informed of the AML gap.
//   2. Order PROGRESSION — hard gates before DOCUMENT_PREPARATION and
//      EXECUTION, where real legal/financial commitments are made.
//      These transitions are blocked until KYC is COMPLETED.
//
// ── What is allowed vs blocked ────────────────────────────────────
// Creation:
//   No AML record         → ALLOW, warning returned to caller
//   kyc_status NOT_STARTED → ALLOW, warning returned to caller
//   kyc_status IN_PROGRESS → ALLOW, warning returned to caller
//   kyc_status COMPLETED   → ALLOW, no warning
//   kyc_status REJECTED    → BLOCK — order cannot be created
//   risk_level HIGH        → ALLOW only with explicit amlOverride = true,
//                            otherwise blocked; override is logged
//
// Progression (→ DOCUMENT_PREPARATION or → EXECUTION):
//   No AML record         → BLOCK
//   kyc_status != COMPLETED → BLOCK
//   kyc_status COMPLETED   → ALLOW
//   (risk_level does not block progression — only creation)
//
// ── Phase 2 evolution ─────────────────────────────────────────────
// - Add automated AML task generation when an order is created without
//   a completed AML record (currently only a warning is returned)
// - Add risk-level escalation based on check results
// - Add scheduled review reminders for HIGH risk subjects
// - Integrate external sanctions/PEP APIs into aml_checks

import { db } from '@/db'
import { amlRecords } from '@/db/schema'
import { eq } from 'drizzle-orm'
import type { KycStatus, RiskLevel } from '@/db/schema'
import type { OrderStatus } from '@/db/schema'

// ── AML status helper ──────────────────────────────────────────────

export type AmlStatusResult = {
  exists: boolean
  kycStatus: KycStatus | null
  riskLevel: RiskLevel | null
}

// Returns the current AML summary for a subject.
// Returns { exists: false, ... } if no aml_record row exists yet.
export async function getAmlStatusForSubject(subjectId: string): Promise<AmlStatusResult> {
  const record = await db.query.amlRecords.findFirst({
    where: eq(amlRecords.subjectId, subjectId),
    columns: { kycStatus: true, riskLevel: true },
  })

  if (!record) {
    return { exists: false, kycStatus: null, riskLevel: null }
  }

  return {
    exists: true,
    kycStatus: record.kycStatus as KycStatus,
    riskLevel: record.riskLevel as RiskLevel | null,
  }
}

// ── Order creation evaluation ──────────────────────────────────────

export type AmlCreationDecision =
  | { decision: 'ALLOW' }
  | { decision: 'ALLOW_WITH_WARNING'; warning: string }
  | { decision: 'REQUIRE_OVERRIDE'; warning: string }
  | { decision: 'BLOCK'; reason: string }

// Evaluate whether an order can be created for a given client subject.
// amlOverride = true allows a HIGH risk subject through with a log entry.
export async function evaluateAmlForOrderCreation(
  subjectId: string,
  amlOverride: boolean = false,
): Promise<AmlCreationDecision> {
  const aml = await getAmlStatusForSubject(subjectId)

  // Hard block: REJECTED subjects cannot receive new orders.
  if (aml.exists && aml.kycStatus === 'REJECTED') {
    return {
      decision: 'BLOCK',
      reason: 'Client has a REJECTED AML status. Order creation is not permitted.',
    }
  }

  // HIGH risk requires explicit operator acknowledgement.
  if (aml.exists && aml.riskLevel === 'HIGH') {
    if (!amlOverride) {
      return {
        decision: 'REQUIRE_OVERRIDE',
        warning:
          'Client is classified as HIGH risk. Set amlOverride = true to proceed. ' +
          'This action will be logged.',
      }
    }
    // Override provided — log and allow.
    console.warn(
      `[AML] HIGH risk override used for subject ${subjectId} during order creation. ` +
        `kyc_status=${aml.kycStatus}. Override must be documented manually.`,
    )
  }

  // No AML record at all.
  if (!aml.exists) {
    return {
      decision: 'ALLOW_WITH_WARNING',
      warning: 'No AML record found for this client. AML verification must be initiated.',
    }
  }

  // KYC not yet complete — allow but surface to caller.
  if (aml.kycStatus === 'NOT_STARTED') {
    return {
      decision: 'ALLOW_WITH_WARNING',
      warning: 'Client AML verification has not been started. KYC must be completed before document preparation.',
    }
  }

  if (aml.kycStatus === 'IN_PROGRESS') {
    return {
      decision: 'ALLOW_WITH_WARNING',
      warning: 'Client AML verification is in progress. KYC must be completed before document preparation.',
    }
  }

  // COMPLETED — clear to proceed.
  return { decision: 'ALLOW' }
}

// ── Order progression evaluation ───────────────────────────────────

// Statuses that require a fully COMPLETED AML record before transition.
const AML_GATED_STATUSES: OrderStatus[] = ['DOCUMENT_PREPARATION', 'EXECUTION']

export type AmlProgressionDecision =
  | { decision: 'ALLOW' }
  | { decision: 'BLOCK'; reason: string }

// Evaluate whether an order can progress to targetStatus for a given client.
// Only enforced for AML_GATED_STATUSES — other transitions pass through.
export async function evaluateAmlForOrderProgression(
  subjectId: string,
  targetStatus: OrderStatus,
): Promise<AmlProgressionDecision> {
  if (!AML_GATED_STATUSES.includes(targetStatus)) {
    return { decision: 'ALLOW' }
  }

  const aml = await getAmlStatusForSubject(subjectId)

  if (!aml.exists) {
    return {
      decision: 'BLOCK',
      reason: `Order cannot move to ${targetStatus}: no AML record exists for this client. ` +
        'AML verification must be completed first.',
    }
  }

  if (aml.kycStatus !== 'COMPLETED') {
    return {
      decision: 'BLOCK',
      reason:
        `Order cannot move to ${targetStatus}: client KYC status is '${aml.kycStatus}'. ` +
        'KYC must be COMPLETED before this transition.',
    }
  }

  return { decision: 'ALLOW' }
}
