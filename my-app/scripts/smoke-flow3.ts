/**
 * Smoke test — Flow 3: Shelf Purchase (share transfer + director appointment)
 * Run: DATABASE_URL=... npx tsx scripts/smoke-flow3.ts
 */

import postgres from 'postgres'

// ── Stable test fixture IDs (RFC-compliant UUIDs) ─────────────────────
// Bob is reused from Flow 1.

const BOB_ID       = 'cbf21ca5-2192-4000-b263-f6c29a23558b' // buyer / acquirer (from Flow 1)
const CAROL_ID     = '524a3a41-db80-4cd1-9638-63ed47bd1c06' // existing shareholder
const SHELF_CO_ID  = '23599587-8a0b-4dd5-865a-3ac086749535' // shelf company
const CAROL_REL    = '893a003d-8728-4d67-a348-1e0c23ac147e' // Carol SHAREHOLDER relation
// COMPANY_FORMATION order — used only to verify that createOrderChangeAction rejects it
// (created fresh in the script)

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

  step('Upsert Bob (PERSON) — buyer / acquirer')
  await sql`
    INSERT INTO subjects (id, type, display_name, is_active)
    VALUES (${BOB_ID}, 'PERSON', 'Bob Kratky', true)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true
  `
  console.log('  done')

  step('Upsert Carol (PERSON) — existing shareholder')
  await sql`
    INSERT INTO subjects (id, type, display_name, is_active)
    VALUES (${CAROL_ID}, 'PERSON', 'Carol Dostal', true)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true
  `
  console.log('  done')

  step('Upsert Shelf Co s.r.o. (COMPANY)')
  await sql`
    INSERT INTO subjects (id, type, display_name, is_active)
    VALUES (${SHELF_CO_ID}, 'COMPANY', 'Shelf Co s.r.o.', true)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true
  `
  console.log('  done')

  step('Upsert Carol SHAREHOLDER relation for Shelf Co')
  await sql`
    INSERT INTO relations (id, subject_a_id, subject_b_id, relation_type, is_active, valid_from)
    VALUES (${CAROL_REL}, ${CAROL_ID}, ${SHELF_CO_ID}, 'SHAREHOLDER', true, now())
    ON CONFLICT (id) DO UPDATE SET is_active = true, valid_to = NULL, updated_at = now()
  `
  console.log('  done')

  step('Upsert AML record for Bob (kyc_status=COMPLETED — required for DOCUMENT_PREPARATION gate)')
  await sql`
    INSERT INTO aml_records (subject_id, kyc_status, risk_level, verified_at)
    VALUES (${BOB_ID}, 'COMPLETED', 'LOW', now())
    ON CONFLICT (subject_id) DO UPDATE SET kyc_status = 'COMPLETED', updated_at = now()
  `
  console.log('  done')

  // ── Step 1: Create SHELF_PURCHASE order ───────────────────────────

  section('STEP 1 — createOrder (SHELF_PURCHASE, clientSubjectId = Bob)')

  const orderResult = await createOrder({
    orderType: 'SHELF_PURCHASE',
    clientSubjectId: BOB_ID,
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

  step('SHARE_TRANSFER (Carol → Bob, 100%)')
  const transferResult = await createOrderChangeAction({
    orderId: ORDER_ID,
    actionType: 'SHARE_TRANSFER',
    targetSubjectId: SHELF_CO_ID,
    oldValue: { subjectId: CAROL_ID, sharePercentage: '100.00' },
    newValue: { subjectId: BOB_ID,   sharePercentage: '100.00' },
  })
  log('SHARE_TRANSFER result', transferResult)

  if (!transferResult.success) {
    console.error('FATAL:', transferResult.error)
    process.exit(1)
  }
  const TRANSFER_ACTION_ID = transferResult.data.id

  step('DIRECTOR_APPOINTMENT (Bob as director of Shelf Co)')
  const appointResult = await createOrderChangeAction({
    orderId: ORDER_ID,
    actionType: 'DIRECTOR_APPOINTMENT',
    targetSubjectId: SHELF_CO_ID,
    newValue: { subjectId: BOB_ID },
  })
  log('DIRECTOR_APPOINTMENT result', appointResult)

  if (!appointResult.success) {
    console.error('FATAL:', appointResult.error)
    process.exit(1)
  }
  const APPOINT_ACTION_ID = appointResult.data.id

  // ── Step 3: Guard — COMPANY_FORMATION rejects change actions ──────

  section('STEP 3 — Guard: COMPANY_FORMATION rejects createOrderChangeAction')

  step('Create a COMPANY_FORMATION order')
  const formationOrderResult = await createOrder({ orderType: 'COMPANY_FORMATION' })
  log('createOrder (COMPANY_FORMATION) result', formationOrderResult)

  if (!formationOrderResult.success) {
    console.error('FATAL: could not create COMPANY_FORMATION order:', formationOrderResult.error)
    process.exit(1)
  }
  const FORMATION_ORDER_ID = formationOrderResult.data.id

  step('Attempt createOrderChangeAction on COMPANY_FORMATION order (expect failure)')
  const rejectedAction = await createOrderChangeAction({
    orderId: FORMATION_ORDER_ID,
    actionType: 'OTHER',
    oldValue: { note: 'should be rejected' },
  })
  log('Result (expect success=false)', rejectedAction)

  // ── Step 4: Advance SHELF_PURCHASE to EXECUTION ───────────────────

  section('STEP 4 — Status transitions → EXECUTION')

  for (const newStatus of ['WAITING_FOR_PAYMENT', 'DOCUMENT_PREPARATION', 'WAITING_FOR_DOCUMENTS', 'EXECUTION'] as const) {
    const r = await updateOrderStatus({ orderId: ORDER_ID, newStatus })
    log(`  → ${newStatus}`, r)
    if (!r.success) {
      console.error(`FATAL: transition to ${newStatus} failed:`, r.error)
      process.exit(1)
    }
  }

  // ── Step 5: Apply all actions ──────────────────────────────────────

  section('STEP 5 — applyOrderChangeActionsForOrder')

  const applyResult = await applyOrderChangeActionsForOrder({ orderId: ORDER_ID })
  log('applyOrderChangeActionsForOrder result', applyResult)

  if (!applyResult.success) {
    console.error('FATAL: apply failed:', applyResult.error)
    process.exit(1)
  }

  // ── Step 6: Complete order ─────────────────────────────────────────

  section('STEP 6 — updateOrderStatus → COMPLETED')

  const completeResult = await updateOrderStatus({ orderId: ORDER_ID, newStatus: 'COMPLETED' })
  log('COMPLETED result', completeResult)

  if (!completeResult.success) {
    console.error('FATAL:', completeResult.error)
    process.exit(1)
  }

  // ── Step 7: Guard — pending actions block COMPLETED (fresh order) ──

  section('STEP 7 — Guard: pending actions block COMPLETED (fresh COMPANY_CHANGE order)')

  step('Create fresh COMPANY_CHANGE order for guard test')
  const acmeId = '652c8fed-a3c9-437a-867a-a8287de459fd' // Acme from Flow 1
  const guardOrderResult = await createOrder({
    orderType: 'COMPANY_CHANGE',
    clientSubjectId: acmeId,
  })
  log('createOrder (guard order) result', guardOrderResult)

  if (!guardOrderResult.success) {
    console.error('FATAL:', guardOrderResult.error)
    process.exit(1)
  }
  const GUARD_ORDER_ID = guardOrderResult.data.id

  step('Add a PENDING OTHER action (intentionally left unapplied)')
  const pendingActionResult = await createOrderChangeAction({
    orderId: GUARD_ORDER_ID,
    actionType: 'OTHER',
    oldValue: { note: 'intentionally left pending' },
  })
  log('Pending action result', pendingActionResult)

  if (!pendingActionResult.success) {
    console.error('FATAL:', pendingActionResult.error)
    process.exit(1)
  }

  step('Advance guard order to EXECUTION')
  for (const newStatus of ['WAITING_FOR_PAYMENT', 'DOCUMENT_PREPARATION', 'WAITING_FOR_DOCUMENTS', 'EXECUTION'] as const) {
    const r = await updateOrderStatus({ orderId: GUARD_ORDER_ID, newStatus })
    if (!r.success) {
      console.error(`FATAL: guard order transition to ${newStatus} failed:`, r.error)
      process.exit(1)
    }
  }
  console.log('  guard order is now EXECUTION')

  step('Attempt COMPLETED with pending action (expect failure)')
  const blockedComplete = await updateOrderStatus({ orderId: GUARD_ORDER_ID, newStatus: 'COMPLETED' })
  log('Result (expect success=false)', blockedComplete)

  // ── DB Verification ────────────────────────────────────────────────

  section('DB VERIFICATION')

  step('orders — SHELF_PURCHASE order')
  const orderRow = await sql`
    SELECT id, number, order_type, status, client_subject_id, completed_at
    FROM orders WHERE id = ${ORDER_ID}
  `
  log('orders', orderRow)

  step('order_change_actions — SHELF_PURCHASE order')
  const actions = await sql`
    SELECT id, action_type, status, applied_at, resulting_relation_id
    FROM order_change_actions
    WHERE order_id = ${ORDER_ID}
    ORDER BY created_at
  `
  log('order_change_actions', actions)

  step('Carol SHAREHOLDER relation (should be inactive)')
  const carolRel = await sql`
    SELECT id, subject_a_id, subject_b_id, relation_type, is_active, valid_from, valid_to
    FROM relations WHERE id = ${CAROL_REL}
  `
  log('Carol relation', carolRel)

  step('Bob SHAREHOLDER relation (should be active)')
  const bobShareholderRel = await sql`
    SELECT id, subject_a_id, subject_b_id, relation_type, is_active, valid_from, valid_to
    FROM relations
    WHERE subject_a_id = ${BOB_ID}
      AND subject_b_id = ${SHELF_CO_ID}
      AND relation_type = 'SHAREHOLDER'
  `
  log('Bob SHAREHOLDER relation', bobShareholderRel)

  step('Bob DIRECTOR relation (should be active)')
  const bobDirectorRel = await sql`
    SELECT id, subject_a_id, subject_b_id, relation_type, is_active, valid_from, valid_to
    FROM relations
    WHERE subject_a_id = ${BOB_ID}
      AND subject_b_id = ${SHELF_CO_ID}
      AND relation_type = 'DIRECTOR'
  `
  log('Bob DIRECTOR relation', bobDirectorRel)

  const bobShareRelId: string = bobShareholderRel[0]?.id ?? 'none'
  const bobDirRelId:   string = bobDirectorRel[0]?.id   ?? 'none'

  step('relation_attributes for Bob SHAREHOLDER relation')
  const attrs = await sql`
    SELECT relation_id, key, value
    FROM relation_attributes
    WHERE relation_id = ${bobShareRelId}
  `
  log('relation_attributes', attrs)

  step('relation_events for these three relations')
  const events = await sql`
    SELECT id, relation_id, event_type, triggered_by_order_id, created_at
    FROM relation_events
    WHERE relation_id = ANY(ARRAY[${CAROL_REL}, ${bobShareRelId}, ${bobDirRelId}]::uuid[])
    ORDER BY created_at
  `
  log('relation_events', events)

  step('audit_log for SHELF_PURCHASE order and its relations')
  const auditRows = await sql`
    SELECT entity_type, entity_id, action, diff, created_at
    FROM audit_log
    WHERE entity_id = ${ORDER_ID}
       OR entity_id IN (
         SELECT id FROM order_change_actions WHERE order_id = ${ORDER_ID}
       )
       OR entity_id = ANY(ARRAY[${CAROL_REL}, ${bobShareRelId}, ${bobDirRelId}]::uuid[])
    ORDER BY created_at
  `
  log('audit_log', auditRows)

  // ── Assertions ─────────────────────────────────────────────────────

  section('ASSERTIONS')

  const transferAction = actions.find((a: any) => a.id === TRANSFER_ACTION_ID)
  const appointAction  = actions.find((a: any) => a.id === APPOINT_ACTION_ID)
  const auditActions   = auditRows.map((r: any) => r.action as string)
  const count          = (a: string) => auditActions.filter((x: string) => x === a).length

  // Order
  assert('Order status is COMPLETED',                               orderRow[0]?.status === 'COMPLETED')
  assert('Order completed_at is set',                               orderRow[0]?.completed_at != null)
  assert('Order client_subject_id = BOB (buyer)',                   orderRow[0]?.client_subject_id === BOB_ID)

  // Apply result
  assert('applyOrderChangeActionsForOrder returned applied=2',      applyResult.success && applyResult.data.applied === 2)

  // Change actions
  assert('SHARE_TRANSFER status = APPLIED',                         transferAction?.status === 'APPLIED')
  assert('SHARE_TRANSFER applied_at is set',                        transferAction?.applied_at != null)
  assert('SHARE_TRANSFER resulting_relation_id is set',             transferAction?.resulting_relation_id != null)
  assert('DIRECTOR_APPOINTMENT status = APPLIED',                   appointAction?.status === 'APPLIED')
  assert('DIRECTOR_APPOINTMENT applied_at is set',                  appointAction?.applied_at != null)
  assert('DIRECTOR_APPOINTMENT resulting_relation_id = bobDirRelId',appointAction?.resulting_relation_id === bobDirRelId)

  // Relations
  assert('Carol SHAREHOLDER is_active = false',                     carolRel[0]?.is_active === false)
  assert('Carol SHAREHOLDER valid_to is set',                       carolRel[0]?.valid_to != null)
  assert('Bob SHAREHOLDER relation exists (1 row)',                 bobShareholderRel.length === 1)
  assert('Bob SHAREHOLDER is_active = true',                        bobShareholderRel[0]?.is_active === true)
  assert('Bob DIRECTOR relation exists (1 row)',                    bobDirectorRel.length === 1)
  assert('Bob DIRECTOR is_active = true',                           bobDirectorRel[0]?.is_active === true)

  // relation_attributes
  assert('relation_attributes: 1 row for Bob SHAREHOLDER',         attrs.length === 1)
  assert('relation_attributes: key = share_percentage',            attrs[0]?.key === 'share_percentage')
  assert('relation_attributes: value = 100.00',                    attrs[0]?.value === '100.00')

  // relation_events
  const terminatedEvents = events.filter((e: any) => e.event_type === 'TERMINATED')
  const createdEvents    = events.filter((e: any) => e.event_type === 'CREATED')
  assert('relation_events: exactly 1 TERMINATED (Carol)',          terminatedEvents.length === 1)
  assert('relation_events: exactly 2 CREATED (Bob SH + Bob DIR)',  createdEvents.length === 2)
  assert('TERMINATED event is for Carol relation',                 terminatedEvents[0]?.relation_id === CAROL_REL)
  assert('TERMINATED triggered_by_order_id = ORDER_ID',           terminatedEvents[0]?.triggered_by_order_id === ORDER_ID)
  const createdRelIds = createdEvents.map((e: any) => e.relation_id)
  assert('CREATED events cover Bob SHAREHOLDER relation',          createdRelIds.includes(bobShareRelId))
  assert('CREATED events cover Bob DIRECTOR relation',             createdRelIds.includes(bobDirRelId))
  assert('All CREATED events triggered_by_order_id = ORDER_ID',
    createdEvents.every((e: any) => e.triggered_by_order_id === ORDER_ID))

  // Audit log
  assert('audit_log: ORDER_CREATED x1',                            count('ORDER_CREATED') === 1)
  assert('audit_log: ORDER_STATUS_CHANGED x5',                     count('ORDER_STATUS_CHANGED') === 5)
  assert('audit_log: CHANGE_ACTION_CREATED x2',                    count('CHANGE_ACTION_CREATED') === 2)
  assert('audit_log: CHANGE_ACTION_APPLIED x2',                    count('CHANGE_ACTION_APPLIED') === 2)
  assert('audit_log: RELATION_TERMINATED x1',                      count('RELATION_TERMINATED') === 1)
  assert('audit_log: RELATION_CREATED x2',                         count('RELATION_CREATED') === 2)

  // Guard: COMPANY_FORMATION rejects change actions
  assert('COMPANY_FORMATION rejects createOrderChangeAction (success=false)',
    rejectedAction.success === false)
  assert('Rejection error mentions COMPANY_CHANGE and SHELF_PURCHASE',
    typeof (rejectedAction as any).error === 'string' &&
    (rejectedAction as any).error.includes('COMPANY_CHANGE') &&
    (rejectedAction as any).error.includes('SHELF_PURCHASE'))

  // Guard: pending actions block COMPLETED
  assert('Pending action blocks COMPLETED (success=false)',        blockedComplete.success === false)
  assert('Blocking error mentions PENDING',
    typeof (blockedComplete as any).error === 'string' &&
    (blockedComplete as any).error.includes('PENDING'))

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
