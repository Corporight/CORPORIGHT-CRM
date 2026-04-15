/**
 * Smoke test — Finance module (Phase 1)
 * Run: DATABASE_URL=... npx tsx scripts/smoke-finance.ts
 *
 * Scenarios:
 *   1. Order lifecycle: UNPAID → PARTIALLY_PAID → PAID
 *   2. OVERPAID order (second allocation exceeds order total)
 *   3. Expense movement affecting getOrderEconomics actual profit
 *   4. Allocation cancellation: status reverts, payment group recalculates
 *   5. Guard: allocation exceeding payment group total is rejected
 *   6. Guard: allocation against non-INCOME payment group is rejected
 */

import postgres from 'postgres'

// ── Stable fixture IDs ─────────────────────────────────────────────
const CLIENT_ID  = 'df4c2a11-1111-4000-a000-000000000001'
const ORDER_ID   = 'df4c2a11-2222-4000-a000-000000000002'

// ── Helpers ───────────────────────────────────────────────────────

function section(title: string) {
  console.log('\n' + '═'.repeat(60))
  console.log(`  ${title}`)
  console.log('═'.repeat(60))
}

function step(label: string) { console.log(`\n── ${label}`) }
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

  const {
    createCenter,
    createFinancialTreeCategory,
    createFinancialTreeType,
    createFinancialTreeDetail,
    createPaymentGroup,
    createFinancialMovement,
    createPaymentAllocation,
    cancelPaymentAllocation,
    listAllocationsForOrder,
    getOrderPaymentStatus,
    getOrderEconomics,
  } = await import('../src/lib/finance/actions.js')

  // ── Step 0: Clean up + Prerequisites ──────────────────────────────

  section('STEP 0 — Clean up + Prerequisites')

  // Clean up any leftover finance rows from previous runs.
  await sql`DELETE FROM payment_allocations WHERE order_id = ${ORDER_ID}`
  await sql`DELETE FROM financial_movements WHERE order_id = ${ORDER_ID}`
  await sql`DELETE FROM payment_groups WHERE bank_reference = 'SMOKE-TEST-PG'`
  await sql`DELETE FROM order_items WHERE order_id = ${ORDER_ID}`
  await sql`DELETE FROM orders WHERE id = ${ORDER_ID}`
  await sql`DELETE FROM subjects WHERE id = ${CLIENT_ID}`
  console.log('  cleaned up prior rows')

  // Insert client subject.
  await sql`
    INSERT INTO subjects (id, type, display_name, is_active)
    VALUES (${CLIENT_ID}, 'PERSON', 'Finance Test Client', true)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true
  `
  console.log('  client subject ready')

  // Insert order directly (bypassing action to avoid AML).
  await sql`
    INSERT INTO orders (id, number, order_type, status, client_subject_id)
    VALUES (${ORDER_ID}, 'ORD-SMOKE-FIN-001', 'OTHER', 'CONCEPT', ${CLIENT_ID})
    ON CONFLICT (id) DO NOTHING
  `

  // Insert two order items totalling 10000.00.
  await sql`
    INSERT INTO order_items (order_id, item_type, description, quantity, unit_price, total_price)
    VALUES
      (${ORDER_ID}, 'SERVICE', 'Company formation fee',   1, '8000.00', '8000.00'),
      (${ORDER_ID}, 'SERVICE', 'Registered address year', 1, '2000.00', '2000.00')
  `
  console.log('  order + items ready (total: 10000.00)')

  // ── Step 1: Create financial tree ──────────────────────────────────

  section('STEP 1 — Create financial tree (center + category + type + detail)')

  const centerResult = await createCenter({
    code: 'SMOKE-MAIN',
    name: 'Smoke Test Main Center',
    vatMode: 'NO_VAT',
  })
  log('createCenter', centerResult)
  if (!centerResult.success) { console.error('FATAL', centerResult.error); process.exit(1) }
  const CENTER_ID = centerResult.data.id

  const catResult = await createFinancialTreeCategory({
    code: 'SMOKE-INCOME',
    name: 'Smoke Income',
    direction: 'INCOME',
  })
  log('createFinancialTreeCategory (INCOME)', catResult)
  if (!catResult.success) { console.error('FATAL', catResult.error); process.exit(1) }
  const CAT_INCOME_ID = catResult.data.id

  const catExpResult = await createFinancialTreeCategory({
    code: 'SMOKE-EXPENSE',
    name: 'Smoke Expense',
    direction: 'EXPENSE',
  })
  log('createFinancialTreeCategory (EXPENSE)', catExpResult)
  if (!catExpResult.success) { console.error('FATAL', catExpResult.error); process.exit(1) }
  const CAT_EXPENSE_ID = catExpResult.data.id

  const typeResult = await createFinancialTreeType({
    code: 'SMOKE-SVC-INCOME',
    name: 'Smoke Service Income',
    categoryId: CAT_INCOME_ID,
  })
  log('createFinancialTreeType (INCOME)', typeResult)
  if (!typeResult.success) { console.error('FATAL', typeResult.error); process.exit(1) }
  const TYPE_INCOME_ID = typeResult.data.id

  const typeExpResult = await createFinancialTreeType({
    code: 'SMOKE-SVC-EXPENSE',
    name: 'Smoke Service Expense',
    categoryId: CAT_EXPENSE_ID,
  })
  log('createFinancialTreeType (EXPENSE)', typeExpResult)
  if (!typeExpResult.success) { console.error('FATAL', typeExpResult.error); process.exit(1) }
  const TYPE_EXPENSE_ID = typeExpResult.data.id

  const detailResult = await createFinancialTreeDetail({
    code: 'SMOKE-DETAIL-INCOME',
    name: 'Smoke Detail Income',
    typeId: TYPE_INCOME_ID,
  })
  log('createFinancialTreeDetail (INCOME)', detailResult)
  if (!detailResult.success) { console.error('FATAL', detailResult.error); process.exit(1) }
  const DETAIL_INCOME_ID = detailResult.data.id

  const detailExpResult = await createFinancialTreeDetail({
    code: 'SMOKE-DETAIL-EXPENSE',
    name: 'Smoke Detail Expense',
    typeId: TYPE_EXPENSE_ID,
  })
  log('createFinancialTreeDetail (EXPENSE)', detailExpResult)
  if (!detailExpResult.success) { console.error('FATAL', detailExpResult.error); process.exit(1) }
  const DETAIL_EXPENSE_ID = detailExpResult.data.id

  // ── Step 2: Create payment groups ─────────────────────────────────

  section('STEP 2 — Create payment groups')

  const pgIncomeResult = await createPaymentGroup({
    centerId: CENTER_ID,
    direction: 'INCOME',
    totalAmount: '15000.00',
    transactionDate: '2026-04-15',
    bankReference: 'SMOKE-TEST-PG',
    note: 'Smoke test income group',
  })
  log('createPaymentGroup (INCOME)', pgIncomeResult)
  if (!pgIncomeResult.success) { console.error('FATAL', pgIncomeResult.error); process.exit(1) }
  const PG_INCOME_ID = pgIncomeResult.data.id

  const pgExpenseResult = await createPaymentGroup({
    centerId: CENTER_ID,
    direction: 'EXPENSE',
    totalAmount: '1000.00',
    transactionDate: '2026-04-15',
    bankReference: 'SMOKE-TEST-PG',
    note: 'Smoke test expense group',
  })
  log('createPaymentGroup (EXPENSE)', pgExpenseResult)
  if (!pgExpenseResult.success) { console.error('FATAL', pgExpenseResult.error); process.exit(1) }
  const PG_EXPENSE_ID = pgExpenseResult.data.id

  // ── Step 3: Order starts UNPAID ────────────────────────────────────

  section('STEP 3 — Verify order starts UNPAID')

  const statusUnpaid = await getOrderPaymentStatus(ORDER_ID)
  log('getOrderPaymentStatus (initial)', statusUnpaid)

  // ── Step 4: Partial allocation → PARTIALLY_PAID ───────────────────

  section('STEP 4 — Partial allocation → PARTIALLY_PAID')

  const alloc1Result = await createPaymentAllocation({
    paymentGroupId: PG_INCOME_ID,
    orderId: ORDER_ID,
    allocatedAmount: '6000.00',
    note: 'First partial payment',
  })
  log('createPaymentAllocation (6000)', alloc1Result)
  if (!alloc1Result.success) { console.error('FATAL', alloc1Result.error); process.exit(1) }
  const ALLOC_1_ID = alloc1Result.data.id

  const statusPartial = await getOrderPaymentStatus(ORDER_ID)
  log('getOrderPaymentStatus (after 6000)', statusPartial)

  // ── Step 5: Full allocation → PAID ────────────────────────────────

  section('STEP 5 — Second allocation → PAID')

  const alloc2Result = await createPaymentAllocation({
    paymentGroupId: PG_INCOME_ID,
    orderId: ORDER_ID,
    allocatedAmount: '4000.00',
    note: 'Second payment completes the order',
  })
  log('createPaymentAllocation (4000)', alloc2Result)
  if (!alloc2Result.success) { console.error('FATAL', alloc2Result.error); process.exit(1) }
  const ALLOC_2_ID = alloc2Result.data.id

  const statusPaid = await getOrderPaymentStatus(ORDER_ID)
  log('getOrderPaymentStatus (after 10000)', statusPaid)

  // ── Step 6: Extra allocation → OVERPAID ───────────────────────────

  section('STEP 6 — Extra allocation → OVERPAID')

  const alloc3Result = await createPaymentAllocation({
    paymentGroupId: PG_INCOME_ID,
    orderId: ORDER_ID,
    allocatedAmount: '500.00',
    note: 'Overpayment',
  })
  log('createPaymentAllocation (500 extra)', alloc3Result)
  if (!alloc3Result.success) { console.error('FATAL', alloc3Result.error); process.exit(1) }
  const ALLOC_3_ID = alloc3Result.data.id

  const statusOverpaid = await getOrderPaymentStatus(ORDER_ID)
  log('getOrderPaymentStatus (after 10500)', statusOverpaid)

  // ── Step 7: Expense movement → actual profit ───────────────────────

  section('STEP 7 — Expense movement → getOrderEconomics')

  const expMovResult = await createFinancialMovement({
    centerId: CENTER_ID,
    orderId: ORDER_ID,
    direction: 'EXPENSE',
    amountGross: '1200.00',
    amountNet: '1200.00',
    vatAmount: '0',
    vatMode: 'NO_VAT',
    categoryId: CAT_EXPENSE_ID,
    typeId: TYPE_EXPENSE_ID,
    detailId: DETAIL_EXPENSE_ID,
    description: 'State fee for company formation',
    movementDate: '2026-04-15',
  })
  log('createFinancialMovement (EXPENSE 1200)', expMovResult)
  if (!expMovResult.success) { console.error('FATAL', expMovResult.error); process.exit(1) }

  const economicsResult = await getOrderEconomics(ORDER_ID)
  log('getOrderEconomics', economicsResult)

  // ── Step 8: Cancel overpayment allocation → back to PAID ──────────

  section('STEP 8 — Cancel overpayment allocation → back to PAID')

  const cancelResult = await cancelPaymentAllocation({
    paymentAllocationId: ALLOC_3_ID,
  })
  log('cancelPaymentAllocation (alloc3)', cancelResult)
  if (!cancelResult.success) { console.error('FATAL', cancelResult.error); process.exit(1) }

  const statusAfterCancel = await getOrderPaymentStatus(ORDER_ID)
  log('getOrderPaymentStatus (after cancel)', statusAfterCancel)

  // ── Step 9: Cancel alloc2 → PARTIALLY_PAID ────────────────────────

  section('STEP 9 — Cancel second allocation → PARTIALLY_PAID')

  const cancel2Result = await cancelPaymentAllocation({
    paymentAllocationId: ALLOC_2_ID,
  })
  log('cancelPaymentAllocation (alloc2)', cancel2Result)
  if (!cancel2Result.success) { console.error('FATAL', cancel2Result.error); process.exit(1) }

  const statusPartialAgain = await getOrderPaymentStatus(ORDER_ID)
  log('getOrderPaymentStatus (after cancel2)', statusPartialAgain)

  // ── Step 10: Guard — allocation exceeds PG total ──────────────────

  section('STEP 10 — Guard: allocation exceeds payment group total')

  // PG_INCOME_ID has totalAmount=15000, current allocated=6000 (alloc1 remains ACTIVE).
  // Trying to allocate 9001 should exceed remaining capacity (9000).
  const overLimitResult = await createPaymentAllocation({
    paymentGroupId: PG_INCOME_ID,
    orderId: ORDER_ID,
    allocatedAmount: '9001.00',
  })
  log('Allocation over PG limit (expect failure)', overLimitResult)

  // ── Step 11: Guard — non-INCOME payment group ─────────────────────

  section('STEP 11 — Guard: allocation against EXPENSE payment group rejected')

  const nonIncomeAllocResult = await createPaymentAllocation({
    paymentGroupId: PG_EXPENSE_ID,
    orderId: ORDER_ID,
    allocatedAmount: '500.00',
  })
  log('Allocation on EXPENSE group (expect failure)', nonIncomeAllocResult)

  // ── DB Verification ────────────────────────────────────────────────

  section('DB VERIFICATION — payment_groups final state')
  const pgRows = await sql`SELECT id, direction, total_amount, allocated_amount, processing_status FROM payment_groups WHERE bank_reference = 'SMOKE-TEST-PG' ORDER BY created_at`
  log('payment_groups', pgRows)

  section('DB VERIFICATION — allocations for order')
  const allocRows = await sql`SELECT id, allocated_amount, status FROM payment_allocations WHERE order_id = ${ORDER_ID} ORDER BY created_at`
  log('payment_allocations', allocRows)

  section('DB VERIFICATION — audit_log for order (payment status changes)')
  const auditRows = await sql`SELECT action, diff, created_at FROM audit_log WHERE entity_id = ${ORDER_ID} AND action = 'ORDER_PAYMENT_STATUS_CHANGED' ORDER BY created_at`
  log('audit_log ORDER_PAYMENT_STATUS_CHANGED', auditRows)

  // ── Assertions ─────────────────────────────────────────────────────

  section('ASSERTIONS')

  // Initial state
  assert('Initial order status is UNPAID',
    statusUnpaid.success === true && (statusUnpaid as any).data.status === 'UNPAID')
  assert('Initial order total is 10000.00',
    statusUnpaid.success === true && (statusUnpaid as any).data.orderTotal === '10000.00')

  // After partial allocation (6000)
  assert('After 6000: status is PARTIALLY_PAID',
    statusPartial.success === true && (statusPartial as any).data.status === 'PARTIALLY_PAID')
  assert('After 6000: allocatedAmount is 6000.00',
    statusPartial.success === true && (statusPartial as any).data.allocatedAmount === '6000.00')

  // After full allocation (10000)
  assert('After 10000: status is PAID',
    statusPaid.success === true && (statusPaid as any).data.status === 'PAID')

  // After overpayment (10500)
  assert('After 10500: status is OVERPAID',
    statusOverpaid.success === true && (statusOverpaid as any).data.status === 'OVERPAID')

  // Expense + economics
  assert('getOrderEconomics succeeded', economicsResult.success === true)
  if (economicsResult.success) {
    assert('Economics: allocatedPayments = 10500.00',
      (economicsResult as any).data.allocatedPayments === '10500.00')
    assert('Economics: expenseTotal = 1200.00',
      (economicsResult as any).data.expenseTotal === '1200.00')
    assert('Economics: actualProfit = 9300.00',
      (economicsResult as any).data.actualProfit === '9300.00')
    assert('Economics: paymentStatus = OVERPAID',
      (economicsResult as any).data.paymentStatus === 'OVERPAID')
  }

  // After cancelling alloc3 (500)
  assert('After cancel overpayment: status is PAID',
    statusAfterCancel.success === true && (statusAfterCancel as any).data.status === 'PAID')

  // After cancelling alloc2 (4000)
  assert('After cancel alloc2: status is PARTIALLY_PAID',
    statusPartialAgain.success === true && (statusPartialAgain as any).data.status === 'PARTIALLY_PAID')

  // Double cancel guard
  const doubleCancel = await cancelPaymentAllocation({ paymentAllocationId: ALLOC_3_ID })
  assert('Double cancel rejected (success=false)', doubleCancel.success === false)
  assert('Double cancel error mentions CANCELLED',
    typeof (doubleCancel as any).error === 'string' &&
    (doubleCancel as any).error.includes('CANCELLED'))

  // Guard: over-limit
  assert('Over-limit allocation rejected', overLimitResult.success === false)
  assert('Over-limit error mentions capacity or exceed',
    typeof (overLimitResult as any).error === 'string' &&
    ((overLimitResult as any).error.includes('exceed') ||
     (overLimitResult as any).error.includes('capacity')))

  // Guard: non-INCOME
  assert('Non-INCOME allocation rejected', nonIncomeAllocResult.success === false)
  assert('Non-INCOME error mentions direction or INCOME',
    typeof (nonIncomeAllocResult as any).error === 'string' &&
    (nonIncomeAllocResult as any).error.includes('INCOME'))

  // Payment group state
  const incomeGroup = pgRows.find((r: any) => r.direction === 'INCOME')
  assert('PG INCOME: processing_status = PARTIALLY_ALLOCATED',
    incomeGroup?.processing_status === 'PARTIALLY_ALLOCATED')
  assert('PG INCOME: allocated_amount = 6000.00',
    incomeGroup?.allocated_amount === '6000.00')

  // Audit log: at least 3 ORDER_PAYMENT_STATUS_CHANGED entries
  assert('audit_log: ≥3 ORDER_PAYMENT_STATUS_CHANGED rows',
    auditRows.length >= 3)

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
