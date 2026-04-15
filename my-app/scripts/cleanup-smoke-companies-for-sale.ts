/**
 * Cleanup script — removes leftover companies_for_sale rows for smoke test fixtures.
 * Run before re-running the smoke test when prior runs left data behind.
 * Run: DATABASE_URL=... npx tsx scripts/cleanup-smoke-companies-for-sale.ts
 */

import postgres from 'postgres'

const SHELF_A_ID = 'bbf1fef5-0172-4d2a-ae61-38a2570c476a'
const SHELF_B_ID = 'b4606907-4ecb-4869-9a52-786caffd52b3'

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) throw new Error('DATABASE_URL not set')

  const sql = postgres(DATABASE_URL)

  const rows = await sql`
    SELECT id, subject_id, status FROM companies_for_sale
    WHERE subject_id IN (${SHELF_A_ID}, ${SHELF_B_ID})
  `
  console.log('Found rows:', JSON.stringify(rows, null, 2))

  if (rows.length === 0) {
    console.log('Nothing to clean up.')
    await sql.end()
    return
  }

  const ids = rows.map((r: any) => r.id as string)

  // Delete audit_log entries first (FK references entity_id by convention, not a real FK)
  for (const id of ids) {
    const deleted = await sql`DELETE FROM audit_log WHERE entity_id = ${id}`
    console.log(`Deleted audit_log rows for ${id}:`, deleted.count)
  }

  const deleted = await sql`
    DELETE FROM companies_for_sale
    WHERE subject_id IN (${SHELF_A_ID}, ${SHELF_B_ID})
    RETURNING id, subject_id, status
  `
  console.log('Deleted companies_for_sale rows:', JSON.stringify(deleted, null, 2))

  await sql.end()
  console.log('Done.')
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
