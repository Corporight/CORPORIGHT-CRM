/**
 * Smoke test — Flow 2: Company Formation
 * Run: DATABASE_URL=... npx tsx scripts/smoke-flow2.ts
 */

import postgres from 'postgres'

// ── Stable test fixture IDs (RFC-compliant UUIDs) ─────────────────────
// Bob is reused from Flow 1/3.

const BOB_ID      = 'cbf21ca5-2192-4000-b263-f6c29a23558b' // founder / director (from Flow 1)
const NEWCO_ID    = '184831f8-2120-4568-9522-06cb595fb136' // real company created at resolution
const OTHER_CO_ID = 'b9e5b243-9441-4e55-8f21-e9bbdbbad7a5' // different company — conflict test

// ── Helpers ───────────────────────────────────────────────────────────

function section(title: string) {
  console.log('\n' + '═'.repeat(60))
  console.log(`  ${title}`)
  console.log('═'.repeat(60))
}

function step(label: string) {
  console.log(`\n── ${label}`)
}

function log(label: string, value: unknown) {
  console.log(`${label}:`, JSON.stringify(value, null, 2))
}

let failed = false
function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓  ${label}`)
  } else {
    console.error(`  ✗  FAIL: ${label}`)
    failed = true
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) throw new Error('DATABASE_URL not set')
  process.env.DATABASE_URL = DATABASE_URL

  const sql = postgres(DATABASE_URL)

  const { createOrder, updateOrderStatus, addOrderParticipant } = await import('../src/lib/orders/actions.js')
  const { createFutureSubject, resolveFutureSubject } = await import('../src/lib/orders/future-subjects.js')

  // ── Step 0: Prerequisites ─────────────────────────────────────────

  section('STEP 0 — Prerequisites')

  step('Upsert Bob (PERSON) — founder')
  await sql`
    INSERT INTO subjects (id, type, display_name, is_active)
    VALUES (${BOB_ID}, 'PERSON', 'Bob Kratky', true)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true
  `
  console.log('  done')

  // ── Step 1: Create COMPANY_FORMATION order ────────────────────────

  section('STEP 1 — createOrder (COMPANY_FORMATION, no clientSubjectId)')

  const orderResult = await createOrder({ orderType: 'COMPANY_FORMATION' })
  log('createOrder result', orderResult)

  if (!orderResult.success) {
    console.error('FATAL: createOrder failed:', orderResult.error)
    process.exit(1)
  }
  const ORDER_ID = orderResult.data.id
  console.log('  ORDER_ID:', ORDER_ID)

  // ── Step 2: Create future subject ─────────────────────────────────

  section('STEP 2 — createFutureSubject')

  const fsResult = await createFutureSubject({
    orderId: ORDER_ID,
    intendedType: 'COMPANY',
    intendedName: 'NewCo s.r.o.',
  })
  log('createFutureSubject result', fsResult)

  if (!fsResult.success) {
    console.error('FATAL:', fsResult.error)
    process.exit(1)
  }
  const FUTURE_SUBJECT_ID = fsResult.data.id
  console.log('  FUTURE_SUBJECT_ID:', FUTURE_SUBJECT_ID)

  // ── Step 3: Add participants ───────────────────────────────────────

  section('STEP 3 — addOrderParticipant x2')

  step('Bob as FOUNDER (subjectId)')
  const founderResult = await addOrderParticipant({
    orderId: ORDER_ID,
    subjectId: BOB_ID,
    roleCode: 'FOUNDER',
  })
  log('addOrderParticipant (FOUNDER) result', founderResult)

  if (!founderResult.success) {
    console.error('FATAL:', founderResult.error)
    process.exit(1)
  }

  step('Future subject as COMPANY_BEING_FORMED (futureSubjectId)')
  const companyParticipantResult = await addOrderParticipant({
    orderId: ORDER_ID,
    futureSubjectId: FUTURE_SUBJECT_ID,
    roleCode: 'COMPANY_BEING_FORMED',
  })
  log('addOrderParticipant (COMPANY_BEING_FORMED) result', companyParticipantResult)

  if (!companyParticipantResult.success) {
    console.error('FATAL:', companyParticipantResult.error)
    process.exit(1)
  }

  // ── Step 4: Advance to EXECUTION ──────────────────────────────────

  section('STEP 4 — Status transitions → EXECUTION')

  // COMPANY_FORMATION has no clientSubjectId → no AML gate
  for (const newStatus of ['WAITING_FOR_PAYMENT', 'DOCUMENT_PREPARATION', 'WAITING_FOR_DOCUMENTS', 'EXECUTION'] as const) {
    const r = await updateOrderStatus({ orderId: ORDER_ID, newStatus })
    log(`  → ${newStatus}`, r)
    if (!r.success) {
      console.error(`FATAL: transition to ${newStatus} failed:`, r.error)
      process.exit(1)
    }
  }

  // ── Step 5: Attempt COMPLETED (should fail — future subject unresolved) ──

  section('STEP 5 — Attempt COMPLETED before resolution (expect failure)')

  const blockedComplete = await updateOrderStatus({ orderId: ORDER_ID, newStatus: 'COMPLETED' })
  log('Result (expect success=false)', blockedComplete)

  if (blockedComplete.success) {
    console.error('FATAL: COMPLETED should have been blocked by unresolved future subject')
    process.exit(1)
  }

  // ── Step 6: Register the real company subject ─────────────────────

  section('STEP 6 — Insert NewCo s.r.o. as a real subject (SQL)')

  await sql`
    INSERT INTO subjects (id, type, display_name, is_active)
    VALUES (${NEWCO_ID}, 'COMPANY', 'NewCo s.r.o.', true)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true
  `
  console.log('  NewCo inserted: ' + NEWCO_ID)

  // Also insert the "other company" for the conflict test
  await sql`
    INSERT INTO subjects (id, type, display_name, is_active)
    VALUES (${OTHER_CO_ID}, 'COMPANY', 'Other Co s.r.o.', true)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true
  `
  console.log('  Other Co inserted: ' + OTHER_CO_ID)

  // ── Step 7: Resolve future subject ───────────────────────────────

  section('STEP 7 — resolveFutureSubject')

  const resolveResult = await resolveFutureSubject({
    futureSubjectId: FUTURE_SUBJECT_ID,
    resolvedSubjectId: NEWCO_ID,
  })
  log('resolveFutureSubject result', resolveResult)

  if (!resolveResult.success) {
    console.error('FATAL:', resolveResult.error)
    process.exit(1)
  }

  // ── Step 8: Idempotency — resolve again with the same subject ─────

  section('STEP 8 — Idempotent resolve (same subject, expect success)')

  const idempotentResult = await resolveFutureSubject({
    futureSubjectId: FUTURE_SUBJECT_ID,
    resolvedSubjectId: NEWCO_ID,
  })
  log('Result (expect success=true)', idempotentResult)

  // ── Step 9: Conflict — resolve with a different subject ───────────

  section('STEP 9 — Conflicting resolve (different subject, expect failure)')

  const conflictResult = await resolveFutureSubject({
    futureSubjectId: FUTURE_SUBJECT_ID,
    resolvedSubjectId: OTHER_CO_ID,
  })
  log('Result (expect success=false)', conflictResult)

  // ── Step 10: Complete order (should now succeed) ──────────────────

  section('STEP 10 — updateOrderStatus → COMPLETED (after resolution)')

  const completeResult = await updateOrderStatus({ orderId: ORDER_ID, newStatus: 'COMPLETED' })
  log('COMPLETED result', completeResult)

  if (!completeResult.success) {
    console.error('FATAL:', completeResult.error)
    process.exit(1)
  }

  // ── DB Verification ────────────────────────────────────────────────

  section('DB VERIFICATION')

  step('orders row')
  const orderRow = await sql`
    SELECT id, number, order_type, status, client_subject_id, completed_at
    FROM orders WHERE id = ${ORDER_ID}
  `
  log('orders', orderRow)

  step('future_subjects row')
  const fsRow = await sql`
    SELECT id, order_id, intended_type, intended_name,
           resolved_subject_id, resolved_at, created_at
    FROM future_subjects WHERE id = ${FUTURE_SUBJECT_ID}
  `
  log('future_subjects', fsRow)

  step('order_participants rows')
  const participants = await sql`
    SELECT id, order_id, subject_id, future_subject_id, role_code, created_at
    FROM order_participants
    WHERE order_id = ${ORDER_ID}
    ORDER BY created_at
  `
  log('order_participants', participants)

  step('audit_log rows for this order and future subject')
  const auditRows = await sql`
    SELECT entity_type, entity_id, action, diff, created_at
    FROM audit_log
    WHERE entity_id = ${ORDER_ID}
       OR entity_id = ${FUTURE_SUBJECT_ID}
       OR entity_id IN (
         SELECT id FROM order_participants WHERE order_id = ${ORDER_ID}
       )
    ORDER BY created_at
  `
  log('audit_log', auditRows)

  // ── Assertions ─────────────────────────────────────────────────────

  section('ASSERTIONS')

  const auditActions = auditRows.map((r: any) => r.action as string)
  const count        = (a: string) => auditActions.filter((x: string) => x === a).length

  // Order
  assert('Order status is COMPLETED',                                   orderRow[0]?.status === 'COMPLETED')
  assert('Order completed_at is set',                                   orderRow[0]?.completed_at != null)
  assert('Order client_subject_id is null (no client for FORMATION)',   orderRow[0]?.client_subject_id === null)
  assert('Order order_type is COMPANY_FORMATION',                       orderRow[0]?.order_type === 'COMPANY_FORMATION')

  // Future subject
  assert('future_subject resolved_subject_id = NEWCO_ID',              fsRow[0]?.resolved_subject_id === NEWCO_ID)
  assert('future_subject resolved_at is set',                          fsRow[0]?.resolved_at != null)
  assert('future_subject intended_name = NewCo s.r.o.',                fsRow[0]?.intended_name === 'NewCo s.r.o.')
  assert('future_subject intended_type = COMPANY',                     fsRow[0]?.intended_type === 'COMPANY')
  assert('future_subject order_id = ORDER_ID',                         fsRow[0]?.order_id === ORDER_ID)

  // Participants
  const founderParticipant  = participants.find((p: any) => p.role_code === 'FOUNDER')
  const companyParticipant  = participants.find((p: any) => p.role_code === 'COMPANY_BEING_FORMED')
  assert('Participants: 2 rows',                                        participants.length === 2)
  assert('FOUNDER participant has subject_id = BOB',                   founderParticipant?.subject_id === BOB_ID)
  assert('FOUNDER participant has no future_subject_id',               founderParticipant?.future_subject_id === null)
  assert('COMPANY_BEING_FORMED participant has future_subject_id set', companyParticipant?.future_subject_id === FUTURE_SUBJECT_ID)
  assert('COMPANY_BEING_FORMED participant has no subject_id',         companyParticipant?.subject_id === null)

  // Guard: unresolved future subject blocked COMPLETED
  assert('Unresolved future subject blocked COMPLETED (success=false)', blockedComplete.success === false)
  assert('Block error mentions NewCo s.r.o.',
    typeof (blockedComplete as any).error === 'string' &&
    (blockedComplete as any).error.includes('NewCo s.r.o.'))
  assert('Block error mentions future subject',
    typeof (blockedComplete as any).error === 'string' &&
    (blockedComplete as any).error.toLowerCase().includes('future subject'))

  // Idempotent resolve
  assert('Idempotent resolve (same subject) returns success=true',     idempotentResult.success === true)

  // Conflict resolve
  assert('Conflicting resolve (different subject) returns success=false', conflictResult.success === false)
  assert('Conflict error mentions "already resolved"',
    typeof (conflictResult as any).error === 'string' &&
    (conflictResult as any).error.includes('already resolved'))

  // Audit log
  assert('audit_log: ORDER_CREATED x1',                                count('ORDER_CREATED') === 1)
  assert('audit_log: ORDER_STATUS_CHANGED x5',                         count('ORDER_STATUS_CHANGED') === 5)
  assert('audit_log: FUTURE_SUBJECT_CREATED x1',                       count('FUTURE_SUBJECT_CREATED') === 1)
  assert('audit_log: FUTURE_SUBJECT_RESOLVED x1',                      count('FUTURE_SUBJECT_RESOLVED') === 1)
  assert('audit_log: PARTICIPANT_ADDED x2',                            count('PARTICIPANT_ADDED') === 2)

  // ── Final result ────────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(60))
  if (failed) {
    console.error('  RESULT: SOME ASSERTIONS FAILED')
  } else {
    console.log('  RESULT: ALL ASSERTIONS PASSED ✓')
  }
  console.log('═'.repeat(60) + '\n')

  await sql.end()
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
