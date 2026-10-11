process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??=
  'postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test'

// A valid svix-format secret so webhook signature verification is exercised
// rather than skipped. Test-only; never a real credential.
process.env.CLERK_WEBHOOK_SECRET ??= 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'
