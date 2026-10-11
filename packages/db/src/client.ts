import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/client/index.js'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example and set it before starting.')
}

// Reuse one client across hot reloads; a fresh client per reload exhausts the
// connection pool in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createClient(): PrismaClient {
  // Prisma 7 requires a driver adapter for a direct database connection.
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
