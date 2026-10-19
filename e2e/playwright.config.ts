import { tmpdir } from 'node:os'
import { defineConfig, devices } from '@playwright/test'

// A dedicated database: these specs truncate tables, so sharing one_academy_test
// would interfere with the API's own integration suite.
const DATABASE_URL = 'postgresql://one_academy:local_dev_only@localhost:5432/one_academy_e2e'

// The specs arrange state directly through @one/db, so the Playwright process
// needs the connection too — not just the API it launches. This config is
// loaded before any spec imports the client.
process.env.DATABASE_URL ??= DATABASE_URL
process.env.NODE_ENV ??= 'test'

// Shared by the API and the caching web server below, so the API's
// revalidation call is accepted (ADR 0018). Local to the e2e run.
const E2E_REVALIDATE_SECRET = 'e2e-revalidate-secret-at-least-32-characters'
// revalidation.spec.ts clears the cache itself before arranging data.
process.env.E2E_REVALIDATE_SECRET ??= E2E_REVALIDATE_SECRET

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    // 80-90% of real traffic is mobile, so the default viewport is a phone.
    ...devices['Pixel 7'],
  },
  webServer: [
    {
      // NODE_ENV=test is what makes the x-test-auth seam available, so the
      // moderation spec does not need live Clerk sessions.
      command: 'pnpm --filter @one/api dev',
      url: 'http://localhost:4100/health',
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      env: {
        DATABASE_URL,
        NODE_ENV: 'test',
        PORT: '4100',
        WEB_REVALIDATE_URL: 'http://localhost:3200/api/revalidate',
        // media.spec.ts uploads through the API; the fs driver serves them.
        STORAGE_DRIVER: 'fs',
        MEDIA_FS_ROOT: `${tmpdir()}/one-academy-media-e2e`,
        MEDIA_PUBLIC_BASE_URL: 'http://localhost:4100/media',
        REVALIDATE_SECRET: E2E_REVALIDATE_SECRET,
      },
    },
    {
      // Next reads PORT; the dev script deliberately hardcodes no port so the
      // e2e run can place it off the developer's usual 3000.
      command: 'pnpm --filter @one/web dev',
      url: 'http://localhost:3100',
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      env: {
        PORT: '3100',
        API_BASE_URL: 'http://localhost:4100',
        SITE_URL: 'http://localhost:3100',
        // Every spec seeds different data behind the same URLs, so any
        // response caching would make assertions depend on run order.
        API_CACHE_TTL: '0',
      },
    },
    {
      // The one server that caches like production, for revalidation.spec.ts:
      // with caching off, "the suspended page is gone on the next request"
      // would pass whether or not revalidation works. Its own build directory
      // lets it run beside the server above.
      command: 'pnpm --filter @one/web dev',
      url: 'http://localhost:3200',
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      env: {
        PORT: '3200',
        API_BASE_URL: 'http://localhost:4100',
        SITE_URL: 'http://localhost:3200',
        API_CACHE_TTL: '300',
        NEXT_DIST_DIR: '.next-e2e-cached',
        REVALIDATE_SECRET: E2E_REVALIDATE_SECRET,
      },
    },
  ],
})
