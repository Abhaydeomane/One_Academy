import { z } from 'zod'

// Clerk keys are optional so the API boots for public-route development and
// tests before Clerk is configured. The auth middleware fails loudly if a
// protected route is hit without them.
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    DATABASE_URL: z.string().min(1),
    CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
    CLERK_SECRET_KEY: z.string().min(1).optional(),
    CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),
    CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
    // The web app's revalidation endpoint and its shared secret (ADR 0018).
    // Optional: without them public pages refresh on their 300-second TTL.
    WEB_REVALIDATE_URL: z.url().optional(),
    REVALIDATE_SECRET: z.string().min(32).optional(),
  })
  .refine((env) => !env.WEB_REVALIDATE_URL === !env.REVALIDATE_SECRET, {
    error: 'WEB_REVALIDATE_URL and REVALIDATE_SECRET must be set together',
    path: ['REVALIDATE_SECRET'],
  })

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  throw new Error(
    `Invalid environment: ${JSON.stringify(z.flattenError(parsed.error).fieldErrors)}`,
  )
}

export const config = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  databaseUrl: parsed.data.DATABASE_URL,
  clerkPublishableKey: parsed.data.CLERK_PUBLISHABLE_KEY,
  clerkSecretKey: parsed.data.CLERK_SECRET_KEY,
  clerkWebhookSecret: parsed.data.CLERK_WEBHOOK_SECRET,
  webRevalidateUrl: parsed.data.WEB_REVALIDATE_URL,
  revalidateSecret: parsed.data.REVALIDATE_SECRET,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((value) => value.trim()),
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  isDevelopment: parsed.data.NODE_ENV === 'development',
} as const
