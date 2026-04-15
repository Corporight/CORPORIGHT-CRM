/**
 * Smoke test — Flow 1: Company Change (director swap)
 * Run: DATABASE_URL=... npx tsx scripts/smoke-flow1.ts
 */

import postgres from 'postgres'

// ── Stable test fixture IDs (RFC-compliant UUIDs) ─────────────────────
// These are fixed so the test is repeatable and idempotent.

const ALICE_ID  = 'fc556de1-8d20-4719-95b6-2c03e5d94795'
const BOB_ID    = 'cbf21ca5-2192-4000-b263-f6c29a23558b'
const ACME_ID   = '652c8fed-a3c9-437a-867a-a8287de459fd'
const ALICE_REL = '95a16891-6e5d-4780-91eb-c3acfbb7fb3d'

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

  const { createOrder, updateOrderStatus } = await import('../src/lib/orders/actions.js')
  const { createOrderChangeAction, applyOrderChangeActionsForOrder } = await import('../src/lib/orders/change-actions.js')

  // ── Step 0: Prerequisites ─────────────────────────────────────────

  section('STEP 0 — Prerequisites')

  step('Upsert Alice (PERSON)')
  await sql`
    INSERT INTO subjects (id, type, display_name, is_active)
    VALUES (${ALICE_ID}, 'PERSON', 'Alice Novak', true)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true
  `
  console.log('  done')

  step('Upsert Bob (PERSON)')
  await sql`
    INSERT INTO subjects (id, type, display_name, is_active)
    VALUES (${BOB_ID}, 'PERSON', 'Bob Kratky', true)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true
  `
  console.log('  done')

  step('Upsert Acme s.r.o. (COMPANY)')
  await sql`
    INSERT INTO subjects (id, type, display_name, is_active)
    VALUES (${ACME_ID}, 'COMPANY', 'Acme s.r.o.', true)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true
  `
  console.log('  done')

  step('Upsert Alice DIRECTOR relation for Acme')
  await sql`
    INSERT INTO relations (id, subject_a_id, subject_b_id, relation_type, is_active, valid_from)
    VALUES (${ALICE_REL}, ${ALICE_ID}, ${ACME_ID}, 'DIRECTOR', true, now())
    ON CONFLICT (id) DO UPDATE SET is_active = true, valid_to = NULL, updated_at = now()
  `
  console.log('  done')

  step('Upsert AML record for Acme (kyc_status=COMPLETED — required for DOCUMENT_PREPARATION gate)')
  await sql`
    INSERT INTO aml_records (subject_id, kyc_status, risk_level, verified_at)
    VALUES (${ACME_ID}, 'COMPLETED', 'LOW', now())
    ON CONFLICT (subject_id) DO UPDATE SET kyc_status = 'COMPLETED', updated_at = now()
  `
  console.log('  done')

  // ── Step 1: Create order ──────────────────────────────────────────

  section('STEP 1 — createOrder')

  const orderResult = await createOrder({
    orderType: 'COMPANY_CHANGE',
    clientSubjectId: ACME_ID,
  })
  log('createOrder result', orderResult)

  if (!orderResult.success) {
    console.error('FATAL: createOrder failed:', orderResult.error)
    process.exit(1)
  }
  const ORDER_ID = orderResult.data.id
  console.log('  ORDER_ID:', ORDER_ID)

  // ── Step 2: Create change actions ─────────────────────────────────

  section('STEP 2 — createOrderChangeAction x2')

  step('DIRECTOR_REMOVAL (Alice out)')
  const removalResult = await createOrderChangeAction({
    orderId: ORDER_ID,
    actionType: 'DIRECTOR_REMOVAL',
    targetSubjectId: ACME_ID,
    oldValue: { subjectId: ALICE_ID },
  })
  log('DIRECTOR_REMOVAL result', removalResult)

  if (!removalResult.success) {
    console.error('FATAL:', removalResult.error)
    process.exit(1)
  }
  const REMOVAL_ACTION_ID = removalResult.data.id

  step('DIRECTOR_APPOINTMENT (Bob in)')
  const appointResult = await createOrderChangeAction({
    orderId: ORDER_ID,
    actionType: 'DIRECTOR_APPOINTMENT',
    targetSubjectId: ACME_ID,
    newValue: { subjectId: BOB_ID },
  })
  log('DIRECTOR_APPOINTMENT result', appointResult)

  if (!appointResult.success) {
    console.error('FATAL:', appointResult.error)
    process.exit(1)
  }
  const APPOINT_ACTION_ID = appointResult.data.id

  // ── Step 3: Advance through statuses ──────────────────────────────

  section('STEP 3 — Status transitions → EXECUTION')

  for (const newStatus of ['WAITING_FOR_PAYMENT', 'DOCUMENT_PREPARATION', 'WAITING_FOR_DOCUMENTS', 'EXECUTION'] as const) {
    const r = await updateOrderStatus({ orderId: ORDER_ID, newStatus })
    log(`  → ${newStatus}`, r)
    if (!r.success) {
      console.error(`FATAL: transition to ${newStatus} failed:`, r.error)
      process.exit(1)
    }
  }

  // ── Step 4: Apply all actions ──────────────────────────────────────

  section('STEP 4 — applyOrderChangeActionsForOrder')

  const applyResult = await applyOrderChangeActionsForOrder({ orderId: ORDER_ID })
  log('applyOrderChangeActionsForOrder result', applyResult)

  if (!applyResult.success) {
    console.error('FATAL: apply failed:', applyResult.error)
    process.exit(1)
  }

  // ── Step 5: Complete order ─────────────────────────────────────────

  section('STEP 5 — updateOrderStatus → COMPLETED')

  const completeResult = await updateOrderStatus({ orderId: ORDER_ID, newStatus: 'COMPLETED' })
  log('COMPLETED result', completeResult)

  if (!completeResult.success) {
    console.error('FATAL:', completeResult.error)
    process.exit(1)
  }

  // ── Step 6: Invalid transition guard ──────────────────────────────

  section('STEP 6 — Invalid transition COMPLETED → EXECUTION (expect failure)')

  const badTransition = await updateOrderStatus({ orderId: ORDER_ID, newStatus: 'EXECUTION' })
  log('Result (expect success=false)', badTransition)

  // ── DB Verification ────────────────────────────────────────────────

  section('DB VERIFICATION')

  step('orders row')
  const orderRow = await sql`
    SELECT id, number, order_type, status, completed_at
    FROM orders WHERE id = ${ORDER_ID}
  `
  log('orders', orderRow)

  step('order_change_actions rows')
  const actions = await sql`
    SELECT id, action_type, status, applied_at, resulting_relation_id
    FROM order_change_actions
    WHERE order_id = ${ORDER_ID}
    ORDER BY created_at
  `
  log('order_change_actions', actions)

  step('Alice DIRECTOR relation (should be inactive)')
  const aliceRel = await sql`
    SELECT id, subject_a_id, subject_b_id, relation_type, is_active, valid_from, valid_to
    FROM relations WHERE id = ${ALICE_REL}
  `
  log('Alice relation', aliceRel)

  step('Bob DIRECTOR relation (should be active)')
  const bobRel = await sql`
    SELECT id, subject_a_id, subject_b_id, relation_type, is_active, valid_from, valid_to
    FROM relations
    WHERE subject_a_id = ${BOB_ID}
      AND subject_b_id = ${ACME_ID}
      AND relation_type = 'DIRECTOR'
  `
  log('Bob relation', bobRel)

  const bobRelId: string = bobRel[0]?.id ?? 'none'

  step('relation_events for these relations')
  const events = await sql`
    SELECT id, relation_id, event_type, triggered_by_order_id, created_at
    FROM relation_events
    WHERE relation_id = ${ALICE_REL}
       OR relation_id = ${bobRelId}
    ORDER BY created_at
  `
  log('relation_events', events)

  step('audit_log rows')
  const auditRows = await sql`
    SELECT entity_type, entity_id, action, diff, created_at
    FROM audit_log
    WHERE entity_id = ${ORDER_ID}
       OR entity_id IN (
         SELECT id FROM order_change_actions WHERE order_id = ${ORDER_ID}
       )
       OR entity_id = ${ALICE_REL}
       OR entity_id = ${bobRelId}
    ORDER BY created_at
  `
  log('audit_log', auditRows)

  // ── Assertions ─────────────────────────────────────────────────────

  section('ASSERTIONS')

  const removalAction  = actions.find((a: any) => a.id === REMOVAL_ACTION_ID)
  const appointAction  = actions.find((a: any) => a.id === APPOINT_ACTION_ID)
  const auditActions   = auditRows.map((r: any) => r.action as string)
  const count          = (a: string) => auditActions.filter((x: string) => x === a).length

  // Order
  assert('Order status is COMPLETED',                           orderRow[0]?.status === 'COMPLETED')
  assert('Order completed_at is set',                           orderRow[0]?.completed_at != null)

  // Apply result
  assert('applyOrderChangeActionsForOrder returned applied=2',  applyResult.success && applyResult.data.applied === 2)

  // Change actions
  assert('DIRECTOR_REMOVAL status = APPLIED',                   removalAction?.status === 'APPLIED')
  assert('DIRECTOR_REMOVAL applied_at is set',                  removalAction?.applied_at != null)
  assert('DIRECTOR_REMOVAL resulting_relation_id = ALICE_REL',  removalAction?.resulting_relation_id === ALICE_REL)
  assert('DIRECTOR_APPOINTMENT status = APPLIED',               appointAction?.status === 'APPLIED')
  assert('DIRECTOR_APPOINTMENT applied_at is set',              appointAction?.applied_at != null)
  assert('DIRECTOR_APPOINTMENT resulting_relation_id is set',   appointAction?.resulting_relation_id != null)

  // Relations
  assert('Alice relation is_active = false',                    aliceRel[0]?.is_active === false)
  assert('Alice relation valid_to is set',                      aliceRel[0]?.valid_to != null)
  assert('Bob DIRECTOR relation exists (1 row)',                bobRel.length === 1)
  assert('Bob relation is_active = true',                       bobRel[0]?.is_active === true)

  // relation_events
  const terminatedEvents = events.filter((e: any) => e.event_type === 'TERMINATED')
  const createdEvents    = events.filter((e: any) => e.event_type === 'CREATED')
  assert('relation_events: exactly 1 TERMINATED',               terminatedEvents.length === 1)
  assert('relation_events: exactly 1 CREATED',                  createdEvents.length === 1)
  assert('TERMINATED event is for Alice relation',              terminatedEvents[0]?.relation_id === ALICE_REL)
  assert('CREATED event is for Bob relation',                   createdEvents[0]?.relation_id === bobRelId)
  assert('TERMINATED event triggered_by_order_id = ORDER_ID',  terminatedEvents[0]?.triggered_by_order_id === ORDER_ID)
  assert('CREATED event triggered_by_order_id = ORDER_ID',     createdEvents[0]?.triggered_by_order_id === ORDER_ID)

  // Audit log
  assert('audit_log: ORDER_CREATED x1',                         count('ORDER_CREATED') === 1)
  assert('audit_log: ORDER_STATUS_CHANGED x5',                  count('ORDER_STATUS_CHANGED') === 5)
  assert('audit_log: CHANGE_ACTION_CREATED x2',                 count('CHANGE_ACTION_CREATED') === 2)
  assert('audit_log: CHANGE_ACTION_APPLIED x2',                 count('CHANGE_ACTION_APPLIED') === 2)
  assert('audit_log: RELATION_TERMINATED x1',                   count('RELATION_TERMINATED') === 1)
  assert('audit_log: RELATION_CREATED x1',                      count('RELATION_CREATED') === 1)

  // Invalid transition
  assert('COMPLETED → EXECUTION rejected (success=false)',      badTransition.success === false)
  assert('Rejection error mentions allowed transitions',        typeof (badTransition as any).error === 'string')

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
