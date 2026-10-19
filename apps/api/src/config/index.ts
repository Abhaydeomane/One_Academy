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
    // Media storage (ADR 0019): fs for local development and tests, s3 for
    // any S3-compatible provider once hosting is chosen.
    STORAGE_DRIVER: z.enum(['fs', 's3']).default('fs'),
    MEDIA_FS_ROOT: z.string().min(1).default('.media'),
    MEDIA_PUBLIC_BASE_URL: z.url().default('http://localhost:4000/media'),
    S3_ENDPOINT: z.url().optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).default('auto'),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  })
  .refine((env) => !env.WEB_REVALIDATE_URL === !env.REVALIDATE_SECRET, {
    error: 'WEB_REVALIDATE_URL and REVALIDATE_SECRET must be set together',
    path: ['REVALIDATE_SECRET'],
  })
  .refine(
    (env) =>
      env.STORAGE_DRIVER !== 's3' ||
      Boolean(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY),
    {
      error:
        'STORAGE_DRIVER=s3 needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
      path: ['STORAGE_DRIVER'],
    },
  )

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
  storage: {
    driver: parsed.data.STORAGE_DRIVER,
    fsRoot: parsed.data.MEDIA_FS_ROOT,
    publicBaseUrl: parsed.data.MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, ''),
    s3:
      parsed.data.S3_ENDPOINT &&
      parsed.data.S3_BUCKET &&
      parsed.data.S3_ACCESS_KEY_ID &&
      parsed.data.S3_SECRET_ACCESS_KEY
        ? {
            endpoint: parsed.data.S3_ENDPOINT,
            bucket: parsed.data.S3_BUCKET,
            region: parsed.data.S3_REGION,
            accessKeyId: parsed.data.S3_ACCESS_KEY_ID,
            secretAccessKey: parsed.data.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  },
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((value) => value.trim()),
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  isDevelopment: parsed.data.NODE_ENV === 'development',
} as const
