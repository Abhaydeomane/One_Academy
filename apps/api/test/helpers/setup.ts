process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??=
  'postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test'

// A valid svix-format secret so webhook signature verification is exercised
// rather than skipped. Test-only; never a real credential.
process.env.CLERK_WEBHOOK_SECRET ??= 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'

// Media goes to a throwaway directory through the real fs driver (P2c).
process.env.STORAGE_DRIVER ??= 'fs'
process.env.MEDIA_FS_ROOT ??= `${(await import('node:os')).tmpdir()}/one-academy-media-test`
process.env.MEDIA_PUBLIC_BASE_URL ??= 'http://localhost:4000/media'
