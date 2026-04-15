/**
 * Smoke test — CompaniesForSale module
 * Run: DATABASE_URL=... npx tsx scripts/smoke-companies-for-sale.ts
 */

import postgres from 'postgres'

// ── Stable test fixture IDs ────────────────────────────────────────
const BUYER_ID    = 'cbf21ca5-2192-4000-b263-f6c29a23558b' // Bob (from Flow 1/3)
const ACME_AML    = '652c8fed-a3c9-437a-867a-a8287de459fd' // Acme (AML already set from Flow 1)
const SHELF_A_ID  = 'bbf1fef5-0172-4d2a-ae61-38a2570c476a' // new shelf company subject
const SHELF_B_ID  = 'b4606907-4ecb-4869-9a52-786caffd52b3' // second shelf company (duplicate test)

// ── Helpers ───────────────────────────────────────────────────────

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

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) throw new Error('DATABASE_URL not set')
  process.env.DATABASE_URL = DATABASE_URL

  const sql = postgres(DATABASE_URL)

  const { createOrder } = await import('../src/lib/orders/actions.js')
  const {
    createCompanyForSale,
    reserveCompanyForSale,
    releaseCompanyForSaleReservation,
    markCompanyForSaleSold,
    withdrawCompanyForSale,
    getCompanyForSale,
  } = await import('../src/lib/companies-for-sale/actions.js')

  // ── Step 0: Prerequisites ─────────────────────────────────────────

  section('STEP 0 — Prerequisites')

  step('Upsert Shelf Company A (COMPANY subject)')
  await sql`
    INSERT INTO subjects (id, type, display_name, is_active)
    VALUES (${SHELF_A_ID}, 'COMPANY', 'Shelf Company A s.r.o.', true)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true
  `
  console.log('  done — SHELF_A_ID:', SHELF_A_ID)

  step('Upsert Shelf Company B (COMPANY subject, for duplicate-listing test)')
  await sql`
    INSERT INTO subjects (id, type, display_name, is_active)
    VALUES (${SHELF_B_ID}, 'COMPANY', 'Shelf Company B s.r.o.', true)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true
  `
  console.log('  done — SHELF_B_ID:', SHELF_B_ID)

  step('Ensure buyer (Bob) exists and has COMPLETED AML')
  await sql`
    INSERT INTO subjects (id, type, display_name, is_active)
    VALUES (${BUYER_ID}, 'PERSON', 'Bob Kratky', true)
    ON CONFLICT (id) DO UPDATE SET is_active = true
  `
  await sql`
    INSERT INTO aml_records (subject_id, kyc_status, risk_level, verified_at)
    VALUES (${BUYER_ID}, 'COMPLETED', 'LOW', now())
    ON CONFLICT (subject_id) DO UPDATE SET kyc_status = 'COMPLETED', updated_at = now()
  `
  console.log('  done')

  // ── Step 1: createCompanyForSale ──────────────────────────────────

  section('STEP 1 — createCompanyForSale')

  const createResult = await createCompanyForSale({
    subjectId: SHELF_A_ID,
    sourceType: 'INTERNAL',
    basePrice: '9900.00',
    currentPrice: '9900.00',
    note: 'Clean 2023 s.r.o., no history',
  })
  log('createCompanyForSale result', createResult)

  if (!createResult.success) {
    console.error('FATAL:', createResult.error)
    process.exit(1)
  }
  const CFS_ID = createResult.data.id
  console.log('  CFS_ID:', CFS_ID)

  step('Verify row after create')
  let cfsRow = await sql`SELECT * FROM companies_for_sale WHERE id = ${CFS_ID}`
  log('companies_for_sale', cfsRow)

  step('Guard: duplicate listing for same subject must fail')
  const dupResult = await createCompanyForSale({
    subjectId: SHELF_A_ID,
    sourceType: 'INTERNAL',
    basePrice: '8000.00',
  })
  log('Duplicate listing result (expect failure)', dupResult)

  // ── Step 2: createOrder + reserveCompanyForSale ───────────────────

  section('STEP 2 — createOrder (SHELF_PURCHASE) then reserveCompanyForSale')

  step('Create SHELF_PURCHASE order')
  const orderResult = await createOrder({
    orderType: 'SHELF_PURCHASE',
    clientSubjectId: BUYER_ID,
    companyForSaleId: CFS_ID,
  })
  log('createOrder result', orderResult)

  if (!orderResult.success) {
    console.error('FATAL:', orderResult.error)
    process.exit(1)
  }
  const ORDER_ID = orderResult.data.id
  console.log('  ORDER_ID:', ORDER_ID)

  step('reserveCompanyForSale')
  const reserveResult = await reserveCompanyForSale({
    companyForSaleId: CFS_ID,
    orderId: ORDER_ID,
  })
  log('reserveCompanyForSale result', reserveResult)

  if (!reserveResult.success) {
    console.error('FATAL:', reserveResult.error)
    process.exit(1)
  }

  step('Verify row after reservation')
  const snapAfterReserve = await sql`SELECT * FROM companies_for_sale WHERE id = ${CFS_ID}`
  cfsRow = snapAfterReserve
  log('companies_for_sale', cfsRow)

  // ── Step 3: Prevent duplicate reservation ────────────────────────

  section('STEP 3 — Duplicate reservation must fail')

  step('Create a second SHELF_PURCHASE order')
  const order2Result = await createOrder({
    orderType: 'SHELF_PURCHASE',
    clientSubjectId: BUYER_ID,
  })
  if (!order2Result.success) {
    console.error('FATAL:', order2Result.error)
    process.exit(1)
  }
  const ORDER_2_ID = order2Result.data.id

  step('Attempt to reserve already-RESERVED company (expect failure)')
  const dupReserveResult = await reserveCompanyForSale({
    companyForSaleId: CFS_ID,
    orderId: ORDER_2_ID,
  })
  log('Duplicate reserve result (expect failure)', dupReserveResult)

  // ── Step 4: releaseCompanyForSaleReservation ──────────────────────

  section('STEP 4 — releaseCompanyForSaleReservation')

  const releaseResult = await releaseCompanyForSaleReservation({
    companyForSaleId: CFS_ID,
  })
  log('releaseCompanyForSaleReservation result', releaseResult)

  if (!releaseResult.success) {
    console.error('FATAL:', releaseResult.error)
    process.exit(1)
  }

  step('Verify row after release')
  const snapAfterRelease = await sql`SELECT * FROM companies_for_sale WHERE id = ${CFS_ID}`
  cfsRow = snapAfterRelease
  log('companies_for_sale', cfsRow)

  step('Guard: release on non-RESERVED must fail')
  const badReleaseResult = await releaseCompanyForSaleReservation({
    companyForSaleId: CFS_ID,
  })
  log('Release on FOR_SALE result (expect failure)', badReleaseResult)

  // ── Step 5: Reserve again ─────────────────────────────────────────

  section('STEP 5 — Reserve again (after release)')

  const reserve2Result = await reserveCompanyForSale({
    companyForSaleId: CFS_ID,
    orderId: ORDER_ID,
  })
  log('reserveCompanyForSale (second time) result', reserve2Result)

  if (!reserve2Result.success) {
    console.error('FATAL:', reserve2Result.error)
    process.exit(1)
  }

  step('Verify row after second reservation')
  const snapAfterReserve2 = await sql`SELECT * FROM companies_for_sale WHERE id = ${CFS_ID}`
  cfsRow = snapAfterReserve2
  log('companies_for_sale', cfsRow)

  // ── Step 6: markCompanyForSaleSold ────────────────────────────────

  section('STEP 6 — markCompanyForSaleSold')

  const soldResult = await markCompanyForSaleSold({
    companyForSaleId: CFS_ID,
  })
  log('markCompanyForSaleSold result', soldResult)

  if (!soldResult.success) {
    console.error('FATAL:', soldResult.error)
    process.exit(1)
  }

  step('Verify row after sold')
  cfsRow = await sql`SELECT * FROM companies_for_sale WHERE id = ${CFS_ID}`
  log('companies_for_sale', cfsRow)

  // ── Step 7: Invalid transitions from SOLD ────────────────────────

  section('STEP 7 — SOLD blocks all further transitions')

  step('reserve on SOLD (expect failure)')
  const reserveOnSold = await reserveCompanyForSale({
    companyForSaleId: CFS_ID,
    orderId: ORDER_2_ID,
  })
  log('Reserve on SOLD result (expect failure)', reserveOnSold)

  step('markSold again (expect failure)')
  const soldAgain = await markCompanyForSaleSold({ companyForSaleId: CFS_ID })
  log('markSold on SOLD result (expect failure)', soldAgain)

  step('withdraw on SOLD (expect failure)')
  const withdrawOnSold = await withdrawCompanyForSale({ companyForSaleId: CFS_ID })
  log('Withdraw on SOLD result (expect failure)', withdrawOnSold)

  step('release on SOLD (expect failure)')
  const releaseOnSold = await releaseCompanyForSaleReservation({ companyForSaleId: CFS_ID })
  log('Release on SOLD result (expect failure)', releaseOnSold)

  // ── Step 8: withdrawCompanyForSale (on a separate listing) ────────

  section('STEP 8 — withdrawCompanyForSale (from FOR_SALE)')

  step('Create a second listing for SHELF_B to test withdrawal')
  const cfsB = await createCompanyForSale({
    subjectId: SHELF_B_ID,
    sourceType: 'EXTERNAL',
    basePrice: '7500.00',
    note: 'Withdrawal test listing',
  })
  log('createCompanyForSale (B) result', cfsB)

  if (!cfsB.success) { console.error('FATAL:', cfsB.error); process.exit(1) }
  const CFS_B_ID = cfsB.data.id

  const withdrawResult = await withdrawCompanyForSale({
    companyForSaleId: CFS_B_ID,
    note: 'Owner changed mind',
  })
  log('withdrawCompanyForSale result', withdrawResult)

  if (!withdrawResult.success) { console.error('FATAL:', withdrawResult.error); process.exit(1) }

  step('Verify WITHDRAWN row')
  const cfsBRow = await sql`SELECT * FROM companies_for_sale WHERE id = ${CFS_B_ID}`
  log('companies_for_sale (B)', cfsBRow)

  step('Guard: new listing for SHELF_B after WITHDRAWN must succeed (terminal state frees subject)')
  const cfsB2 = await createCompanyForSale({
    subjectId: SHELF_B_ID,
    sourceType: 'INTERNAL',
    basePrice: '7500.00',
  })
  log('Re-list SHELF_B after WITHDRAWN result (expect success)', cfsB2)

  // ── DB Verification ────────────────────────────────────────────────

  section('DB VERIFICATION — audit_log for CFS_ID')

  const auditRows = await sql`
    SELECT entity_type, entity_id, action, diff, created_at
    FROM audit_log
    WHERE entity_id = ${CFS_ID}
    ORDER BY created_at
  `
  log('audit_log (CFS_A)', auditRows)

  section('DB VERIFICATION — audit_log for CFS_B_ID')

  const auditRowsB = await sql`
    SELECT entity_type, entity_id, action, diff, created_at
    FROM audit_log
    WHERE entity_id = ${CFS_B_ID}
    ORDER BY created_at
  `
  log('audit_log (CFS_B)', auditRowsB)

  section('DB VERIFICATION — final state of all companies_for_sale rows')

  const allRows = await sql`
    SELECT id, subject_id, status, source_type, base_price, current_price,
           reserved_by_order_id, reserved_at, sold_at, note, updated_at
    FROM companies_for_sale
    WHERE subject_id IN (${SHELF_A_ID}, ${SHELF_B_ID})
    ORDER BY created_at
  `
  log('all companies_for_sale rows', allRows)

  // ── Assertions ─────────────────────────────────────────────────────

  section('ASSERTIONS')

  // createCompanyForSale
  assert('createCompanyForSale succeeded',                createResult.success === true)

  // Initial row state
  const initialRow = await sql`SELECT * FROM companies_for_sale WHERE id = ${CFS_ID}`
  // (already fetched in verification)

  // Duplicate listing guard
  assert('Duplicate listing rejected (success=false)',    dupResult.success === false)
  assert('Duplicate error mentions "already has"',
    typeof (dupResult as any).error === 'string' &&
    (dupResult as any).error.includes('already has'))

  // reserveCompanyForSale
  assert('reserveCompanyForSale succeeded',               reserveResult.success === true)
  assert('After reserve: status = RESERVED',              snapAfterReserve[0]?.status === 'RESERVED')
  assert('After reserve: reserved_by_order_id = ORDER_ID', snapAfterReserve[0]?.reserved_by_order_id === ORDER_ID)
  assert('After reserve: reserved_at is set',             snapAfterReserve[0]?.reserved_at != null)

  // Duplicate reservation guard
  assert('Duplicate reserve rejected (success=false)',    dupReserveResult.success === false)
  assert('Duplicate reserve error mentions status',
    typeof (dupReserveResult as any).error === 'string' &&
    (dupReserveResult as any).error.includes('FOR_SALE'))

  // releaseCompanyForSaleReservation
  assert('releaseCompanyForSaleReservation succeeded',    releaseResult.success === true)
  assert('After release: status = FOR_SALE',              snapAfterRelease[0]?.status === 'FOR_SALE')
  assert('After release: reserved_by_order_id = null',   snapAfterRelease[0]?.reserved_by_order_id === null)
  assert('After release: reserved_at = null',            snapAfterRelease[0]?.reserved_at === null)

  // Release on non-RESERVED guard
  assert('Release on FOR_SALE rejected (success=false)',  badReleaseResult.success === false)
  assert('Bad release error mentions status',
    typeof (badReleaseResult as any).error === 'string' &&
    (badReleaseResult as any).error.includes('RESERVED'))

  // Reserve again
  assert('Second reservation succeeded',                  reserve2Result.success === true)
  assert('After re-reserve: status = RESERVED',           snapAfterReserve2[0]?.status === 'RESERVED')

  // markCompanyForSaleSold
  assert('markCompanyForSaleSold succeeded',              soldResult.success === true)
  const afterSold = await sql`SELECT * FROM companies_for_sale WHERE id = ${CFS_ID}`
  assert('After sold: status = SOLD',                     afterSold[0]?.status === 'SOLD')
  assert('After sold: sold_at is set',                    afterSold[0]?.sold_at != null)

  // SOLD blocks all transitions
  assert('reserve on SOLD rejected',                      reserveOnSold.success === false)
  assert('markSold on SOLD rejected',                     soldAgain.success === false)
  assert('withdraw on SOLD rejected',                     withdrawOnSold.success === false)
  assert('release on SOLD rejected',                      releaseOnSold.success === false)

  // withdrawCompanyForSale
  assert('withdrawCompanyForSale succeeded',              withdrawResult.success === true)
  assert('After withdraw: status = WITHDRAWN',            cfsBRow[0]?.status === 'WITHDRAWN')
  assert('After withdraw: reserved_by_order_id = null',  cfsBRow[0]?.reserved_by_order_id === null)
  assert('After withdraw: reserved_at = null',           cfsBRow[0]?.reserved_at === null)

  // Re-list after WITHDRAWN
  assert('Re-listing WITHDRAWN subject succeeds',         cfsB2.success === true)

  // Audit log
  const auditActions = auditRows.map((r: any) => r.action as string)
  const count = (a: string) => auditActions.filter((x: string) => x === a).length
  assert('audit_log: COMPANY_FOR_SALE_CREATED x1',           count('COMPANY_FOR_SALE_CREATED') === 1)
  assert('audit_log: COMPANY_FOR_SALE_RESERVED x2',          count('COMPANY_FOR_SALE_RESERVED') === 2)
  assert('audit_log: COMPANY_FOR_SALE_RESERVATION_RELEASED x1', count('COMPANY_FOR_SALE_RESERVATION_RELEASED') === 1)
  assert('audit_log: COMPANY_FOR_SALE_SOLD x1',              count('COMPANY_FOR_SALE_SOLD') === 1)

  const auditActionsB = auditRowsB.map((r: any) => r.action as string)
  const countB = (a: string) => auditActionsB.filter((x: string) => x === a).length
  assert('audit_log (B): COMPANY_FOR_SALE_CREATED x1',       countB('COMPANY_FOR_SALE_CREATED') === 1)
  assert('audit_log (B): COMPANY_FOR_SALE_WITHDRAWN x1',     countB('COMPANY_FOR_SALE_WITHDRAWN') === 1)

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
