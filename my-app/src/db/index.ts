import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

// Singleton pattern — prevents multiple connections during Next.js dev hot-reloads
const globalForDb = globalThis as unknown as { _pgClient: postgres.Sql | undefined }

const client = globalForDb._pgClient ?? postgres(process.env.DATABASE_URL)

if (process.env.NODE_ENV !== 'production') {
  globalForDb._pgClient = client
}

export const db = drizzle(client, { schema })
