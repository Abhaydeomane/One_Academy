import { describe, expect, it } from 'vitest'
import { envSchema } from './index.js'

const base = { DATABASE_URL: 'postgresql://x' }

describe('envSchema — media storage in production', () => {
  // The dev defaults would write files to a container's disk and publish
  // localhost URLs; a production deploy must choose explicitly.
  it('refuses production without STORAGE_DRIVER and MEDIA_PUBLIC_BASE_URL', () => {
    expect(envSchema.safeParse({ ...base, NODE_ENV: 'production' }).success).toBe(false)
    expect(
      envSchema.safeParse({ ...base, NODE_ENV: 'production', STORAGE_DRIVER: 'fs' }).success,
    ).toBe(false)
  })

  it('accepts production with both set', () => {
    expect(
      envSchema.safeParse({
        ...base,
        NODE_ENV: 'production',
        STORAGE_DRIVER: 'fs',
        MEDIA_PUBLIC_BASE_URL: 'https://media.example.com',
      }).success,
    ).toBe(true)
  })

  it('keeps the local defaults outside production', () => {
    const parsed = envSchema.parse({ ...base, NODE_ENV: 'development' })
    expect(parsed.STORAGE_DRIVER ?? 'fs').toBe('fs')
  })
})
