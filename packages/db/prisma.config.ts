import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, env } from 'prisma/config'

// Prisma 7 no longer loads .env automatically. Node's built-in loader covers it
// without adding a dotenv dependency. Variables already in the environment win,
// so CI and `DATABASE_URL=... pnpm ...` overrides still work.
const envFile = join(import.meta.dirname, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

// Prisma 7 removed `url` from the datasource block in schema.prisma. Migration
// and introspection commands read the connection string from here; the runtime
// client gets it through a driver adapter in src/client.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file=.env prisma/seed.ts',
  },
})
