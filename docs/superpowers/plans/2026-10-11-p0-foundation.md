# One Academy P0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the One Academy monorepo foundation plus one end-to-end vertical slice — a public institute detail page, and a partner creating a batch that appears on it after admin publication.

**Architecture:** A pnpm + Turborepo monorepo with three deployable apps (`apps/web` public Next.js, `apps/partner` authenticated Next.js, `apps/api` Express) over shared packages (`packages/shared` Zod contracts, `packages/db` Prisma, `packages/ui`, `packages/config`). The API uses vertical-slice modules with strictly layered route → service → repository files, enforced by ESLint boundary rules rather than convention. A thin shared `Listing` core carries identity, location, media, reviews and enquiries, with typed per-vertical tables layered on top, so a second vertical is additive.

**Tech Stack:** pnpm 12.11.2, Turborepo 2.11.7, TypeScript 6.0.3, Next.js 16.4.0, React 19.3.0, Express 5.3.0, Prisma 7.10.0, Zod 4.6.5, Clerk, Vitest 5.0.3, Supertest 7.3.1, Tailwind CSS 4.3.3, Postgres 17.11, ESLint 10.12.0.

**Spec:** `docs/superpowers/specs/2026-10-11-one-academy-foundation-design.md`

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec and verified against the npm registry on 2026-10-11.

- **Exact version pins, never caret ranges.** Agents install what the catalog says; a floating range lets two sessions produce different lockfiles.
- **Prisma is pinned to `7.10.0`.** The npm `latest` tag for `prisma` points at `8.0.0-rc.22`, a release candidate. Never run bare `pnpm add prisma`.
- **TypeScript is pinned to `6.0.3`, not 7.** `typescript-eslint@8.71.1` declares `typescript: ">=4.8.4 <6.1.0"`. TypeScript 7 would disable typescript-eslint and with it the R1–R6 enforcement that is the backbone of this design.
- **Express 5 forwards async rejections to the error middleware automatically.** Never add an `asyncHandler` wrapper; Express 4 examples online will suggest one.
- **ESLint 10 is flat-config only.** No `.eslintrc*` file may exist anywhere in the repo.
- **Do not use corepack on this machine.** pnpm 12 ships `bin/pnpm.mjs`; corepack 0.32 hardcodes `.cjs`, and corepack 0.36 requires Node ≥22.22 while this machine runs 22.16. pnpm is installed globally via npm.
- **Node `>=22.16`**, `packageManager: "pnpm@12.11.2"` in the root manifest.
- **All workspaces are named under the `@one/` scope** and expose exactly five scripts: `dev`, `build`, `lint`, `typecheck`, `test`.
- **Monetary values are integer minor units (paise) with an explicit currency code.** Never a float.
- **All list endpoints are paginated** with `page`, `limit` (max 50), returning `{ items, total, page, limit }`.
- **Uniform error envelope:** `{ error: { code, message, details? } }`.
- **All routes are under `/api/v1`.**
- **The database is never mocked.** Integration tests run against real Postgres (`one_academy_test`).
- **Local Postgres connection strings:**
  - dev: `postgresql://one_academy:local_dev_only@localhost:5432/one_academy_dev`
  - test: `postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test`
- **Repo root** is the directory containing this plan. Its GitHub remote is `git@github.com:Abhaydeomane/One_Academy.git`.

### Architectural rules enforced by lint (R1–R6)

| # | Rule |
|---|---|
| R1 | Route files must not import Prisma or `@one/db` |
| R2 | Service files must not import `express` or reference `req`/`res` |
| R3 | Only `*.repository.ts` may import the Prisma client |
| R4 | Cross-module access goes through the other module's service — never its repository |
| R5 | Every route input is validated by a Zod schema from `@one/shared` |
| R6 | Errors are thrown as `AppError` subclasses; only `errorHandler` maps them to HTTP |

### Business rules (BR IDs referenced by tests)

| ID | Rule |
|---|---|
| BR-001 | A Listing transitions to PUBLISHED only by a global ADMIN |
| BR-002 | A PUBLISHED Listing's slug is immutable; a change creates a ListingRedirect |
| BR-003 | A Batch cannot be PUBLISHED with a `startDate` in the past |
| BR-004 | A Batch cannot be PUBLISHED unless its parent Listing is PUBLISHED |
| BR-005 | Monetary values are integer minor units with an explicit currency code |
| BR-006 | Reviews are PENDING until moderated *(schema only in P0, no endpoints)* |
| BR-007 | Enquiries are readable only by the owning Organization and global ADMINs |
| BR-008 | Comparison accepts 2–4 listings of the same vertical *(P1, not implemented here)* |
| BR-009 | Only PUBLISHED listings appear in public search or detail routes |
| BR-010 | `seatsAvailable` is always between 0 and `seatsTotal` inclusive |

---

## File Structure

Files that change together live together. Each API module owns its routes, service, repository and tests in one directory, so a change to one domain concept touches one folder.

### Root
| File | Responsibility |
|---|---|
| `package.json` | Tooling devDependencies, `packageManager`, root scripts delegating to Turborepo |
| `pnpm-workspace.yaml` | Workspace globs and the version catalog |
| `turbo.json` | Task graph and cache inputs/outputs |
| `.gitignore` | Node, Next, Prisma, env, coverage artifacts |
| `.npmrc` | pnpm strictness settings |
| `CLAUDE.md` | Root agent contract: commands, R1–R6, definition of done |
| `.husky/pre-commit`, `.husky/pre-push` | Local gates |
| `.github/workflows/ci.yml` | All CI jobs |

### `packages/config` — shared tooling config, no runtime code
| File | Responsibility |
|---|---|
| `tsconfig.base.json` | Compiler options shared by every workspace |
| `tsconfig.node.json`, `tsconfig.react.json` | Environment-specific overlays |
| `eslint/base.js` | JS/TS/prettier rules for all workspaces |
| `eslint/api.js` | Adds R1–R6 boundary enforcement |
| `eslint/next.js` | Adds Next.js and React rules |
| `prettier.json` | Formatting |

### `packages/db` — the only workspace that talks to Postgres
| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | Shared core + institute vertical models |
| `prisma/migrations/**` | Generated migration history |
| `prisma/seed.ts` | Deterministic development data |
| `src/client.ts` | Prisma client singleton export |
| `src/index.ts` | Public surface: client plus generated enums/types |

### `packages/shared` — the API contract, consumed by all three apps
| File | Responsibility |
|---|---|
| `src/errors.ts` | `ErrorCode` enum, error envelope type |
| `src/pagination.ts` | `paginationQuery`, `paginated()` response factory |
| `src/contracts/institutes.ts` | Public institute query/response schemas |
| `src/contracts/batches.ts` | Batch schemas, public and partner |
| `src/contracts/enquiries.ts` | Enquiry create schema |
| `src/contracts/partner.ts` | Partner listing/batch mutation schemas |
| `src/contracts/admin.ts` | Admin moderation schemas |
| `src/index.ts` | Barrel export |

### `apps/api` — Express
| File | Responsibility |
|---|---|
| `src/config/index.ts` | Zod-validated environment, typed config object |
| `src/lib/errors.ts` | `AppError` and subclasses |
| `src/lib/logger.ts` | pino instance |
| `src/middleware/requestId.ts` | Correlation id per request |
| `src/middleware/validate.ts` | Zod validation producing `req.valid` |
| `src/middleware/errorHandler.ts` | The only place mapping errors to HTTP |
| `src/middleware/auth.ts` | Clerk session → `req.auth`, role and org guards |
| `src/modules/listings/*` | Shared core: slug resolution, status filtering, redirects |
| `src/modules/institutes/*` | Public institute endpoints |
| `src/modules/batches/*` | Batch reads and partner mutations |
| `src/modules/enquiries/*` | Lead capture |
| `src/modules/accounts/*` | User/Org/Membership mirror and Clerk webhook |
| `src/server.ts` | App assembly only |
| `src/index.ts` | Process entry |
| `test/helpers/db.ts`, `test/helpers/app.ts` | Integration test harness |

### `apps/web` — public Next.js
| File | Responsibility |
|---|---|
| `src/lib/api.ts` | Typed fetch client that parses responses with shared schemas |
| `src/app/layout.tsx`, `src/app/page.tsx` | Shell and home |
| `src/app/institutes/page.tsx` | Listing index |
| `src/app/institutes/[slug]/page.tsx` | Detail, metadata, JSON-LD |
| `src/app/institutes/[slug]/EnquiryForm.tsx` | Client component for lead capture |
| `src/app/sitemap.ts` | Generated sitemap |

### `apps/partner` — authenticated Next.js
| File | Responsibility |
|---|---|
| `src/middleware.ts` | Clerk route protection |
| `src/lib/api.ts` | Server-side authenticated API client |
| `src/app/layout.tsx` | Shell with Clerk provider |
| `src/app/dashboard/page.tsx` | Owned listings |
| `src/app/dashboard/[listingId]/page.tsx` | Listing detail with batches |
| `src/app/dashboard/[listingId]/BatchForm.tsx` | Create/edit batch |

### `docs/`
| File | Responsibility |
|---|---|
| `README.md`, `architecture.md` | Entry map and system overview |
| `flows/*.md` | Living flow maps with code anchors |
| `domain/business-rules.md`, `domain/glossary.md` | Canonical BR table and vocabulary |
| `decisions/0001..0007-*.md` | ADRs |
| `runbooks/*.md` | Local setup, migrations, release |
| `work/requests/`, `work/bugs/`, `work/archive/` | Intake with templates |
| `api/openapi.json` | Generated |
| `scripts/check-docs-freshness.ts` | Drift detector (repo root `scripts/`) |

---

## Task Sequence

Phases are checkpoints, not separate plans. Backend is complete and independently reviewable after Task 15.

| Phase | Tasks | Deliverable |
|---|---|---|
| A — Tooling | 1–3 | `pnpm verify` green on a skeleton; boundary rules provably reject violations; CI runs |
| B — Data | 4–5 | Migrated schema and deterministic seed |
| C — Contract | 6–8 | Zod contracts and generated OpenAPI with a staleness gate |
| D — API | 9–15 | Every §9 endpoint implemented and integration-tested |
| E — Web | 16–18 | Public list, detail, SEO and enquiry capture |
| F — Partner | 19–20 | Authenticated batch management |
| G — Docs | 21 | Seeded docs system and freshness script |
| H — E2E | 22 | Two Playwright paths |

---

### Task 1: Workspace skeleton and tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`, `.gitignore`, `.prettierignore`
- Create: `packages/config/package.json`, `packages/config/prettier.json`, `packages/config/tsconfig.base.json`, `packages/config/tsconfig.node.json`, `packages/config/tsconfig.react.json`
- Create: `.husky/pre-commit`, `.husky/pre-push`
- Keep: `README.md` (already present)

**Interfaces:**
- Consumes: nothing.
- Produces: the `@one/config` workspace exposing `prettier.json`, `tsconfig.base.json`, `tsconfig.node.json`, `tsconfig.react.json` by subpath; root scripts `dev`, `build`, `lint`, `typecheck`, `test`, `verify`.

- [ ] **Step 1: Create the root manifest**

`package.json`:

```json
{
  "name": "one-academy",
  "private": true,
  "packageManager": "pnpm@12.11.2",
  "engines": { "node": ">=22.16" },
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "verify": "turbo lint typecheck test build",
    "format": "prettier --write .",
    "prepare": "husky"
  },
  "devDependencies": {
    "turbo": "2.11.7",
    "typescript": "6.0.3",
    "eslint": "10.12.0",
    "typescript-eslint": "8.71.1",
    "eslint-plugin-boundaries": "7.2.0",
    "@eslint/js": "10.12.0",
    "eslint-config-prettier": "10.1.8",
    "prettier": "3.9.10",
    "husky": "9.1.7",
    "lint-staged": "17.6.0"
  },
  "lint-staged": {
    "*.{ts,tsx,js,mjs}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yaml,yml}": ["prettier --write"]
  }
}
```

- [ ] **Step 2: Create the workspace definition and catalog**

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'

catalog:
  react: 19.3.0
  react-dom: 19.3.0
  '@types/react': 19.3.0
  '@types/react-dom': 19.3.0
  next: 16.4.0
  express: 5.3.0
  '@types/express': 5.0.6
  zod: 4.6.5
  prisma: 7.10.0
  '@prisma/client': 7.10.0
  typescript: 6.0.3
  vitest: 5.0.3
  supertest: 7.3.1
  '@types/supertest': 6.0.3
  tailwindcss: 4.3.3
  pino: 10.4.0
  'pino-pretty': 13.1.4
  '@clerk/nextjs': 7.9.14
  '@clerk/express': 2.1.78
  tsx: 4.23.15
  '@asteasolutions/zod-to-openapi': 9.1.0
  'express-rate-limit': 8.4.0
```

`.npmrc`:

```
strict-peer-dependencies=false
auto-install-peers=true
resolution-mode=highest
```

- [ ] **Step 3: Create the Turborepo task graph**

`turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "stream",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**", "generated/**"]
    },
    "lint": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "dev": { "cache": false, "persistent": true },
    "db:generate": { "cache": false },
    "db:migrate": { "cache": false },
    "db:seed": { "cache": false },
    "gen:openapi": { "cache": false }
  }
}
```

- [ ] **Step 4: Create ignore files**

`.gitignore`:

```
node_modules/
dist/
.next/
out/
.turbo/
coverage/
generated/
*.tsbuildinfo
.env
.env.local
.env.*.local
.DS_Store
test-results/
playwright-report/
```

`.prettierignore`:

```
pnpm-lock.yaml
.next/
dist/
generated/
coverage/
docs/api/openapi.json
```

- [ ] **Step 5: Create the `@one/config` workspace**

`packages/config/package.json`:

```json
{
  "name": "@one/config",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./prettier": "./prettier.json",
    "./tsconfig.base": "./tsconfig.base.json",
    "./tsconfig.node": "./tsconfig.node.json",
    "./tsconfig.react": "./tsconfig.react.json",
    "./eslint/base": "./eslint/base.js",
    "./eslint/api": "./eslint/api.js",
    "./eslint/next": "./eslint/next.js"
  },
  "scripts": {
    "build": "echo no-op",
    "lint": "echo no-op",
    "typecheck": "echo no-op",
    "test": "echo no-op"
  }
}
```

`packages/config/prettier.json`:

```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all"
}
```

`packages/config/tsconfig.base.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

`packages/config/tsconfig.node.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

`packages/config/tsconfig.react.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowJs": true,
    "noEmit": true,
    "declaration": false,
    "verbatimModuleSyntax": false
  }
}
```

Root `prettier.config.js`:

```js
export default (await import('./packages/config/prettier.json', { with: { type: 'json' } })).default
```

If that import assertion is unsupported by the installed Node, replace the file with a literal copy of `prettier.json` contents as an ESM default export. Verify in Step 7.

- [ ] **Step 6: Install and verify the workspace resolves**

Run:

```bash
pnpm install
pnpm ls --depth -1
```

Expected: install succeeds, `@one/config` appears as a workspace project. If `pnpm install` reports an unknown catalog entry, the version does not exist on the registry — check with `npm view <pkg> version` and correct the catalog rather than loosening the pin.

- [ ] **Step 7: Verify formatting works end to end**

Run:

```bash
pnpm format
pnpm exec prettier --check .
```

Expected: `All matched files use Prettier code style!`

- [ ] **Step 8: Install husky hooks**

Run:

```bash
pnpm exec husky init
```

Then overwrite `.husky/pre-commit`:

```sh
pnpm exec lint-staged
```

And create `.husky/pre-push`:

```sh
pnpm typecheck && pnpm test
```

Make both executable:

```bash
chmod +x .husky/pre-commit .husky/pre-push
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm workspace with pinned tooling"
```

---

### Task 2: ESLint flat config with provable R1–R6 enforcement

The point of this task is not that ESLint runs — it is that a deliberate architecture violation **fails**. A fixture proving each rule is part of the deliverable.

**Files:**
- Create: `packages/config/eslint/base.js`, `packages/config/eslint/api.js`, `packages/config/eslint/next.js`
- Create: `eslint.config.js` (root)
- Create: `packages/config/eslint/__fixtures__/README.md`

**Interfaces:**
- Consumes: `@one/config` from Task 1.
- Produces: `@one/config/eslint/base`, `@one/config/eslint/api`, `@one/config/eslint/next` as flat-config arrays. `api.js` exports a function `apiConfig({ tsconfigRootDir })` returning the config array.

- [ ] **Step 1: Write the base config**

`packages/config/eslint/base.js`:

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/generated/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
    },
  },
)
```

`no-console` is an error because the API logs through pino and the frontends must not ship stray logging.

- [ ] **Step 2: Write the API boundary config**

`packages/config/eslint/api.js`:

```js
import boundaries from 'eslint-plugin-boundaries'
import base from './base.js'

const PRISMA_IMPORTS = [
  { name: '@one/db', message: 'R1/R3: only *.repository.ts may import @one/db.' },
  { name: '@prisma/client', message: 'R1/R3: only *.repository.ts may import Prisma.' },
]

export default [
  ...base,
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'route', pattern: 'src/modules/*/*.routes.ts', mode: 'full', capture: ['module'] },
        { type: 'service', pattern: 'src/modules/*/*.service.ts', mode: 'full', capture: ['module'] },
        {
          type: 'repository',
          pattern: 'src/modules/*/*.repository.ts',
          mode: 'full',
          capture: ['module'],
        },
        { type: 'middleware', pattern: 'src/middleware/*.ts', mode: 'full' },
        { type: 'lib', pattern: 'src/lib/*.ts', mode: 'full' },
        { type: 'config', pattern: 'src/config/*.ts', mode: 'full' },
        { type: 'server', pattern: 'src/{server,index}.ts', mode: 'full' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message: 'R4: cross-module access must go through the other module\'s service.',
          rules: [
            {
              from: ['route'],
              allow: [
                ['service', { module: '${from.module}' }],
                'middleware',
                'lib',
                'config',
              ],
            },
            {
              from: ['service'],
              allow: [
                ['repository', { module: '${from.module}' }],
                ['service', { module: '*' }],
                'lib',
                'config',
              ],
            },
            { from: ['repository'], allow: ['lib', 'config'] },
            { from: ['middleware'], allow: ['lib', 'config', ['service', { module: '*' }]] },
            { from: ['lib'], allow: ['lib', 'config'] },
            { from: ['config'], allow: ['lib'] },
            { from: ['server'], allow: ['route', 'middleware', 'lib', 'config'] },
          ],
        },
      ],
    },
  },
  {
    // R1 + R3: Prisma only in repositories.
    files: ['src/**/*.ts'],
    ignores: ['src/modules/*/*.repository.ts'],
    rules: { 'no-restricted-imports': ['error', { paths: PRISMA_IMPORTS }] },
  },
  {
    // R2: services and repositories are HTTP-agnostic.
    files: ['src/modules/*/*.service.ts', 'src/modules/*/*.repository.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...PRISMA_IMPORTS.filter((p) => p.name === '@prisma/client'),
            { name: 'express', message: 'R2: services and repositories must not know about HTTP.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'req', message: 'R2: no request access outside route files.' },
        { name: 'res', message: 'R2: no response access outside route files.' },
      ],
    },
  },
  {
    // R6: only errorHandler maps errors to HTTP status.
    files: ['src/**/*.ts'],
    ignores: ['src/middleware/errorHandler.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='status'] > Literal[value>=500][value<600]",
          message: 'R6: throw an AppError; errorHandler maps it to HTTP.',
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', 'test/**/*.ts'],
    rules: { 'no-restricted-imports': 'off', 'no-console': 'off' },
  },
]
```

Note the `repository` ignore in the R2 block re-adds `@prisma/client` only; repositories legitimately import `@one/db`.

- [ ] **Step 3: Write the Next config**

`packages/config/eslint/next.js`:

```js
import base from './base.js'

export default [
  ...base,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@one/db', message: 'Frontends must call the API, never the database.' },
            { name: '@prisma/client', message: 'Frontends must call the API, never the database.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/**/page.tsx', 'src/app/**/layout.tsx'],
    rules: { 'no-console': 'error' },
  },
]
```

- [ ] **Step 4: Write the root config**

`eslint.config.js`:

```js
import base from './packages/config/eslint/base.js'

export default [...base, { ignores: ['apps/**', 'packages/**'] }]
```

Each workspace gets its own `eslint.config.js` re-exporting the appropriate preset; the root config lints only root-level scripts.

- [ ] **Step 5: Prove the rules fire**

Create a scratch workspace to validate the API preset before `apps/api` exists. Run:

```bash
mkdir -p /tmp/boundary-check/src/modules/alpha /tmp/boundary-check/src/modules/beta
cd /tmp/boundary-check
cat > eslint.config.js <<'EOF'
import api from '/Users/abhaydeomane/abhay/code/github/one_academy/One_Academy_Backend/packages/config/eslint/api.js'
export default api
EOF
echo "import { prisma } from '@one/db'; export const r = prisma" > src/modules/alpha/alpha.routes.ts
echo "import { x } from '../beta/beta.repository'; export const s = x" > src/modules/alpha/alpha.service.ts
echo "import express from 'express'; export const t = express" > src/modules/beta/beta.service.ts
```

Then from the repo root run:

```bash
pnpm exec eslint --no-config-lookup -c /tmp/boundary-check/eslint.config.js /tmp/boundary-check/src --ext .ts
```

Expected: three errors — the R1/R3 Prisma import in `alpha.routes.ts`, the R4 cross-module repository import in `alpha.service.ts`, and the R2 express import in `beta.service.ts`.

- [ ] **Step 6: Fix config until all three fire**

`eslint-plugin-boundaries` capture templating (`${from.module}`) is the least certain part of this config. If the R4 error does not appear, inspect with:

```bash
pnpm exec eslint --no-config-lookup -c /tmp/boundary-check/eslint.config.js /tmp/boundary-check/src --ext .ts --debug 2>&1 | grep -i boundaries
```

If capture templating is unsupported in v7.2.0, replace the `boundaries/element-types` rule with an equivalent `no-restricted-imports` pattern block that forbids `*.repository` imports from any file not in the same directory:

```js
{
  files: ['src/modules/*/*.service.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      { patterns: [{ group: ['../*/**.repository', '@/modules/*/*.repository'], message: 'R4: go through the service.' }] },
    ],
  },
}
```

Record whichever mechanism works; do not leave the rule unenforced. Delete `/tmp/boundary-check` when done.

- [ ] **Step 7: Verify the whole repo lints clean**

Run:

```bash
pnpm lint
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: add flat ESLint config enforcing module boundaries R1-R6"
```

---

### Task 3: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/pull_request_template.md`

**Interfaces:**
- Consumes: root scripts from Task 1.
- Produces: a `ci` workflow whose `verify` job is the required status check; a Postgres 17 service on 5432 with the test database available to later tasks.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: one_academy
          POSTGRES_PASSWORD: local_dev_only
          POSTGRES_DB: one_academy_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v5
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v5
        with: { node-version: '22.16.0' }
      - name: Install pnpm
        run: npm install -g pnpm@12.11.2
      - uses: actions/cache@v4
        with:
          path: ~/.local/share/pnpm/store
          key: pnpm-${{ hashFiles('pnpm-lock.yaml') }}
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @one/db db:generate
      - run: pnpm --filter @one/db db:migrate:deploy
      - run: pnpm verify
      - name: OpenAPI spec is current
        run: |
          pnpm --filter @one/shared gen:openapi
          git diff --exit-code -- docs/api/openapi.json \
            || { echo "::error::openapi.json is stale. Run pnpm --filter @one/shared gen:openapi"; exit 1; }
      - name: Prisma migrations match schema
        run: pnpm --filter @one/db exec prisma migrate diff \
          --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
          --shadow-database-url "$DATABASE_URL" --exit-code
      - name: Flow docs freshness
        continue-on-error: true
        run: pnpm exec tsx scripts/check-docs-freshness.ts
```

`fetch-depth: 0` is required — the docs freshness script reads commit history per file.

The `db:generate`, `db:migrate:deploy` and `gen:openapi` scripts are created in Tasks 4 and 8. Until then this workflow will fail on those steps; that is expected and resolved by Task 8.

- [ ] **Step 2: Write the PR template**

`.github/pull_request_template.md`:

```markdown
## What and why

Closes: <!-- REQ-### or BUG-### -->

## Definition of done

- [ ] `pnpm verify` green
- [ ] Integration test for any new or changed endpoint
- [ ] Contract schema updated in `packages/shared` if the API changed
- [ ] Flow doc updated and its verified-sha bumped if behaviour changed
- [ ] ADR added if a structural decision was made
- [ ] Work item moved to `docs/work/archive/` with an Outcome block
```

- [ ] **Step 3: Validate the YAML parses**

Run:

```bash
pnpm exec tsx -e "import {readFileSync} from 'node:fs'; console.error(readFileSync('.github/workflows/ci.yml','utf8').length)"
python3 -c "import sys,yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"
```

Expected: `yaml ok`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "ci: add verify workflow with Postgres service and PR template"
```

---

### Task 4: `@one/db` — Prisma schema and migration

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/eslint.config.js`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/client.ts`, `packages/db/src/index.ts`
- Create: `packages/db/.env` (git-ignored; Prisma CLI reads it)
- Generated: `packages/db/prisma/migrations/**`

**Interfaces:**
- Consumes: `@one/config` presets.
- Produces: `@one/db` exporting `prisma` (client singleton), `Prisma` namespace, and the enums `Vertical`, `ListingStatus`, `BatchStatus`, `Mode`, `ReviewStatus`, `EnquiryStatus`, `GlobalRole`, `MemberRole`, `OrgStatus`, `MediaKind`, `TagKind`. Scripts `db:generate`, `db:migrate`, `db:migrate:deploy`, `db:reset`, `db:seed`.

- [ ] **Step 1: Create the workspace manifest**

`packages/db/package.json`:

```json
{
  "name": "@one/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "prisma generate",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "echo no-op",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:reset": "prisma migrate reset --force",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio"
  },
  "dependencies": { "@prisma/client": "catalog:" },
  "devDependencies": {
    "prisma": "catalog:",
    "typescript": "catalog:",
    "tsx": "catalog:",
    "@one/config": "workspace:*"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" }
}
```

`build` runs `prisma generate` so Turborepo's `^build` dependency makes the client available to every downstream workspace.

- [ ] **Step 2: Write the schema**

`packages/db/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../generated/client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Vertical        { INSTITUTE HOSTEL }
enum ListingStatus   { DRAFT PENDING_REVIEW PUBLISHED SUSPENDED }
enum BatchStatus     { DRAFT PUBLISHED ARCHIVED }
enum Mode            { ONLINE OFFLINE HYBRID }
enum ReviewStatus    { PENDING PUBLISHED REJECTED }
enum EnquiryStatus   { NEW CONTACTED CONVERTED CLOSED }
enum GlobalRole      { USER ADMIN }
enum MemberRole      { OWNER MANAGER VIEWER }
enum OrgStatus       { ACTIVE SUSPENDED }
enum MediaKind       { IMAGE VIDEO BROCHURE }
enum TagKind         { EXAM AMENITY FACILITY }

model Organization {
  id          String       @id @default(cuid(2))
  name        String
  slug        String       @unique
  clerkOrgId  String?      @unique
  status      OrgStatus    @default(ACTIVE)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  listings    Listing[]
  memberships Membership[]
}

model User {
  id          String       @id @default(cuid(2))
  clerkUserId String?      @unique
  email       String       @unique
  name        String?
  globalRole  GlobalRole   @default(USER)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  memberships Membership[]
  reviews     Review[]
}

model Membership {
  id             String       @id @default(cuid(2))
  organizationId String
  userId         String
  role           MemberRole   @default(VIEWER)
  createdAt      DateTime     @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
  @@index([userId])
}

model City {
  id       String    @id @default(cuid(2))
  slug     String    @unique
  name     String
  state    String
  listings Listing[]
}

model Listing {
  id               String            @id @default(cuid(2))
  vertical         Vertical
  slug             String            @unique
  name             String
  status           ListingStatus     @default(DRAFT)
  organizationId   String
  cityId           String
  locality         String?
  lat              Float?
  lng              Float?
  shortDescription String?
  ratingAvg        Float             @default(0)
  ratingCount      Int               @default(0)
  publishedAt      DateTime?
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  organization     Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  city             City              @relation(fields: [cityId], references: [id])
  instituteProfile InstituteProfile?
  batches          Batch[]
  media            MediaAsset[]
  reviews          Review[]
  enquiries        Enquiry[]
  tags             ListingTag[]
  redirects        ListingRedirect[]

  @@index([status, vertical, cityId])
  @@index([organizationId])
}

model ListingRedirect {
  id        String   @id @default(cuid(2))
  oldSlug   String   @unique
  listingId String
  createdAt DateTime @default(now())
  listing   Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@index([listingId])
}

model MediaAsset {
  id        String    @id @default(cuid(2))
  listingId String
  kind      MediaKind @default(IMAGE)
  url       String
  alt       String?
  sortOrder Int       @default(0)
  listing   Listing   @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@index([listingId, sortOrder])
}

model Review {
  id           String       @id @default(cuid(2))
  listingId    String
  authorUserId String
  rating       Int
  title        String?
  body         String?
  status       ReviewStatus @default(PENDING)
  createdAt    DateTime     @default(now())
  listing      Listing      @relation(fields: [listingId], references: [id], onDelete: Cascade)
  author       User         @relation(fields: [authorUserId], references: [id], onDelete: Cascade)

  @@index([listingId, status])
}

model Enquiry {
  id        String        @id @default(cuid(2))
  listingId String
  vertical  Vertical
  batchId   String?
  name      String
  phone     String
  email     String?
  message   String?
  status    EnquiryStatus @default(NEW)
  source    String        @default("web")
  createdAt DateTime      @default(now())
  listing   Listing       @relation(fields: [listingId], references: [id], onDelete: Cascade)
  batch     Batch?        @relation(fields: [batchId], references: [id], onDelete: SetNull)

  @@index([listingId, createdAt])
}

model Tag {
  id       String       @id @default(cuid(2))
  slug     String       @unique
  label    String
  kind     TagKind
  listings ListingTag[]
}

model ListingTag {
  listingId String
  tagId     String
  listing   Listing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  tag       Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([listingId, tagId])
  @@index([tagId])
}

model InstituteProfile {
  id              String   @id @default(cuid(2))
  listingId       String   @unique
  establishedYear Int?
  facultyCount    Int?
  modes           Mode[]   @default([])
  website         String?
  about           String?
  listing         Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)
}

model Batch {
  id             String      @id @default(cuid(2))
  listingId      String
  title          String
  exam           String
  mode           Mode        @default(OFFLINE)
  startDate      DateTime
  endDate        DateTime?
  scheduleText   String?
  seatsTotal     Int
  seatsAvailable Int
  feeAmount      Int
  feeCurrency    String      @default("INR")
  status         BatchStatus @default(DRAFT)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  listing        Listing     @relation(fields: [listingId], references: [id], onDelete: Cascade)
  enquiries      Enquiry[]

  @@index([listingId, status, startDate])
}
```

`feeAmount` is `Int` in minor units per BR-005. `seatsAvailable` is a stored column whose BR-010 invariant is enforced in the service layer and asserted by a database check constraint added in Step 5.

- [ ] **Step 3: Write the client singleton**

`packages/db/src/client.ts`:

```ts
import { PrismaClient } from '../generated/client/index.js'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

`packages/db/src/index.ts`:

```ts
export { prisma } from './client.js'
export * from '../generated/client/index.js'
```

`packages/db/tsconfig.json`:

```json
{
  "extends": "@one/config/tsconfig.node",
  "compilerOptions": { "rootDir": ".", "noEmit": true },
  "include": ["src", "prisma"],
  "exclude": ["generated"]
}
```

`packages/db/eslint.config.js`:

```js
import base from '@one/config/eslint/base'

export default [...base, { ignores: ['generated/**'] }]
```

`packages/db/.env`:

```
DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_dev"
```

Add `packages/db/.env` is already covered by the root `.gitignore` `.env` entry — verify with `git check-ignore -v packages/db/.env`.

- [ ] **Step 4: Generate the client and create the migration**

Run:

```bash
pnpm install
pnpm --filter @one/db db:generate
pnpm --filter @one/db exec prisma migrate dev --name init_core_and_institute_vertical
```

Expected: `generated/client` exists; `prisma/migrations/<timestamp>_init_core_and_institute_vertical/migration.sql` created and applied to `one_academy_dev`.

If the `prisma-client-js` generator rejects the `output` option on Prisma 7, switch the generator block to `provider = "prisma-client"` and change both imports in Step 3 to `'../generated/client/client.js'`. Verify by reading `generated/client` after regenerating.

- [ ] **Step 5: Add the BR-010 check constraint**

Create an empty migration and fill it:

```bash
pnpm --filter @one/db exec prisma migrate dev --create-only --name batch_seats_invariant
```

Put this in the new `migration.sql`:

```sql
ALTER TABLE "Batch"
  ADD CONSTRAINT "Batch_seats_invariant"
  CHECK ("seatsAvailable" >= 0 AND "seatsAvailable" <= "seatsTotal");
```

Apply it:

```bash
pnpm --filter @one/db db:migrate
```

- [ ] **Step 6: Verify the constraint rejects a bad row**

Run:

```bash
psql "postgresql://one_academy:local_dev_only@localhost:5432/one_academy_dev" \
  -c "INSERT INTO \"City\" (id,slug,name,state) VALUES ('c1','x','X','S');" \
  -c "INSERT INTO \"Organization\" (id,name,slug,\"updatedAt\") VALUES ('o1','O','o',now());" \
  -c "INSERT INTO \"Listing\" (id,vertical,slug,name,\"organizationId\",\"cityId\",\"updatedAt\") VALUES ('l1','INSTITUTE','s','N','o1','c1',now());" \
  -c "INSERT INTO \"Batch\" (id,\"listingId\",title,exam,\"startDate\",\"seatsTotal\",\"seatsAvailable\",\"feeAmount\",\"updatedAt\") VALUES ('b1','l1','T','E',now(),10,11,1000,now());"
```

Expected: the final insert fails with `violates check constraint "Batch_seats_invariant"`.

Clean up:

```bash
psql "postgresql://one_academy:local_dev_only@localhost:5432/one_academy_dev" -c "DELETE FROM \"Listing\" WHERE id='l1'; DELETE FROM \"Organization\" WHERE id='o1'; DELETE FROM \"City\" WHERE id='c1';"
```

- [ ] **Step 7: Verify typecheck and lint pass**

Run:

```bash
pnpm --filter @one/db typecheck
pnpm --filter @one/db lint
```

Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(db): add core listing schema and institute vertical with seats invariant"
```

---

### Task 5: Deterministic seed data

**Files:**
- Create: `packages/db/prisma/seed.ts`

**Interfaces:**
- Consumes: `@one/db` exports from Task 4.
- Produces: a `db:seed` script creating fixed-ID records. Later tasks and E2E tests reference the IDs `org-seed-alpha`, `listing-alpha` (slug `alpha-academy`, PUBLISHED) and `listing-draft` (slug `draft-academy`, DRAFT).

- [ ] **Step 1: Write the seed script**

`packages/db/prisma/seed.ts`:

```ts
import { prisma } from '../src/client.js'

const CITIES = [
  { id: 'city-pune', slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  { id: 'city-mumbai', slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' },
  { id: 'city-delhi', slug: 'delhi', name: 'Delhi', state: 'Delhi' },
]

const TAGS = [
  { id: 'tag-jee', slug: 'jee', label: 'JEE', kind: 'EXAM' as const },
  { id: 'tag-neet', slug: 'neet', label: 'NEET', kind: 'EXAM' as const },
  { id: 'tag-hostel', slug: 'hostel', label: 'Hostel', kind: 'AMENITY' as const },
]

async function main() {
  for (const city of CITIES) {
    await prisma.city.upsert({ where: { id: city.id }, create: city, update: city })
  }
  for (const tag of TAGS) {
    await prisma.tag.upsert({ where: { id: tag.id }, create: tag, update: tag })
  }

  await prisma.organization.upsert({
    where: { id: 'org-seed-alpha' },
    create: { id: 'org-seed-alpha', name: 'Alpha Education Group', slug: 'alpha-education-group' },
    update: {},
  })

  await prisma.user.upsert({
    where: { id: 'user-seed-admin' },
    create: {
      id: 'user-seed-admin',
      email: 'admin@oneacademy.local',
      name: 'Seed Admin',
      globalRole: 'ADMIN',
    },
    update: { globalRole: 'ADMIN' },
  })

  await prisma.listing.upsert({
    where: { id: 'listing-alpha' },
    update: {},
    create: {
      id: 'listing-alpha',
      vertical: 'INSTITUTE',
      slug: 'alpha-academy',
      name: 'Alpha Academy',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      organizationId: 'org-seed-alpha',
      cityId: 'city-pune',
      locality: 'Kothrud',
      shortDescription: 'JEE and NEET coaching with small batch sizes.',
      instituteProfile: {
        create: {
          establishedYear: 2011,
          facultyCount: 24,
          modes: ['OFFLINE', 'HYBRID'],
          website: 'https://alpha.example.com',
          about: 'Alpha Academy has prepared students for JEE and NEET since 2011.',
        },
      },
      tags: { create: [{ tagId: 'tag-jee' }, { tagId: 'tag-neet' }] },
      batches: {
        create: [
          {
            id: 'batch-alpha-published',
            title: 'JEE Advanced 2027 — Morning',
            exam: 'JEE',
            mode: 'OFFLINE',
            startDate: new Date('2027-04-01T00:00:00Z'),
            endDate: new Date('2027-12-20T00:00:00Z'),
            scheduleText: 'Mon-Sat, 7:00-10:00',
            seatsTotal: 60,
            seatsAvailable: 18,
            feeAmount: 12500000,
            feeCurrency: 'INR',
            status: 'PUBLISHED',
          },
          {
            id: 'batch-alpha-draft',
            title: 'NEET 2027 — Evening',
            exam: 'NEET',
            mode: 'HYBRID',
            startDate: new Date('2027-05-15T00:00:00Z'),
            seatsTotal: 40,
            seatsAvailable: 40,
            feeAmount: 9900000,
            feeCurrency: 'INR',
            status: 'DRAFT',
          },
        ],
      },
    },
  })

  await prisma.listing.upsert({
    where: { id: 'listing-draft' },
    update: {},
    create: {
      id: 'listing-draft',
      vertical: 'INSTITUTE',
      slug: 'draft-academy',
      name: 'Draft Academy',
      status: 'DRAFT',
      organizationId: 'org-seed-alpha',
      cityId: 'city-mumbai',
      shortDescription: 'Not yet published — must never appear in public routes.',
      instituteProfile: { create: { establishedYear: 2024, modes: ['ONLINE'] } },
    },
  })

  for (let i = 1; i <= 8; i++) {
    const id = `listing-filler-${i}`
    await prisma.listing.upsert({
      where: { id },
      update: {},
      create: {
        id,
        vertical: 'INSTITUTE',
        slug: `filler-institute-${i}`,
        name: `Filler Institute ${i}`,
        status: 'PUBLISHED',
        publishedAt: new Date('2026-02-01T00:00:00Z'),
        organizationId: 'org-seed-alpha',
        cityId: CITIES[i % CITIES.length]!.id,
        shortDescription: `Pagination fixture number ${i}.`,
        instituteProfile: { create: { modes: ['ONLINE'] } },
        batches: {
          create: [
            {
              title: `Batch ${i}`,
              exam: i % 2 === 0 ? 'JEE' : 'NEET',
              mode: 'ONLINE',
              startDate: new Date('2027-06-01T00:00:00Z'),
              seatsTotal: 30,
              seatsAvailable: 30,
              feeAmount: 5000000,
              status: 'PUBLISHED',
            },
          ],
        },
      },
    })
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    await prisma.$disconnect()
    throw error
  })
```

Fees are minor units: `12500000` paise is ₹125,000 (BR-005). `listing-draft` exists specifically so BR-009 can be asserted.

- [ ] **Step 2: Run the seed**

```bash
pnpm --filter @one/db db:seed
```

Expected: exits 0. Run it a second time — it must also exit 0, proving idempotency.

- [ ] **Step 3: Verify the data shape**

```bash
psql "postgresql://one_academy:local_dev_only@localhost:5432/one_academy_dev" -c \
  "SELECT status, count(*) FROM \"Listing\" GROUP BY status ORDER BY status;"
```

Expected: `DRAFT 1`, `PUBLISHED 9`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): add idempotent seed with published and draft fixtures"
```

---

### Task 6: `@one/shared` — error codes and pagination

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/eslint.config.js`, `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/errors.ts`, `packages/shared/src/pagination.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/pagination.test.ts`

**Interfaces:**
- Consumes: `@one/config`.
- Produces:
  - `ERROR_CODES` — readonly tuple of codes; `type ErrorCode = (typeof ERROR_CODES)[number]`
  - `errorEnvelope` — Zod schema `{ error: { code, message, details? } }`
  - `type ErrorEnvelope = z.infer<typeof errorEnvelope>`
  - `paginationQuery` — Zod object `{ page: number (default 1), limit: number (default 20, max 50) }`
  - `type PaginationQuery = z.infer<typeof paginationQuery>`
  - `paginated<T>(item: z.ZodType<T>)` → Zod object `{ items: T[], total: number, page: number, limit: number }`
  - `type Paginated<T> = { items: T[]; total: number; page: number; limit: number }`

- [ ] **Step 1: Create the workspace manifest**

`packages/shared/package.json`:

```json
{
  "name": "@one/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "echo no-op",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "gen:openapi": "tsx scripts/gen-openapi.ts"
  },
  "dependencies": { "zod": "catalog:" },
  "devDependencies": {
    "@asteasolutions/zod-to-openapi": "catalog:",
    "@one/config": "workspace:*",
    "tsx": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "@one/config/tsconfig.node",
  "compilerOptions": { "rootDir": ".", "noEmit": true },
  "include": ["src", "scripts"]
}
```

`packages/shared/eslint.config.js`:

```js
import base from '@one/config/eslint/base'

export default base
```

`packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } })
```

- [ ] **Step 2: Write the failing pagination test**

`packages/shared/src/pagination.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { paginated, paginationQuery } from './pagination.js'

describe('paginationQuery', () => {
  it('applies defaults when absent', () => {
    expect(paginationQuery.parse({})).toEqual({ page: 1, limit: 20 })
  })

  it('coerces numeric strings from query parameters', () => {
    expect(paginationQuery.parse({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 })
  })

  it('rejects a limit above 50', () => {
    expect(paginationQuery.safeParse({ limit: '51' }).success).toBe(false)
  })

  it('rejects a page below 1', () => {
    expect(paginationQuery.safeParse({ page: '0' }).success).toBe(false)
  })
})

describe('paginated', () => {
  it('validates an envelope of the given item type', () => {
    const schema = paginated(z.object({ id: z.string() }))
    const value = { items: [{ id: 'a' }], total: 1, page: 1, limit: 20 }
    expect(schema.parse(value)).toEqual(value)
  })

  it('rejects items of the wrong shape', () => {
    const schema = paginated(z.object({ id: z.string() }))
    expect(schema.safeParse({ items: [{ id: 7 }], total: 1, page: 1, limit: 20 }).success).toBe(
      false,
    )
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @one/shared test
```

Expected: FAIL — cannot resolve `./pagination.js`.

- [ ] **Step 4: Implement pagination and errors**

`packages/shared/src/pagination.ts`:

```ts
import { z } from 'zod'

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type PaginationQuery = z.infer<typeof paginationQuery>

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(50),
  })
}

export type Paginated<T> = { items: T[]; total: number; page: number; limit: number }
```

`packages/shared/src/errors.ts`:

```ts
import { z } from 'zod'

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
  'LISTING_NOT_PUBLISHED',
  'SLUG_IMMUTABLE',
  'BATCH_START_DATE_PAST',
  'BATCH_PARENT_NOT_PUBLISHED',
  'SEATS_OUT_OF_RANGE',
  'INVALID_STATUS_TRANSITION',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export const errorEnvelope = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})

export type ErrorEnvelope = z.infer<typeof errorEnvelope>
```

`packages/shared/src/index.ts`:

```ts
export * from './errors.js'
export * from './pagination.js'
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @one/shared test
```

Expected: 6 passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(shared): add error codes and pagination contracts"
```

---

### Task 7: `@one/shared` — endpoint contracts

**Files:**
- Create: `packages/shared/src/contracts/institutes.ts`, `contracts/batches.ts`, `contracts/enquiries.ts`, `contracts/partner.ts`, `contracts/admin.ts`, `contracts/index.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/contracts/contracts.test.ts`

**Interfaces:**
- Consumes: `paginationQuery`, `paginated` from Task 6.
- Produces, all with inferred types of the same PascalCase name:
  - `listInstitutesQuery`, `instituteSummary`, `instituteListResponse`, `instituteDetail`, `instituteSlugParam`
  - `batchSummary`, `batchListResponse`
  - `createEnquiryBody`, `enquiryCreatedResponse`
  - `partnerListingSummary`, `partnerListingListResponse`, `updateListingBody`, `createBatchBody`, `updateBatchBody`, `listingIdParam`, `batchIdParam`
  - `adminListingQueueQuery`, `adminListingSummary`, `adminListingQueueResponse`
  - `MODES` = `['ONLINE','OFFLINE','HYBRID']`

- [ ] **Step 1: Write the failing contract test**

`packages/shared/src/contracts/contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  createBatchBody,
  createEnquiryBody,
  listInstitutesQuery,
  updateListingBody,
} from './index.js'

describe('listInstitutesQuery', () => {
  it('defaults pagination and leaves filters undefined', () => {
    expect(listInstitutesQuery.parse({})).toEqual({ page: 1, limit: 20, sort: 'recent' })
  })

  it('accepts city, exam and mode filters', () => {
    const parsed = listInstitutesQuery.parse({ city: 'pune', exam: 'jee', mode: 'OFFLINE' })
    expect(parsed.city).toBe('pune')
    expect(parsed.mode).toBe('OFFLINE')
  })

  it('rejects an unknown mode', () => {
    expect(listInstitutesQuery.safeParse({ mode: 'REMOTE' }).success).toBe(false)
  })
})

describe('createEnquiryBody', () => {
  it('requires a listing slug, name and phone', () => {
    expect(createEnquiryBody.safeParse({ listingSlug: 'a', name: 'B' }).success).toBe(false)
  })

  it('accepts a minimal valid enquiry', () => {
    const parsed = createEnquiryBody.parse({
      listingSlug: 'alpha-academy',
      name: 'Asha',
      phone: '9876543210',
    })
    expect(parsed.phone).toBe('9876543210')
  })

  it('rejects a phone number that is not 10 digits', () => {
    expect(
      createEnquiryBody.safeParse({ listingSlug: 'a', name: 'B', phone: '123' }).success,
    ).toBe(false)
  })
})

describe('createBatchBody', () => {
  it('rejects a negative fee', () => {
    expect(
      createBatchBody.safeParse({
        title: 'T',
        exam: 'JEE',
        mode: 'ONLINE',
        startDate: '2027-04-01',
        seatsTotal: 10,
        feeAmount: -1,
      }).success,
    ).toBe(false)
  })

  it('rejects a non-integer fee, because fees are minor units (BR-005)', () => {
    expect(
      createBatchBody.safeParse({
        title: 'T',
        exam: 'JEE',
        mode: 'ONLINE',
        startDate: '2027-04-01',
        seatsTotal: 10,
        feeAmount: 100.5,
      }).success,
    ).toBe(false)
  })

  it('accepts a valid batch and defaults the currency to INR', () => {
    const parsed = createBatchBody.parse({
      title: 'JEE 2027',
      exam: 'JEE',
      mode: 'ONLINE',
      startDate: '2027-04-01',
      seatsTotal: 10,
      feeAmount: 500000,
    })
    expect(parsed.feeCurrency).toBe('INR')
    expect(parsed.startDate).toBeInstanceOf(Date)
  })
})

describe('updateListingBody', () => {
  it('rejects an empty object, since a patch must change something', () => {
    expect(updateListingBody.safeParse({}).success).toBe(false)
  })

  it('accepts a partial update', () => {
    expect(updateListingBody.parse({ shortDescription: 'New' }).shortDescription).toBe('New')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @one/shared test
```

Expected: FAIL — cannot resolve `./index.js` in `contracts/`.

- [ ] **Step 3: Write the institute and batch contracts**

`packages/shared/src/contracts/institutes.ts`:

```ts
import { z } from 'zod'
import { paginated, paginationQuery } from '../pagination.js'

export const MODES = ['ONLINE', 'OFFLINE', 'HYBRID'] as const
export const modeSchema = z.enum(MODES)
export type Mode = (typeof MODES)[number]

export const listInstitutesQuery = paginationQuery.extend({
  city: z.string().min(1).optional(),
  exam: z.string().min(1).optional(),
  mode: modeSchema.optional(),
  sort: z.enum(['recent', 'rating', 'name']).default('recent'),
})
export type ListInstitutesQuery = z.infer<typeof listInstitutesQuery>

export const instituteSlugParam = z.object({ slug: z.string().min(1) })
export type InstituteSlugParam = z.infer<typeof instituteSlugParam>

export const instituteSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  city: z.object({ slug: z.string(), name: z.string() }),
  locality: z.string().nullable(),
  shortDescription: z.string().nullable(),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  modes: z.array(modeSchema),
  exams: z.array(z.string()),
  batchCount: z.number().int(),
})
export type InstituteSummary = z.infer<typeof instituteSummary>

export const instituteListResponse = paginated(instituteSummary)
export type InstituteListResponse = z.infer<typeof instituteListResponse>

export const instituteDetail = instituteSummary.extend({
  about: z.string().nullable(),
  website: z.string().nullable(),
  establishedYear: z.number().int().nullable(),
  facultyCount: z.number().int().nullable(),
  media: z.array(z.object({ url: z.string(), alt: z.string().nullable() })),
  publishedAt: z.string().datetime().nullable(),
})
export type InstituteDetail = z.infer<typeof instituteDetail>
```

`packages/shared/src/contracts/batches.ts`:

```ts
import { z } from 'zod'
import { modeSchema } from './institutes.js'

export const batchSummary = z.object({
  id: z.string(),
  title: z.string(),
  exam: z.string(),
  mode: modeSchema,
  startDate: z.string().datetime(),
  endDate: z.string().datetime().nullable(),
  scheduleText: z.string().nullable(),
  seatsTotal: z.number().int(),
  seatsAvailable: z.number().int(),
  feeAmount: z.number().int(),
  feeCurrency: z.string(),
})
export type BatchSummary = z.infer<typeof batchSummary>

export const batchListResponse = z.object({ items: z.array(batchSummary) })
export type BatchListResponse = z.infer<typeof batchListResponse>
```

Batch lists are not paginated — a listing has a bounded number of batches, and paginating them would complicate the detail page for no benefit.

- [ ] **Step 4: Write the enquiry, partner and admin contracts**

`packages/shared/src/contracts/enquiries.ts`:

```ts
import { z } from 'zod'

export const createEnquiryBody = z.object({
  listingSlug: z.string().min(1),
  batchId: z.string().min(1).optional(),
  name: z.string().min(2).max(120),
  phone: z.string().regex(/^\d{10}$/, 'Phone must be exactly 10 digits'),
  email: z.string().email().optional(),
  message: z.string().max(1000).optional(),
})
export type CreateEnquiryBody = z.infer<typeof createEnquiryBody>

export const enquiryCreatedResponse = z.object({ id: z.string(), status: z.literal('NEW') })
export type EnquiryCreatedResponse = z.infer<typeof enquiryCreatedResponse>
```

`packages/shared/src/contracts/partner.ts`:

```ts
import { z } from 'zod'
import { modeSchema } from './institutes.js'
import { batchSummary } from './batches.js'

export const LISTING_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SUSPENDED'] as const
export const listingStatusSchema = z.enum(LISTING_STATUSES)
export type ListingStatus = (typeof LISTING_STATUSES)[number]

export const BATCH_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const
export const batchStatusSchema = z.enum(BATCH_STATUSES)
export type BatchStatus = (typeof BATCH_STATUSES)[number]

export const listingIdParam = z.object({ listingId: z.string().min(1) })
export type ListingIdParam = z.infer<typeof listingIdParam>

export const batchIdParam = z.object({ batchId: z.string().min(1) })
export type BatchIdParam = z.infer<typeof batchIdParam>

export const partnerListingSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: listingStatusSchema,
  cityName: z.string(),
  batchCount: z.number().int(),
  updatedAt: z.string().datetime(),
})
export type PartnerListingSummary = z.infer<typeof partnerListingSummary>

export const partnerListingListResponse = z.object({
  items: z.array(partnerListingSummary),
})
export type PartnerListingListResponse = z.infer<typeof partnerListingListResponse>

export const partnerListingDetail = partnerListingSummary.extend({
  shortDescription: z.string().nullable(),
  about: z.string().nullable(),
  website: z.string().nullable(),
  batches: z.array(batchSummary.extend({ status: batchStatusSchema })),
})
export type PartnerListingDetail = z.infer<typeof partnerListingDetail>

export const updateListingBody = z
  .object({
    name: z.string().min(2).max(200).optional(),
    shortDescription: z.string().max(500).optional(),
    locality: z.string().max(200).optional(),
    about: z.string().max(5000).optional(),
    website: z.string().url().optional(),
    establishedYear: z.number().int().min(1900).max(2100).optional(),
    facultyCount: z.number().int().min(0).max(10000).optional(),
    modes: z.array(modeSchema).min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    error: 'At least one field must be provided',
  })
export type UpdateListingBody = z.infer<typeof updateListingBody>

export const createBatchBody = z.object({
  title: z.string().min(2).max(200),
  exam: z.string().min(1).max(60),
  mode: modeSchema,
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  scheduleText: z.string().max(300).optional(),
  seatsTotal: z.number().int().min(1).max(10000),
  seatsAvailable: z.number().int().min(0).max(10000).optional(),
  feeAmount: z.number().int().min(0),
  feeCurrency: z.string().length(3).default('INR'),
})
export type CreateBatchBody = z.infer<typeof createBatchBody>

export const updateBatchBody = z
  .object({
    title: z.string().min(2).max(200).optional(),
    exam: z.string().min(1).max(60).optional(),
    mode: modeSchema.optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    scheduleText: z.string().max(300).optional(),
    seatsTotal: z.number().int().min(1).max(10000).optional(),
    seatsAvailable: z.number().int().min(0).max(10000).optional(),
    feeAmount: z.number().int().min(0).optional(),
    status: batchStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    error: 'At least one field must be provided',
  })
export type UpdateBatchBody = z.infer<typeof updateBatchBody>
```

`packages/shared/src/contracts/admin.ts`:

```ts
import { z } from 'zod'
import { paginated, paginationQuery } from '../pagination.js'
import { listingStatusSchema } from './partner.js'

export const adminListingQueueQuery = paginationQuery.extend({
  status: listingStatusSchema.default('PENDING_REVIEW'),
})
export type AdminListingQueueQuery = z.infer<typeof adminListingQueueQuery>

export const adminListingSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: listingStatusSchema,
  organizationName: z.string(),
  cityName: z.string(),
  updatedAt: z.string().datetime(),
})
export type AdminListingSummary = z.infer<typeof adminListingSummary>

export const adminListingQueueResponse = paginated(adminListingSummary)
export type AdminListingQueueResponse = z.infer<typeof adminListingQueueResponse>
```

`packages/shared/src/contracts/index.ts`:

```ts
export * from './institutes.js'
export * from './batches.js'
export * from './enquiries.js'
export * from './partner.js'
export * from './admin.js'
```

Modify `packages/shared/src/index.ts` to:

```ts
export * from './errors.js'
export * from './pagination.js'
export * from './contracts/index.js'
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @one/shared test
```

Expected: all tests pass. If Zod 4 rejects `{ error: '...' }` as the refine message key, use `{ message: '...' }` instead and re-run.

- [ ] **Step 6: Verify typecheck**

```bash
pnpm --filter @one/shared typecheck && pnpm --filter @one/shared lint
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(shared): add institute, batch, enquiry, partner and admin contracts"
```

---

### Task 8: OpenAPI generation and the staleness gate

**Files:**
- Create: `packages/shared/scripts/gen-openapi.ts`
- Create: `docs/api/openapi.json` (generated output, committed)

**Interfaces:**
- Consumes: every contract from Task 7.
- Produces: `pnpm --filter @one/shared gen:openapi` writing `docs/api/openapi.json`; the CI step added in Task 3 now passes.

- [ ] **Step 1: Write the generator**

`packages/shared/scripts/gen-openapi.ts`:

```ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { errorEnvelope } from '../src/errors.js'
import {
  adminListingQueueQuery,
  adminListingQueueResponse,
  batchListResponse,
  createBatchBody,
  createEnquiryBody,
  enquiryCreatedResponse,
  instituteDetail,
  instituteListResponse,
  listInstitutesQuery,
  partnerListingDetail,
  partnerListingListResponse,
  updateBatchBody,
  updateListingBody,
} from '../src/contracts/index.js'

extendZodWithOpenApi(z)

const registry = new OpenAPIRegistry()
const Error = registry.register('ErrorEnvelope', errorEnvelope)

const json = <T extends z.ZodTypeAny>(schema: T) => ({
  content: { 'application/json': { schema } },
})

const errors = {
  400: { description: 'Validation failed', ...json(Error) },
  401: { description: 'Unauthenticated', ...json(Error) },
  403: { description: 'Forbidden', ...json(Error) },
  404: { description: 'Not found', ...json(Error) },
  409: { description: 'Conflict', ...json(Error) },
}

registry.registerPath({
  method: 'get',
  path: '/api/v1/institutes',
  summary: 'List published institutes',
  request: { query: listInstitutesQuery },
  responses: { 200: { description: 'Paginated institutes', ...json(instituteListResponse) }, 400: errors[400] },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/institutes/{slug}',
  summary: 'Get a published institute by slug',
  request: { params: z.object({ slug: z.string() }) },
  responses: { 200: { description: 'Institute detail', ...json(instituteDetail) }, 404: errors[404] },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/institutes/{slug}/batches',
  summary: 'List published batches for an institute',
  request: { params: z.object({ slug: z.string() }) },
  responses: { 200: { description: 'Batches', ...json(batchListResponse) }, 404: errors[404] },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/enquiries',
  summary: 'Create an enquiry',
  request: { body: json(createEnquiryBody) },
  responses: {
    201: { description: 'Created', ...json(enquiryCreatedResponse) },
    400: errors[400],
    404: errors[404],
    429: { description: 'Rate limited', ...json(Error) },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/partner/listings',
  summary: 'List listings owned by the active organization',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Listings', ...json(partnerListingListResponse) },
    401: errors[401],
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/partner/listings/{listingId}',
  summary: 'Get an owned listing with its batches',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ listingId: z.string() }) },
  responses: {
    200: { description: 'Listing detail', ...json(partnerListingDetail) },
    401: errors[401],
    403: errors[403],
    404: errors[404],
  },
})

registry.registerPath({
  method: 'patch',
  path: '/api/v1/partner/listings/{listingId}',
  summary: 'Update an owned listing',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ listingId: z.string() }), body: json(updateListingBody) },
  responses: {
    200: { description: 'Updated', ...json(partnerListingDetail) },
    400: errors[400],
    403: errors[403],
    409: errors[409],
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/partner/listings/{listingId}/batches',
  summary: 'Create a batch on an owned listing',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ listingId: z.string() }), body: json(createBatchBody) },
  responses: {
    201: { description: 'Created', ...json(batchListResponse) },
    400: errors[400],
    403: errors[403],
  },
})

registry.registerPath({
  method: 'patch',
  path: '/api/v1/partner/batches/{batchId}',
  summary: 'Update a batch on an owned listing',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ batchId: z.string() }), body: json(updateBatchBody) },
  responses: {
    200: { description: 'Updated', ...json(batchListResponse) },
    400: errors[400],
    403: errors[403],
    409: errors[409],
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/partner/listings/{listingId}/submit',
  summary: 'Submit a draft listing for review',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ listingId: z.string() }) },
  responses: {
    200: { description: 'Submitted', ...json(partnerListingDetail) },
    403: errors[403],
    409: errors[409],
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/listings',
  summary: 'List listings awaiting moderation',
  security: [{ bearerAuth: [] }],
  request: { query: adminListingQueueQuery },
  responses: {
    200: { description: 'Queue', ...json(adminListingQueueResponse) },
    403: errors[403],
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/listings/{listingId}/publish',
  summary: 'Publish a listing (BR-001)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ listingId: z.string() }) },
  responses: {
    200: { description: 'Published', ...json(adminListingQueueResponse.shape.items.element) },
    403: errors[403],
    409: errors[409],
  },
})

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
})

const document = new OpenApiGeneratorV31(registry.definitions).generateDocument({
  openapi: '3.1.0',
  info: { title: 'One Academy API', version: '1.0.0' },
  servers: [{ url: 'http://localhost:4000' }],
})

const target = resolve(import.meta.dirname, '../../../docs/api/openapi.json')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`)
console.error(`wrote ${target}`)
```

`console.error` rather than `console.log` so the `no-console` rule's intent is respected while still reporting progress; add `/* eslint-disable no-console */` at the top of this file if lint objects.

- [ ] **Step 2: Generate the spec**

```bash
pnpm --filter @one/shared gen:openapi
```

Expected: `docs/api/openapi.json` written. If `registry.registerPath` rejects a schema because `.openapi()` metadata is missing, that is non-fatal — the generator infers names. If it fails on `adminListingQueueResponse.shape.items.element`, replace that expression with `adminListingSummary` imported directly.

- [ ] **Step 3: Verify the document is valid OpenAPI 3.1**

```bash
python3 -c "
import json
d = json.load(open('docs/api/openapi.json'))
assert d['openapi'] == '3.1.0', d['openapi']
paths = sorted(d['paths'])
assert len(paths) == 10, paths
print('\n'.join(paths))
"
```

Expected: ten paths listed, matching the spec's §9 endpoint list.

- [ ] **Step 4: Verify the staleness gate detects drift**

```bash
python3 -c "
import json; p='docs/api/openapi.json'; d=json.load(open(p)); d['info']['version']='9.9.9'; json.dump(d, open(p,'w'), indent=2)
"
pnpm --filter @one/shared gen:openapi
git diff --exit-code -- docs/api/openapi.json ; echo "exit=$?"
```

Expected: `exit=0` after regeneration restores the file — proving regeneration is deterministic. Then confirm the inverse:

```bash
python3 -c "
import json; p='docs/api/openapi.json'; d=json.load(open(p)); d['info']['version']='9.9.9'; json.dump(d, open(p,'w'), indent=2)
"
git diff --exit-code -- docs/api/openapi.json ; echo "exit=$?"
```

Expected: `exit=1`, proving the CI gate would fail. Restore with `pnpm --filter @one/shared gen:openapi`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): generate OpenAPI 3.1 document from Zod contracts"
```

---

### Task 9: `apps/api` skeleton, error handling and test harness

**Files:**
- Create: `apps/api/package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `.env.example`, `.env`
- Create: `apps/api/src/config/index.ts`, `src/lib/errors.ts`, `src/lib/logger.ts`
- Create: `apps/api/src/middleware/requestId.ts`, `validate.ts`, `errorHandler.ts`
- Create: `apps/api/src/server.ts`, `src/index.ts`
- Create: `apps/api/test/helpers/db.ts`, `test/helpers/app.ts`
- Test: `apps/api/src/middleware/errorHandler.test.ts`

**Interfaces:**
- Consumes: `@one/shared` (`ErrorCode`, `errorEnvelope`), `@one/db` (`prisma`).
- Produces:
  - `config` — `{ nodeEnv, port, databaseUrl, clerkSecretKey, clerkWebhookSecret, corsOrigins }`
  - `AppError` base with `code: ErrorCode`, `status: number`, `details?: unknown`; subclasses `BadRequestError` (400 `VALIDATION_FAILED`), `UnauthenticatedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409)
  - `validate({ params?, query?, body? })` → Express middleware populating `req.valid` as `{ params, query, body }`
  - `errorHandler(err, req, res, next)` — the only mapper to HTTP
  - `requestId` middleware setting `req.id` and the `x-request-id` header
  - `createServer()` → `express.Application`
  - `test/helpers/db.ts`: `resetDb()`, `seedMinimal()` → `{ orgId, cityId, publishedListingId, draftListingId, publishedSlug }`
  - `test/helpers/app.ts`: `testApp()` → supertest agent

- [ ] **Step 1: Create the workspace manifest and configs**

`apps/api/package.json`:

```json
{
  "name": "@one/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@clerk/express": "catalog:",
    "@one/db": "workspace:*",
    "@one/shared": "workspace:*",
    "express": "catalog:",
    "express-rate-limit": "catalog:",
    "pino": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@one/config": "workspace:*",
    "@types/express": "catalog:",
    "@types/node": "24.9.2",
    "@types/supertest": "catalog:",
    "pino-pretty": "catalog:",
    "supertest": "catalog:",
    "tsx": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`apps/api/tsconfig.json`:

```json
{
  "extends": "@one/config/tsconfig.node",
  "compilerOptions": { "rootDir": ".", "noEmit": true },
  "include": ["src", "test"]
}
```

`apps/api/tsconfig.build.json`:

```json
{
  "extends": "@one/config/tsconfig.node",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "noEmit": false },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

`apps/api/eslint.config.js`:

```js
import api from '@one/config/eslint/api'

export default api
```

`apps/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    fileParallelism: false,
    setupFiles: ['test/helpers/setup.ts'],
    testTimeout: 20000,
  },
})
```

`fileParallelism: false` because every integration test file shares one Postgres database; parallel files would interleave truncations.

`apps/api/.env.example`:

```
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://one_academy:local_dev_only@localhost:5432/one_academy_dev
CLERK_SECRET_KEY=sk_test_replace_me
CLERK_WEBHOOK_SECRET=whsec_replace_me
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

`apps/api/.env` — same values; git-ignored.

- [ ] **Step 2: Write the failing error-handler test**

`apps/api/src/middleware/errorHandler.test.ts`:

```ts
import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { errorEnvelope } from '@one/shared'
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js'
import { errorHandler } from './errorHandler.js'
import { requestId } from './requestId.js'

function appThatThrows(error: unknown) {
  const app = express()
  app.use(requestId)
  app.get('/boom', () => {
    throw error
  })
  app.get('/async-boom', async () => {
    await Promise.resolve()
    throw error
  })
  app.use(errorHandler)
  return app
}

describe('errorHandler', () => {
  it('maps NotFoundError to 404 with the uniform envelope', async () => {
    const res = await request(appThatThrows(new NotFoundError('Listing not found'))).get('/boom')
    expect(res.status).toBe(404)
    expect(errorEnvelope.parse(res.body).error.code).toBe('NOT_FOUND')
  })

  it('maps ForbiddenError to 403', async () => {
    const res = await request(appThatThrows(new ForbiddenError())).get('/boom')
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('maps ConflictError with a domain code', async () => {
    const res = await request(
      appThatThrows(new ConflictError('SLUG_IMMUTABLE', 'Slug cannot change')),
    ).get('/boom')
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('SLUG_IMMUTABLE')
  })

  it('maps an unknown error to 500 INTERNAL without leaking the message', async () => {
    const res = await request(appThatThrows(new Error('secret db string'))).get('/boom')
    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL')
    expect(JSON.stringify(res.body)).not.toContain('secret db string')
  })

  it('catches rejections from async handlers without an asyncHandler wrapper (Express 5)', async () => {
    const res = await request(appThatThrows(new NotFoundError())).get('/async-boom')
    expect(res.status).toBe(404)
  })

  it('echoes the request id header', async () => {
    const res = await request(appThatThrows(new NotFoundError())).get('/boom')
    expect(res.headers['x-request-id']).toBeTruthy()
  })
})
```

The async case is the one that proves the Express 5 constraint from Global Constraints holds.

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm install
pnpm --filter @one/api test
```

Expected: FAIL — `../lib/errors.js` cannot be resolved.

- [ ] **Step 4: Implement config, errors and logger**

`apps/api/src/config/index.ts`:

```ts
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  throw new Error(`Invalid environment: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`)
}

export const config = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  databaseUrl: parsed.data.DATABASE_URL,
  clerkSecretKey: parsed.data.CLERK_SECRET_KEY,
  clerkWebhookSecret: parsed.data.CLERK_WEBHOOK_SECRET,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((value) => value.trim()),
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
} as const
```

Clerk keys are optional so the API boots for public-route development and tests before Clerk is configured. The auth middleware in Task 13 fails loudly if they are missing when a protected route is hit.

`apps/api/src/lib/errors.ts`:

```ts
import type { ErrorCode } from '@one/shared'

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: unknown

  constructor(code: ErrorCode, status: number, message: string, details?: unknown) {
    super(message)
    this.name = new.target.name
    this.code = code
    this.status = status
    this.details = details
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super('VALIDATION_FAILED', 400, message, details)
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHENTICATED', 401, message)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not permitted') {
    super('FORBIDDEN', 403, message)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', 404, message)
  }
}

export class ConflictError extends AppError {
  constructor(code: ErrorCode = 'CONFLICT', message = 'Conflict', details?: unknown) {
    super(code, 409, message, details)
  }
}
```

`apps/api/src/lib/logger.ts`:

```ts
import pino from 'pino'
import { config } from '../config/index.js'

export const logger = pino({
  level: config.isTest ? 'silent' : config.isProduction ? 'info' : 'debug',
  ...(config.isProduction ? {} : { transport: { target: 'pino-pretty' } }),
})
```

- [ ] **Step 5: Implement the middleware**

`apps/api/src/middleware/requestId.ts`:

```ts
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

declare module 'express-serve-static-core' {
  interface Request {
    id?: string
  }
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id')
  req.id = incoming && incoming.length <= 200 ? incoming : randomUUID()
  res.setHeader('x-request-id', req.id)
  next()
}
```

`apps/api/src/middleware/errorHandler.ts`:

```ts
import type { NextFunction, Request, Response } from 'express'
import type { ErrorEnvelope } from '@one/shared'
import { AppError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    const body: ErrorEnvelope = {
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
    }
    logger.warn({ requestId: req.id, code: error.code, path: req.path }, error.message)
    res.status(error.status).json(body)
    return
  }

  logger.error({ requestId: req.id, path: req.path, err: error }, 'Unhandled error')
  const body: ErrorEnvelope = { error: { code: 'INTERNAL', message: 'Internal server error' } }
  res.status(500).json(body)
}
```

This is the only file permitted to use a 5xx literal, and the R6 lint block in Task 2 ignores exactly this path.

`apps/api/src/middleware/validate.ts`:

```ts
import type { NextFunction, Request, Response } from 'express'
import type { ZodTypeAny, z } from 'zod'
import { BadRequestError } from '../lib/errors.js'

type Schemas = { params?: ZodTypeAny; query?: ZodTypeAny; body?: ZodTypeAny }

declare module 'express-serve-static-core' {
  interface Request {
    valid?: { params?: unknown; query?: unknown; body?: unknown }
  }
}

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const valid: { params?: unknown; query?: unknown; body?: unknown } = {}

    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key]
      if (!schema) continue
      const result = schema.safeParse(req[key])
      if (!result.success) {
        throw new BadRequestError(`Invalid ${key}`, (result.error as z.ZodError).flatten())
      }
      valid[key] = result.data
    }

    req.valid = valid
    next()
  }
}

export function validated<T>(req: Request, key: 'params' | 'query' | 'body'): T {
  const value = req.valid?.[key]
  if (value === undefined) {
    throw new Error(`R5: route read ${key} without a validate() schema`)
  }
  return value as T
}
```

`validated()` is the R5 safety net: a route that forgets `validate()` throws immediately rather than reading unvalidated input.

- [ ] **Step 6: Implement server assembly**

`apps/api/src/server.ts`:

```ts
import express from 'express'
import { config } from './config/index.js'
import { errorHandler } from './middleware/errorHandler.js'
import { requestId } from './middleware/requestId.js'

export function createServer() {
  const app = express()

  app.disable('x-powered-by')
  app.use(requestId)
  app.use(express.json({ limit: '1mb' }))

  app.use((req, res, next) => {
    const origin = req.get('origin')
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('access-control-allow-headers', 'content-type,authorization')
      res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,OPTIONS')
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // Routers are mounted here by later tasks.

  app.use(errorHandler)
  return app
}
```

`apps/api/src/index.ts`:

```ts
import { config } from './config/index.js'
import { logger } from './lib/logger.js'
import { createServer } from './server.js'

createServer().listen(config.port, () => {
  logger.info({ port: config.port }, 'API listening')
})
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
pnpm --filter @one/api test
```

Expected: 6 passing. If `express.json()` and the thrown `BadRequestError` interact so that a sync throw inside `validate` escapes, confirm Express 5 catches sync throws in middleware — it does; no wrapper is needed.

- [ ] **Step 8: Write the integration test harness**

`apps/api/test/helpers/setup.ts`:

```ts
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??=
  'postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test'
```

`apps/api/test/helpers/db.ts`:

```ts
import { prisma } from '@one/db'

export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "Enquiry", "Review", "ListingTag", "MediaAsset", "ListingRedirect",
      "Batch", "InstituteProfile", "Listing", "Membership", "Organization", "User",
      "Tag", "City" RESTART IDENTITY CASCADE;
  `)
}

export type MinimalSeed = {
  orgId: string
  otherOrgId: string
  cityId: string
  adminUserId: string
  publishedListingId: string
  draftListingId: string
  publishedSlug: string
  draftSlug: string
  publishedBatchId: string
}

export async function seedMinimal(): Promise<MinimalSeed> {
  const city = await prisma.city.create({
    data: { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({ data: { name: 'Alpha', slug: 'alpha' } })
  const otherOrg = await prisma.organization.create({ data: { name: 'Beta', slug: 'beta' } })
  const admin = await prisma.user.create({
    data: { email: 'admin@test.local', globalRole: 'ADMIN' },
  })
  const exam = await prisma.tag.create({ data: { slug: 'jee', label: 'JEE', kind: 'EXAM' } })

  const published = await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'alpha-academy',
      name: 'Alpha Academy',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      organizationId: org.id,
      cityId: city.id,
      locality: 'Kothrud',
      shortDescription: 'JEE coaching',
      instituteProfile: { create: { establishedYear: 2011, facultyCount: 24, modes: ['OFFLINE'] } },
      tags: { create: [{ tagId: exam.id }] },
      batches: {
        create: [
          {
            title: 'JEE 2027',
            exam: 'JEE',
            mode: 'OFFLINE',
            startDate: new Date('2027-04-01T00:00:00Z'),
            seatsTotal: 60,
            seatsAvailable: 18,
            feeAmount: 12500000,
            status: 'PUBLISHED',
          },
          {
            title: 'Hidden draft batch',
            exam: 'NEET',
            mode: 'ONLINE',
            startDate: new Date('2027-05-01T00:00:00Z'),
            seatsTotal: 20,
            seatsAvailable: 20,
            feeAmount: 9900000,
            status: 'DRAFT',
          },
        ],
      },
    },
    include: { batches: true },
  })

  const draft = await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'draft-academy',
      name: 'Draft Academy',
      status: 'DRAFT',
      organizationId: org.id,
      cityId: city.id,
      instituteProfile: { create: { modes: ['ONLINE'] } },
    },
  })

  const publishedBatch = published.batches.find((batch) => batch.status === 'PUBLISHED')
  if (!publishedBatch) throw new Error('seed invariant: expected a published batch')

  return {
    orgId: org.id,
    otherOrgId: otherOrg.id,
    cityId: city.id,
    adminUserId: admin.id,
    publishedListingId: published.id,
    draftListingId: draft.id,
    publishedSlug: published.slug,
    draftSlug: draft.slug,
    publishedBatchId: publishedBatch.id,
  }
}
```

`apps/api/test/helpers/app.ts`:

```ts
import request from 'supertest'
import { createServer } from '../../src/server.js'

export function testApp() {
  return request(createServer())
}
```

- [ ] **Step 9: Prepare the test database and prove the harness works**

Run:

```bash
cd packages/db && DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test" pnpm exec prisma migrate deploy && cd ../..
```

Create `apps/api/test/harness.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb, seedMinimal } from './helpers/db.js'
import { testApp } from './helpers/app.js'

describe('test harness', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('serves /health', async () => {
    const res = await testApp().get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('seeds one published and one draft listing against a real database', async () => {
    const seed = await seedMinimal()
    const count = await prisma.listing.count({ where: { status: 'PUBLISHED' } })
    expect(count).toBe(1)
    expect(seed.publishedSlug).toBe('alpha-academy')
  })

  it('truncates between tests', async () => {
    expect(await prisma.listing.count()).toBe(0)
  })
})
```

Run:

```bash
pnpm --filter @one/api test
```

Expected: 9 passing total.

- [ ] **Step 10: Record how the test database is migrated**

No extra script is needed. The test database is migrated by overriding `DATABASE_URL`:

```bash
DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test" \
  pnpm --filter @one/db exec prisma migrate deploy
```

This command is documented in the runbook created in Task 21. Run it after every new
migration, or integration tests will fail against a stale schema.

- [ ] **Step 11: Verify lint, typecheck, and that R1/R6 hold in real code**

```bash
pnpm --filter @one/api lint
pnpm --filter @one/api typecheck
```

Expected: both exit 0. Then prove R1 fires in the real workspace:

```bash
echo "import { prisma } from '@one/db'
export const leak = prisma" > apps/api/src/modules/_probe/_probe.routes.ts
mkdir -p apps/api/src/modules/_probe && pnpm --filter @one/api lint ; echo "exit=$?"
rm -rf apps/api/src/modules/_probe
```

Expected: `exit=1` with the R1/R3 message. Create the directory before writing the file if the echo fails.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(api): add server skeleton, typed errors and real-database test harness"
```

---

### Task 10: `listings` module — the shared core

**Files:**
- Create: `apps/api/src/modules/listings/listings.repository.ts`, `listings.service.ts`
- Test: `apps/api/src/modules/listings/listings.service.test.ts`

**Interfaces:**
- Consumes: `@one/db`, `AppError` subclasses.
- Produces, exported from `listings.service.ts`:
  - `resolvePublishedSlug(slug: string)` → `{ listingId: string; canonicalSlug: string; redirected: boolean }` — throws `NotFoundError` if absent or not PUBLISHED (BR-009), follows `ListingRedirect` (BR-002)
  - `assertOrgOwnsListing(listingId: string, organizationId: string)` → `void` — throws `NotFoundError` if absent, `ForbiddenError` if owned by another org
  - `changeSlug(listingId: string, nextSlug: string)` → `void` — throws `ConflictError('SLUG_IMMUTABLE')` when the listing is PUBLISHED (BR-002)
  - `submitForReview(listingId: string)` → `void` — DRAFT→PENDING_REVIEW only, else `ConflictError('INVALID_STATUS_TRANSITION')`
  - `publish(listingId: string)` → `void` — PENDING_REVIEW or DRAFT → PUBLISHED, sets `publishedAt`
  - `type ListingVertical = 'INSTITUTE' | 'HOSTEL'`

- [ ] **Step 1: Write the failing service test**

`apps/api/src/modules/listings/listings.service.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import {
  assertOrgOwnsListing,
  changeSlug,
  publish,
  resolvePublishedSlug,
  submitForReview,
} from './listings.service.js'

let seed: MinimalSeed

beforeEach(async () => {
  await resetDb()
  seed = await seedMinimal()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('resolvePublishedSlug (BR-009)', () => {
  it('resolves a published slug', async () => {
    const result = await resolvePublishedSlug(seed.publishedSlug)
    expect(result.listingId).toBe(seed.publishedListingId)
    expect(result.redirected).toBe(false)
  })

  it('refuses a draft listing', async () => {
    await expect(resolvePublishedSlug(seed.draftSlug)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses an unknown slug', async () => {
    await expect(resolvePublishedSlug('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('follows a redirect to the canonical slug (BR-002)', async () => {
    await prisma.listingRedirect.create({
      data: { oldSlug: 'old-alpha', listingId: seed.publishedListingId },
    })
    const result = await resolvePublishedSlug('old-alpha')
    expect(result.canonicalSlug).toBe(seed.publishedSlug)
    expect(result.redirected).toBe(true)
  })
})

describe('assertOrgOwnsListing', () => {
  it('passes for the owning organization', async () => {
    await expect(assertOrgOwnsListing(seed.publishedListingId, seed.orgId)).resolves.toBeUndefined()
  })

  it('forbids another organization', async () => {
    await expect(
      assertOrgOwnsListing(seed.publishedListingId, seed.otherOrgId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('reports a missing listing as not found', async () => {
    await expect(assertOrgOwnsListing('missing', seed.orgId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('changeSlug (BR-002)', () => {
  it('refuses to change a published slug', async () => {
    await expect(changeSlug(seed.publishedListingId, 'new-slug')).rejects.toMatchObject({
      code: 'SLUG_IMMUTABLE',
    })
  })

  it('allows changing a draft slug and records no redirect', async () => {
    await changeSlug(seed.draftListingId, 'renamed-draft')
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(listing.slug).toBe('renamed-draft')
    expect(await prisma.listingRedirect.count()).toBe(0)
  })
})

describe('status transitions', () => {
  it('moves DRAFT to PENDING_REVIEW', async () => {
    await submitForReview(seed.draftListingId)
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(listing.status).toBe('PENDING_REVIEW')
  })

  it('refuses to submit an already published listing', async () => {
    await expect(submitForReview(seed.publishedListingId)).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    })
  })

  it('publishes a pending listing and stamps publishedAt', async () => {
    await submitForReview(seed.draftListingId)
    await publish(seed.draftListingId)
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(listing.status).toBe('PUBLISHED')
    expect(listing.publishedAt).toBeInstanceOf(Date)
  })

  it('refuses to publish an already published listing', async () => {
    await expect(publish(seed.publishedListingId)).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @one/api test listings.service
```

Expected: FAIL — `./listings.service.js` cannot be resolved.

- [ ] **Step 3: Implement the repository**

`apps/api/src/modules/listings/listings.repository.ts`:

```ts
import { prisma } from '@one/db'

export type ListingCore = {
  id: string
  slug: string
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'SUSPENDED'
  organizationId: string
}

const CORE_SELECT = { id: true, slug: true, status: true, organizationId: true } as const

export async function findBySlug(slug: string): Promise<ListingCore | null> {
  return prisma.listing.findUnique({ where: { slug }, select: CORE_SELECT })
}

export async function findById(id: string): Promise<ListingCore | null> {
  return prisma.listing.findUnique({ where: { id }, select: CORE_SELECT })
}

export async function findRedirectTarget(oldSlug: string): Promise<ListingCore | null> {
  const redirect = await prisma.listingRedirect.findUnique({
    where: { oldSlug },
    select: { listing: { select: CORE_SELECT } },
  })
  return redirect?.listing ?? null
}

export async function updateSlug(id: string, slug: string): Promise<void> {
  await prisma.listing.update({ where: { id }, data: { slug } })
}

export async function createRedirect(listingId: string, oldSlug: string): Promise<void> {
  await prisma.listingRedirect.create({ data: { listingId, oldSlug } })
}

export async function updateStatus(
  id: string,
  status: ListingCore['status'],
  publishedAt?: Date,
): Promise<void> {
  await prisma.listing.update({
    where: { id },
    data: { status, ...(publishedAt ? { publishedAt } : {}) },
  })
}
```

The repository returns the plain `ListingCore` type, never a Prisma model type, so Prisma stays replaceable.

- [ ] **Step 4: Implement the service**

`apps/api/src/modules/listings/listings.service.ts`:

```ts
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js'
import * as repo from './listings.repository.js'

export type ListingVertical = 'INSTITUTE' | 'HOSTEL'

export async function resolvePublishedSlug(slug: string) {
  const direct = await repo.findBySlug(slug)
  if (direct) {
    if (direct.status !== 'PUBLISHED') throw new NotFoundError('Institute not found')
    return { listingId: direct.id, canonicalSlug: direct.slug, redirected: false }
  }

  const viaRedirect = await repo.findRedirectTarget(slug)
  if (!viaRedirect || viaRedirect.status !== 'PUBLISHED') {
    throw new NotFoundError('Institute not found')
  }
  return { listingId: viaRedirect.id, canonicalSlug: viaRedirect.slug, redirected: true }
}

export async function assertOrgOwnsListing(listingId: string, organizationId: string) {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')
  if (listing.organizationId !== organizationId) {
    throw new ForbiddenError('Listing belongs to another organization')
  }
}

export async function changeSlug(listingId: string, nextSlug: string) {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')

  if (listing.status === 'PUBLISHED') {
    throw new ConflictError('SLUG_IMMUTABLE', 'A published listing slug cannot be changed')
  }
  if (listing.slug === nextSlug) return

  await repo.updateSlug(listingId, nextSlug)
}

export async function submitForReview(listingId: string) {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')
  if (listing.status !== 'DRAFT') {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      `Only a DRAFT listing can be submitted; this listing is ${listing.status}`,
    )
  }
  await repo.updateStatus(listingId, 'PENDING_REVIEW')
}

export async function publish(listingId: string) {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')
  if (listing.status !== 'PENDING_REVIEW' && listing.status !== 'DRAFT') {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      `Cannot publish a listing in status ${listing.status}`,
    )
  }
  await repo.updateStatus(listingId, 'PUBLISHED', new Date())
}

export async function isPublished(listingId: string) {
  const listing = await repo.findById(listingId)
  return listing?.status === 'PUBLISHED'
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @one/api test listings.service
```

Expected: 12 passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): add listings core with slug resolution and status transitions"
```

---

### Task 11: `institutes` module — public endpoints

**Files:**
- Create: `apps/api/src/modules/institutes/institutes.repository.ts`, `institutes.service.ts`, `institutes.routes.ts`
- Create: `apps/api/src/modules/batches/batches.repository.ts`, `batches.service.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/src/modules/institutes/institutes.routes.test.ts`

**Interfaces:**
- Consumes: `resolvePublishedSlug` from Task 10; `listInstitutesQuery`, `instituteListResponse`, `instituteDetail`, `batchListResponse` from Task 7.
- Produces:
  - `institutesRouter` — mounted at `/api/v1/institutes`
  - `institutes.service.listPublished(query: ListInstitutesQuery)` → `Paginated<InstituteSummary>`
  - `institutes.service.getPublishedBySlug(slug)` → `{ detail: InstituteDetail; canonicalSlug: string; redirected: boolean }`
  - `batches.service.listPublishedForListing(listingId)` → `BatchSummary[]`

- [ ] **Step 1: Write the failing route test**

`apps/api/src/modules/institutes/institutes.routes.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { instituteDetail, instituteListResponse, batchListResponse } from '@one/shared'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import { testApp } from '../../../test/helpers/app.js'

let seed: MinimalSeed

beforeEach(async () => {
  await resetDb()
  seed = await seedMinimal()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /api/v1/institutes', () => {
  it('returns only published listings (BR-009)', async () => {
    const res = await testApp().get('/api/v1/institutes')
    expect(res.status).toBe(200)
    const body = instituteListResponse.parse(res.body)
    expect(body.total).toBe(1)
    expect(body.items[0]?.slug).toBe(seed.publishedSlug)
  })

  it('honours pagination defaults', async () => {
    const body = instituteListResponse.parse((await testApp().get('/api/v1/institutes')).body)
    expect(body.page).toBe(1)
    expect(body.limit).toBe(20)
  })

  it('rejects limit above 50 with VALIDATION_FAILED', async () => {
    const res = await testApp().get('/api/v1/institutes?limit=51')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('filters by city slug', async () => {
    const hit = await testApp().get('/api/v1/institutes?city=pune')
    expect(instituteListResponse.parse(hit.body).total).toBe(1)
    const miss = await testApp().get('/api/v1/institutes?city=delhi')
    expect(instituteListResponse.parse(miss.body).total).toBe(0)
  })

  it('filters by exam tag', async () => {
    const hit = await testApp().get('/api/v1/institutes?exam=jee')
    expect(instituteListResponse.parse(hit.body).total).toBe(1)
    const miss = await testApp().get('/api/v1/institutes?exam=cat')
    expect(instituteListResponse.parse(miss.body).total).toBe(0)
  })

  it('filters by mode', async () => {
    const hit = await testApp().get('/api/v1/institutes?mode=OFFLINE')
    expect(instituteListResponse.parse(hit.body).total).toBe(1)
    const miss = await testApp().get('/api/v1/institutes?mode=ONLINE')
    expect(instituteListResponse.parse(miss.body).total).toBe(0)
  })

  it('counts only published batches in batchCount', async () => {
    const body = instituteListResponse.parse((await testApp().get('/api/v1/institutes')).body)
    expect(body.items[0]?.batchCount).toBe(1)
  })
})

describe('GET /api/v1/institutes/:slug', () => {
  it('returns the detail payload', async () => {
    const res = await testApp().get(`/api/v1/institutes/${seed.publishedSlug}`)
    expect(res.status).toBe(200)
    const body = instituteDetail.parse(res.body)
    expect(body.name).toBe('Alpha Academy')
    expect(body.establishedYear).toBe(2011)
  })

  it('404s a draft listing (BR-009)', async () => {
    const res = await testApp().get(`/api/v1/institutes/${seed.draftSlug}`)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('301s an old slug to the canonical one (BR-002)', async () => {
    await prisma.listingRedirect.create({
      data: { oldSlug: 'old-alpha', listingId: seed.publishedListingId },
    })
    const res = await testApp().get('/api/v1/institutes/old-alpha')
    expect(res.status).toBe(301)
    expect(res.headers.location).toBe(`/api/v1/institutes/${seed.publishedSlug}`)
  })
})

describe('GET /api/v1/institutes/:slug/batches', () => {
  it('returns only published batches', async () => {
    const res = await testApp().get(`/api/v1/institutes/${seed.publishedSlug}/batches`)
    expect(res.status).toBe(200)
    const body = batchListResponse.parse(res.body)
    expect(body.items).toHaveLength(1)
    expect(body.items[0]?.title).toBe('JEE 2027')
  })

  it('reports fees as integer minor units (BR-005)', async () => {
    const body = batchListResponse.parse(
      (await testApp().get(`/api/v1/institutes/${seed.publishedSlug}/batches`)).body,
    )
    expect(body.items[0]?.feeAmount).toBe(12500000)
    expect(Number.isInteger(body.items[0]?.feeAmount)).toBe(true)
    expect(body.items[0]?.feeCurrency).toBe('INR')
  })

  it('404s for a draft listing', async () => {
    const res = await testApp().get(`/api/v1/institutes/${seed.draftSlug}/batches`)
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @one/api test institutes.routes
```

Expected: FAIL — all requests 404 because no router is mounted.

- [ ] **Step 3: Implement the batches repository and service**

`apps/api/src/modules/batches/batches.repository.ts`:

```ts
import { prisma } from '@one/db'

export type BatchRow = {
  id: string
  listingId: string
  title: string
  exam: string
  mode: 'ONLINE' | 'OFFLINE' | 'HYBRID'
  startDate: Date
  endDate: Date | null
  scheduleText: string | null
  seatsTotal: number
  seatsAvailable: number
  feeAmount: number
  feeCurrency: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
}

const SELECT = {
  id: true,
  listingId: true,
  title: true,
  exam: true,
  mode: true,
  startDate: true,
  endDate: true,
  scheduleText: true,
  seatsTotal: true,
  seatsAvailable: true,
  feeAmount: true,
  feeCurrency: true,
  status: true,
} as const

export async function listPublishedByListing(listingId: string): Promise<BatchRow[]> {
  return prisma.batch.findMany({
    where: { listingId, status: 'PUBLISHED' },
    orderBy: { startDate: 'asc' },
    select: SELECT,
  })
}

export async function listAllByListing(listingId: string): Promise<BatchRow[]> {
  return prisma.batch.findMany({
    where: { listingId },
    orderBy: { startDate: 'asc' },
    select: SELECT,
  })
}

export async function findById(id: string): Promise<BatchRow | null> {
  return prisma.batch.findUnique({ where: { id }, select: SELECT })
}

export async function create(data: {
  listingId: string
  title: string
  exam: string
  mode: BatchRow['mode']
  startDate: Date
  endDate?: Date
  scheduleText?: string
  seatsTotal: number
  seatsAvailable: number
  feeAmount: number
  feeCurrency: string
}): Promise<BatchRow> {
  return prisma.batch.create({ data, select: SELECT })
}

export async function update(
  id: string,
  data: Partial<Omit<BatchRow, 'id' | 'listingId'>>,
): Promise<BatchRow> {
  return prisma.batch.update({ where: { id }, data, select: SELECT })
}
```

`apps/api/src/modules/batches/batches.service.ts`:

```ts
import type { BatchSummary } from '@one/shared'
import * as repo from './batches.repository.js'

export function toSummary(row: repo.BatchRow): BatchSummary {
  return {
    id: row.id,
    title: row.title,
    exam: row.exam,
    mode: row.mode,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate ? row.endDate.toISOString() : null,
    scheduleText: row.scheduleText,
    seatsTotal: row.seatsTotal,
    seatsAvailable: row.seatsAvailable,
    feeAmount: row.feeAmount,
    feeCurrency: row.feeCurrency,
  }
}

export async function listPublishedForListing(listingId: string): Promise<BatchSummary[]> {
  const rows = await repo.listPublishedByListing(listingId)
  return rows.map(toSummary)
}
```

- [ ] **Step 4: Implement the institutes repository**

`apps/api/src/modules/institutes/institutes.repository.ts`:

```ts
import { prisma } from '@one/db'

export type InstituteRow = {
  id: string
  slug: string
  name: string
  locality: string | null
  shortDescription: string | null
  ratingAvg: number
  ratingCount: number
  publishedAt: Date | null
  city: { slug: string; name: string }
  instituteProfile: {
    modes: ('ONLINE' | 'OFFLINE' | 'HYBRID')[]
    about: string | null
    website: string | null
    establishedYear: number | null
    facultyCount: number | null
  } | null
  tags: { tag: { slug: string; kind: 'EXAM' | 'AMENITY' | 'FACILITY' } }[]
  media: { url: string; alt: string | null }[]
  _count: { batches: number }
}

const SELECT = {
  id: true,
  slug: true,
  name: true,
  locality: true,
  shortDescription: true,
  ratingAvg: true,
  ratingCount: true,
  publishedAt: true,
  city: { select: { slug: true, name: true } },
  instituteProfile: {
    select: {
      modes: true,
      about: true,
      website: true,
      establishedYear: true,
      facultyCount: true,
    },
  },
  tags: { select: { tag: { select: { slug: true, kind: true } } } },
  media: { select: { url: true, alt: true }, orderBy: { sortOrder: 'asc' as const } },
  _count: { select: { batches: { where: { status: 'PUBLISHED' as const } } } },
} as const

export type ListFilters = {
  citySlug?: string
  examSlug?: string
  mode?: 'ONLINE' | 'OFFLINE' | 'HYBRID'
  sort: 'recent' | 'rating' | 'name'
  skip: number
  take: number
}

function where(filters: ListFilters) {
  return {
    vertical: 'INSTITUTE' as const,
    status: 'PUBLISHED' as const,
    ...(filters.citySlug ? { city: { slug: filters.citySlug } } : {}),
    ...(filters.examSlug
      ? { tags: { some: { tag: { slug: filters.examSlug, kind: 'EXAM' as const } } } }
      : {}),
    ...(filters.mode ? { instituteProfile: { modes: { has: filters.mode } } } : {}),
  }
}

const ORDER = {
  recent: { publishedAt: 'desc' as const },
  rating: { ratingAvg: 'desc' as const },
  name: { name: 'asc' as const },
}

export async function listPublished(
  filters: ListFilters,
): Promise<{ rows: InstituteRow[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.listing.findMany({
      where: where(filters),
      orderBy: ORDER[filters.sort],
      skip: filters.skip,
      take: filters.take,
      select: SELECT,
    }),
    prisma.listing.count({ where: where(filters) }),
  ])
  return { rows, total }
}

export async function findPublishedById(id: string): Promise<InstituteRow | null> {
  return prisma.listing.findFirst({
    where: { id, vertical: 'INSTITUTE', status: 'PUBLISHED' },
    select: SELECT,
  })
}
```

- [ ] **Step 5: Implement the institutes service**

`apps/api/src/modules/institutes/institutes.service.ts`:

```ts
import type {
  InstituteDetail,
  InstituteSummary,
  ListInstitutesQuery,
  Paginated,
} from '@one/shared'
import { NotFoundError } from '../../lib/errors.js'
import { resolvePublishedSlug } from '../listings/listings.service.js'
import * as repo from './institutes.repository.js'

function toSummary(row: repo.InstituteRow): InstituteSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    locality: row.locality,
    shortDescription: row.shortDescription,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    modes: row.instituteProfile?.modes ?? [],
    exams: row.tags.filter((entry) => entry.tag.kind === 'EXAM').map((entry) => entry.tag.slug),
    batchCount: row._count.batches,
  }
}

function toDetail(row: repo.InstituteRow): InstituteDetail {
  return {
    ...toSummary(row),
    about: row.instituteProfile?.about ?? null,
    website: row.instituteProfile?.website ?? null,
    establishedYear: row.instituteProfile?.establishedYear ?? null,
    facultyCount: row.instituteProfile?.facultyCount ?? null,
    media: row.media,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  }
}

export async function listPublished(
  query: ListInstitutesQuery,
): Promise<Paginated<InstituteSummary>> {
  const { rows, total } = await repo.listPublished({
    ...(query.city ? { citySlug: query.city } : {}),
    ...(query.exam ? { examSlug: query.exam } : {}),
    ...(query.mode ? { mode: query.mode } : {}),
    sort: query.sort,
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  })

  return { items: rows.map(toSummary), total, page: query.page, limit: query.limit }
}

export async function getPublishedBySlug(slug: string) {
  const resolved = await resolvePublishedSlug(slug)
  const row = await repo.findPublishedById(resolved.listingId)
  if (!row) throw new NotFoundError('Institute not found')

  return {
    detail: toDetail(row),
    canonicalSlug: resolved.canonicalSlug,
    redirected: resolved.redirected,
  }
}

export async function getPublishedListingIdBySlug(slug: string) {
  const resolved = await resolvePublishedSlug(slug)
  return resolved
}
```

- [ ] **Step 6: Implement the routes**

`apps/api/src/modules/institutes/institutes.routes.ts`:

```ts
import { Router } from 'express'
import {
  instituteSlugParam,
  listInstitutesQuery,
  type InstituteSlugParam,
  type ListInstitutesQuery,
} from '@one/shared'
import { validate, validated } from '../../middleware/validate.js'
import * as batches from '../batches/batches.service.js'
import * as institutes from './institutes.service.js'

export const institutesRouter = Router()

institutesRouter.get('/', validate({ query: listInstitutesQuery }), async (req, res) => {
  const query = validated<ListInstitutesQuery>(req, 'query')
  res.json(await institutes.listPublished(query))
})

institutesRouter.get('/:slug', validate({ params: instituteSlugParam }), async (req, res) => {
  const { slug } = validated<InstituteSlugParam>(req, 'params')
  const result = await institutes.getPublishedBySlug(slug)

  if (result.redirected) {
    res.redirect(301, `/api/v1/institutes/${result.canonicalSlug}`)
    return
  }
  res.json(result.detail)
})

institutesRouter.get(
  '/:slug/batches',
  validate({ params: instituteSlugParam }),
  async (req, res) => {
    const { slug } = validated<InstituteSlugParam>(req, 'params')
    const resolved = await institutes.getPublishedListingIdBySlug(slug)
    res.json({ items: await batches.listPublishedForListing(resolved.listingId) })
  },
)
```

- [ ] **Step 7: Mount the router**

In `apps/api/src/server.ts`, replace the `// Routers are mounted here by later tasks.` comment with:

```ts
  app.use('/api/v1/institutes', institutesRouter)
```

and add the import at the top:

```ts
import { institutesRouter } from './modules/institutes/institutes.routes.js'
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
pnpm --filter @one/api test institutes.routes
```

Expected: 13 passing. If the `_count` with a nested `where` is rejected by Prisma 7, compute `batchCount` with a separate `groupBy` on `Batch` keyed by `listingId` filtered to `PUBLISHED`, and merge in the service.

- [ ] **Step 9: Verify boundaries still hold and the full suite is green**

```bash
pnpm --filter @one/api lint && pnpm --filter @one/api typecheck && pnpm --filter @one/api test
```

Expected: all exit 0. The lint run proves `institutes.routes.ts` does not import `@one/db` (R1) and that `institutes.service.ts` reaches `listings` only through its service (R4).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(api): add public institute list, detail and batch endpoints"
```

---

### Task 12: `enquiries` module — lead capture

**Files:**
- Create: `apps/api/src/modules/enquiries/enquiries.repository.ts`, `enquiries.service.ts`, `enquiries.routes.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/src/modules/enquiries/enquiries.routes.test.ts`

**Interfaces:**
- Consumes: `resolvePublishedSlug` (Task 10), `createEnquiryBody`, `enquiryCreatedResponse` (Task 7).
- Produces:
  - `enquiriesRouter` — mounted at `/api/v1/enquiries`
  - `enquiries.service.create(body: CreateEnquiryBody)` → `{ id: string; status: 'NEW' }`
  - `enquiries.service.listForListing(listingId: string)` → `EnquiryRow[]` (used by the partner module in Task 14 per BR-007)

- [ ] **Step 1: Write the failing route test**

`apps/api/src/modules/enquiries/enquiries.routes.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { enquiryCreatedResponse } from '@one/shared'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import { testApp } from '../../../test/helpers/app.js'

let seed: MinimalSeed

beforeEach(async () => {
  await resetDb()
  seed = await seedMinimal()
})

afterAll(async () => {
  await prisma.$disconnect()
})

const valid = () => ({ listingSlug: seed.publishedSlug, name: 'Asha Rao', phone: '9876543210' })

describe('POST /api/v1/enquiries', () => {
  it('creates an enquiry against a published listing', async () => {
    const res = await testApp().post('/api/v1/enquiries').send(valid())
    expect(res.status).toBe(201)
    const body = enquiryCreatedResponse.parse(res.body)
    expect(body.status).toBe('NEW')

    const stored = await prisma.enquiry.findUniqueOrThrow({ where: { id: body.id } })
    expect(stored.listingId).toBe(seed.publishedListingId)
    expect(stored.vertical).toBe('INSTITUTE')
  })

  it('rejects a malformed phone number with VALIDATION_FAILED', async () => {
    const res = await testApp()
      .post('/api/v1/enquiries')
      .send({ ...valid(), phone: '123' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('rejects a missing name', async () => {
    const res = await testApp()
      .post('/api/v1/enquiries')
      .send({ listingSlug: seed.publishedSlug, phone: '9876543210' })
    expect(res.status).toBe(400)
  })

  it('404s an enquiry against a draft listing (BR-009)', async () => {
    const res = await testApp()
      .post('/api/v1/enquiries')
      .send({ ...valid(), listingSlug: seed.draftSlug })
    expect(res.status).toBe(404)
    expect(await prisma.enquiry.count()).toBe(0)
  })

  it('accepts an optional batch id belonging to the listing', async () => {
    const res = await testApp()
      .post('/api/v1/enquiries')
      .send({ ...valid(), batchId: seed.publishedBatchId })
    expect(res.status).toBe(201)
    const stored = await prisma.enquiry.findFirstOrThrow()
    expect(stored.batchId).toBe(seed.publishedBatchId)
  })

  it('rejects a batch id belonging to a different listing', async () => {
    const otherListing = await prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug: 'other-academy',
        name: 'Other',
        status: 'PUBLISHED',
        organizationId: seed.orgId,
        cityId: seed.cityId,
      },
    })
    const foreignBatch = await prisma.batch.create({
      data: {
        listingId: otherListing.id,
        title: 'Foreign',
        exam: 'JEE',
        startDate: new Date('2027-04-01T00:00:00Z'),
        seatsTotal: 10,
        seatsAvailable: 10,
        feeAmount: 1000,
        status: 'PUBLISHED',
      },
    })

    const res = await testApp()
      .post('/api/v1/enquiries')
      .send({ ...valid(), batchId: foreignBatch.id })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @one/api test enquiries.routes
```

Expected: FAIL — route not mounted, requests 404.

- [ ] **Step 3: Implement the repository**

`apps/api/src/modules/enquiries/enquiries.repository.ts`:

```ts
import { prisma } from '@one/db'

export type EnquiryRow = {
  id: string
  listingId: string
  batchId: string | null
  name: string
  phone: string
  email: string | null
  message: string | null
  status: 'NEW' | 'CONTACTED' | 'CONVERTED' | 'CLOSED'
  createdAt: Date
}

const SELECT = {
  id: true,
  listingId: true,
  batchId: true,
  name: true,
  phone: true,
  email: true,
  message: true,
  status: true,
  createdAt: true,
} as const

export async function create(data: {
  listingId: string
  vertical: 'INSTITUTE' | 'HOSTEL'
  batchId?: string
  name: string
  phone: string
  email?: string
  message?: string
}): Promise<EnquiryRow> {
  return prisma.enquiry.create({ data, select: SELECT })
}

export async function listByListing(listingId: string): Promise<EnquiryRow[]> {
  return prisma.enquiry.findMany({
    where: { listingId },
    orderBy: { createdAt: 'desc' },
    select: SELECT,
  })
}

export async function batchBelongsToListing(batchId: string, listingId: string): Promise<boolean> {
  const count = await prisma.batch.count({ where: { id: batchId, listingId } })
  return count === 1
}
```

- [ ] **Step 4: Implement the service**

`apps/api/src/modules/enquiries/enquiries.service.ts`:

```ts
import type { CreateEnquiryBody } from '@one/shared'
import { BadRequestError } from '../../lib/errors.js'
import { resolvePublishedSlug } from '../listings/listings.service.js'
import * as repo from './enquiries.repository.js'

export type { EnquiryRow } from './enquiries.repository.js'

export async function create(body: CreateEnquiryBody) {
  const { listingId } = await resolvePublishedSlug(body.listingSlug)

  if (body.batchId) {
    const belongs = await repo.batchBelongsToListing(body.batchId, listingId)
    if (!belongs) throw new BadRequestError('batchId does not belong to this listing')
  }

  const created = await repo.create({
    listingId,
    vertical: 'INSTITUTE',
    ...(body.batchId ? { batchId: body.batchId } : {}),
    name: body.name,
    phone: body.phone,
    ...(body.email ? { email: body.email } : {}),
    ...(body.message ? { message: body.message } : {}),
  })

  return { id: created.id, status: 'NEW' as const }
}

export async function listForListing(listingId: string) {
  return repo.listByListing(listingId)
}
```

- [ ] **Step 5: Implement the routes with rate limiting**

`apps/api/src/modules/enquiries/enquiries.routes.ts`:

```ts
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { createEnquiryBody, type CreateEnquiryBody, type ErrorEnvelope } from '@one/shared'
import { config } from '../../config/index.js'
import { validate, validated } from '../../middleware/validate.js'
import * as enquiries from './enquiries.service.js'

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.isTest ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    const body: ErrorEnvelope = {
      error: { code: 'RATE_LIMITED', message: 'Too many enquiries. Try again later.' },
    }
    res.status(429).json(body)
  },
})

export const enquiriesRouter = Router()

enquiriesRouter.post('/', limiter, validate({ body: createEnquiryBody }), async (req, res) => {
  const body = validated<CreateEnquiryBody>(req, 'body')
  res.status(201).json(await enquiries.create(body))
})
```

The limit is raised in tests so repeated runs are not throttled; the production value of 10 per hour per IP comes from the spec.

- [ ] **Step 6: Mount the router**

In `apps/api/src/server.ts` add the import and mount:

```ts
import { enquiriesRouter } from './modules/enquiries/enquiries.routes.js'
```

```ts
  app.use('/api/v1/enquiries', enquiriesRouter)
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
pnpm --filter @one/api test enquiries.routes
```

Expected: 6 passing.

- [ ] **Step 8: Verify the rate limiter actually engages**

The limiter is effectively disabled under `NODE_ENV=test`, so verify it against the dev
server instead, where the production limit of 10 per hour applies:

```bash
pnpm --filter @one/api dev &
sleep 4
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:4000/api/v1/enquiries \
    -H 'content-type: application/json' \
    -d '{"listingSlug":"alpha-academy","name":"Load Test","phone":"9876543210"}'
done
echo
kill %1
```

Expected: the first ten return `201`, the remaining return `429`. Restore `limit: config.isTest ? 1000 : 10` afterwards. The dev database must have been seeded (Task 5) for this to return 201s.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(api): add rate-limited enquiry capture"
```

---

### Task 13: Clerk authentication and the account mirror

**Files:**
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/modules/accounts/accounts.repository.ts`, `accounts.service.ts`, `accounts.routes.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/src/modules/accounts/accounts.service.test.ts`, `apps/api/src/middleware/auth.test.ts`

**Interfaces:**
- Consumes: `@clerk/express`, `@one/db`.
- Produces:
  - `requireAuth` — Express middleware populating `req.auth = { userId, orgId, globalRole }`; throws `UnauthenticatedError` when absent
  - `requireOrg` — throws `ForbiddenError` when `req.auth.orgId` is missing
  - `requireAdmin` — throws `ForbiddenError` unless `globalRole === 'ADMIN'`
  - `currentAuth(req)` → `{ userId: string; orgId?: string; globalRole: 'USER' | 'ADMIN' }`
  - `accounts.service.syncUser({ clerkUserId, email, name })` → local `User` id
  - `accounts.service.syncOrganization({ clerkOrgId, name, slug })` → local `Organization` id
  - `accounts.service.resolveLocalOrgId(clerkOrgId: string)` → `string` (throws `ForbiddenError` if unknown)
  - `accountsRouter` — mounted at `/api/v1/webhooks/clerk`

**Decision recorded here:** tests authenticate through an injectable test hook rather than real Clerk tokens. `requireAuth` reads `x-test-auth` **only when `config.isTest`**, so integration tests exercise the real authorization logic without a network dependency on Clerk. This is the one deliberate test seam in the API.

- [ ] **Step 1: Write the failing auth middleware test**

`apps/api/src/middleware/auth.test.ts`:

```ts
import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { errorHandler } from './errorHandler.js'
import { requireAdmin, requireAuth, requireOrg } from './auth.js'

function guarded(...guards: express.RequestHandler[]) {
  const app = express()
  app.use(express.json())
  app.get('/private', ...guards, (req, res) => {
    res.json({ auth: req.auth })
  })
  app.use(errorHandler)
  return app
}

const asUser = JSON.stringify({ userId: 'u1', orgId: 'o1', globalRole: 'USER' })
const asOrgless = JSON.stringify({ userId: 'u1', globalRole: 'USER' })
const asAdmin = JSON.stringify({ userId: 'u2', globalRole: 'ADMIN' })

describe('requireAuth', () => {
  it('401s without credentials', async () => {
    const res = await request(guarded(requireAuth)).get('/private')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('passes with test credentials and exposes req.auth', async () => {
    const res = await request(guarded(requireAuth)).get('/private').set('x-test-auth', asUser)
    expect(res.status).toBe(200)
    expect(res.body.auth).toEqual({ userId: 'u1', orgId: 'o1', globalRole: 'USER' })
  })
})

describe('requireOrg', () => {
  it('403s when no organization is active', async () => {
    const res = await request(guarded(requireAuth, requireOrg))
      .get('/private')
      .set('x-test-auth', asOrgless)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('passes when an organization is active', async () => {
    const res = await request(guarded(requireAuth, requireOrg))
      .get('/private')
      .set('x-test-auth', asUser)
    expect(res.status).toBe(200)
  })
})

describe('requireAdmin (BR-001)', () => {
  it('403s a non-admin', async () => {
    const res = await request(guarded(requireAuth, requireAdmin))
      .get('/private')
      .set('x-test-auth', asUser)
    expect(res.status).toBe(403)
  })

  it('passes an admin', async () => {
    const res = await request(guarded(requireAuth, requireAdmin))
      .get('/private')
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @one/api test auth
```

Expected: FAIL — `./auth.js` cannot be resolved.

- [ ] **Step 3: Implement the auth middleware**

`apps/api/src/middleware/auth.ts`:

```ts
import { getAuth } from '@clerk/express'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { config } from '../config/index.js'
import { ForbiddenError, UnauthenticatedError } from '../lib/errors.js'

export type AuthContext = {
  userId: string
  orgId?: string
  globalRole: 'USER' | 'ADMIN'
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext
  }
}

const testAuthSchema = z.object({
  userId: z.string().min(1),
  orgId: z.string().min(1).optional(),
  globalRole: z.enum(['USER', 'ADMIN']).default('USER'),
})

function readTestAuth(req: Request): AuthContext | null {
  if (!config.isTest) return null
  const header = req.get('x-test-auth')
  if (!header) return null
  const parsed = testAuthSchema.safeParse(JSON.parse(header))
  return parsed.success ? parsed.data : null
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const testAuth = readTestAuth(req)
  if (testAuth) {
    req.auth = testAuth
    next()
    return
  }

  const clerk = getAuth(req)
  if (!clerk?.userId) throw new UnauthenticatedError()

  const role = clerk.sessionClaims?.metadata as { globalRole?: 'USER' | 'ADMIN' } | undefined
  req.auth = {
    userId: clerk.userId,
    ...(clerk.orgId ? { orgId: clerk.orgId } : {}),
    globalRole: role?.globalRole === 'ADMIN' ? 'ADMIN' : 'USER',
  }
  next()
}

export function requireOrg(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw new UnauthenticatedError()
  if (!req.auth.orgId) throw new ForbiddenError('No active organization')
  next()
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw new UnauthenticatedError()
  if (req.auth.globalRole !== 'ADMIN') throw new ForbiddenError('Admin role required')
  next()
}

export function currentAuth(req: Request): AuthContext {
  if (!req.auth) throw new UnauthenticatedError()
  return req.auth
}
```

`getAuth` requires Clerk's `clerkMiddleware()` to have run; it is added to `server.ts` in Step 7. In tests the `x-test-auth` branch returns before `getAuth` is reached.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @one/api test auth
```

Expected: 6 passing. If `getAuth` throws rather than returning null when `clerkMiddleware` has not run, wrap the call in a `try/catch` that rethrows `UnauthenticatedError`.

- [ ] **Step 5: Write the failing accounts service test**

`apps/api/src/modules/accounts/accounts.service.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb } from '../../../test/helpers/db.js'
import { resolveLocalOrgId, syncOrganization, syncUser } from './accounts.service.js'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('syncUser', () => {
  it('creates a local user on first sight', async () => {
    const id = await syncUser({ clerkUserId: 'cu_1', email: 'a@test.local', name: 'A' })
    const user = await prisma.user.findUniqueOrThrow({ where: { id } })
    expect(user.clerkUserId).toBe('cu_1')
  })

  it('is idempotent for the same Clerk id', async () => {
    const first = await syncUser({ clerkUserId: 'cu_1', email: 'a@test.local' })
    const second = await syncUser({ clerkUserId: 'cu_1', email: 'a@test.local', name: 'Renamed' })
    expect(second).toBe(first)
    expect(await prisma.user.count()).toBe(1)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: first } })).name).toBe('Renamed')
  })

  it('links an existing email-only user to a Clerk id', async () => {
    const existing = await prisma.user.create({ data: { email: 'a@test.local' } })
    const id = await syncUser({ clerkUserId: 'cu_1', email: 'a@test.local' })
    expect(id).toBe(existing.id)
  })

  it('never downgrades an existing ADMIN role', async () => {
    const admin = await prisma.user.create({
      data: { email: 'a@test.local', clerkUserId: 'cu_1', globalRole: 'ADMIN' },
    })
    await syncUser({ clerkUserId: 'cu_1', email: 'a@test.local' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).globalRole).toBe(
      'ADMIN',
    )
  })
})

describe('syncOrganization and resolveLocalOrgId', () => {
  it('creates and resolves an organization', async () => {
    const id = await syncOrganization({ clerkOrgId: 'co_1', name: 'Alpha', slug: 'alpha' })
    expect(await resolveLocalOrgId('co_1')).toBe(id)
  })

  it('is idempotent', async () => {
    const first = await syncOrganization({ clerkOrgId: 'co_1', name: 'Alpha', slug: 'alpha' })
    const second = await syncOrganization({ clerkOrgId: 'co_1', name: 'Alpha Renamed', slug: 'alpha' })
    expect(second).toBe(first)
    expect(await prisma.organization.count()).toBe(1)
  })

  it('forbids an unknown Clerk organization', async () => {
    await expect(resolveLocalOrgId('co_missing')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
```

- [ ] **Step 6: Implement the accounts module**

`apps/api/src/modules/accounts/accounts.repository.ts`:

```ts
import { prisma } from '@one/db'

export async function findUserByClerkId(clerkUserId: string) {
  return prisma.user.findUnique({ where: { clerkUserId }, select: { id: true } })
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true } })
}

export async function createUser(data: { clerkUserId: string; email: string; name?: string }) {
  const user = await prisma.user.create({ data, select: { id: true } })
  return user.id
}

export async function updateUser(
  id: string,
  data: { clerkUserId?: string; name?: string | null },
) {
  await prisma.user.update({ where: { id }, data })
}

export async function findOrgByClerkId(clerkOrgId: string) {
  return prisma.organization.findUnique({ where: { clerkOrgId }, select: { id: true } })
}

export async function findOrgBySlug(slug: string) {
  return prisma.organization.findUnique({ where: { slug }, select: { id: true } })
}

export async function createOrg(data: { clerkOrgId: string; name: string; slug: string }) {
  const org = await prisma.organization.create({ data, select: { id: true } })
  return org.id
}

export async function updateOrg(id: string, data: { clerkOrgId?: string; name?: string }) {
  await prisma.organization.update({ where: { id }, data })
}

export async function upsertMembership(data: {
  organizationId: string
  userId: string
  role: 'OWNER' | 'MANAGER' | 'VIEWER'
}) {
  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: data.organizationId, userId: data.userId } },
    create: data,
    update: { role: data.role },
  })
}
```

`apps/api/src/modules/accounts/accounts.service.ts`:

```ts
import { ForbiddenError } from '../../lib/errors.js'
import * as repo from './accounts.repository.js'

export async function syncUser(input: { clerkUserId: string; email: string; name?: string }) {
  const byClerk = await repo.findUserByClerkId(input.clerkUserId)
  if (byClerk) {
    await repo.updateUser(byClerk.id, { name: input.name ?? null })
    return byClerk.id
  }

  const byEmail = await repo.findUserByEmail(input.email)
  if (byEmail) {
    await repo.updateUser(byEmail.id, {
      clerkUserId: input.clerkUserId,
      ...(input.name ? { name: input.name } : {}),
    })
    return byEmail.id
  }

  return repo.createUser({
    clerkUserId: input.clerkUserId,
    email: input.email,
    ...(input.name ? { name: input.name } : {}),
  })
}

export async function syncOrganization(input: {
  clerkOrgId: string
  name: string
  slug: string
}) {
  const byClerk = await repo.findOrgByClerkId(input.clerkOrgId)
  if (byClerk) return byClerk.id

  const bySlug = await repo.findOrgBySlug(input.slug)
  if (bySlug) {
    await repo.updateOrg(bySlug.id, { clerkOrgId: input.clerkOrgId })
    return bySlug.id
  }

  return repo.createOrg(input)
}

export async function resolveLocalOrgId(clerkOrgId: string) {
  const org = await repo.findOrgByClerkId(clerkOrgId)
  if (!org) throw new ForbiddenError('Organization is not provisioned')
  return org.id
}

export async function linkMembership(input: {
  clerkOrgId: string
  clerkUserId: string
  email: string
  role: 'OWNER' | 'MANAGER' | 'VIEWER'
}) {
  const organizationId = await resolveLocalOrgId(input.clerkOrgId)
  const userId = await syncUser({ clerkUserId: input.clerkUserId, email: input.email })
  await repo.upsertMembership({ organizationId, userId, role: input.role })
}
```

`syncUser` deliberately never writes `globalRole`, so an ADMIN can only be granted out of band — matching the spec's rule that no endpoint grants ADMIN.

- [ ] **Step 7: Wire Clerk into the server and add the webhook route**

`apps/api/src/modules/accounts/accounts.routes.ts`:

```ts
import { Router, raw } from 'express'
import { z } from 'zod'
import { config } from '../../config/index.js'
import { logger } from '../../lib/logger.js'
import * as accounts from './accounts.service.js'

const eventSchema = z.object({
  type: z.string(),
  data: z.record(z.string(), z.unknown()),
})

export const accountsRouter = Router()

accountsRouter.post('/clerk', raw({ type: 'application/json' }), async (req, res) => {
  if (!config.clerkWebhookSecret) {
    res.status(503).json({ error: { code: 'INTERNAL', message: 'Webhook not configured' } })
    return
  }

  const parsed = eventSchema.safeParse(JSON.parse(req.body.toString('utf8')))
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Unrecognised payload' } })
    return
  }

  const { type, data } = parsed.data

  if (type === 'user.created' || type === 'user.updated') {
    const emails = data.email_addresses as { email_address: string }[] | undefined
    const email = emails?.[0]?.email_address
    if (email) {
      await accounts.syncUser({
        clerkUserId: String(data.id),
        email,
        ...(data.first_name ? { name: String(data.first_name) } : {}),
      })
    }
  }

  if (type === 'organization.created' || type === 'organization.updated') {
    await accounts.syncOrganization({
      clerkOrgId: String(data.id),
      name: String(data.name),
      slug: String(data.slug ?? data.id),
    })
  }

  logger.info({ type }, 'Clerk webhook processed')
  res.json({ received: true })
})
```

Signature verification with `svix` is intentionally out of scope for P0 and is recorded as a follow-up in Task 21's work queue; the endpoint refuses to operate at all unless `CLERK_WEBHOOK_SECRET` is set, and must not be exposed publicly until verification is added.

In `apps/api/src/server.ts`, add:

```ts
import { clerkMiddleware } from '@clerk/express'
import { accountsRouter } from './modules/accounts/accounts.routes.js'
```

Mount the webhook **before** `express.json()` (it needs the raw body), and add `clerkMiddleware()` after it:

```ts
  app.use('/api/v1/webhooks', accountsRouter)
  app.use(express.json({ limit: '1mb' }))
  if (config.clerkSecretKey) app.use(clerkMiddleware())
```

Reorder `server.ts` accordingly: `requestId` → webhooks → `express.json` → `clerkMiddleware` → CORS → `/health` → routers → `errorHandler`.

- [ ] **Step 8: Run the tests to verify they pass**

```bash
pnpm --filter @one/api test accounts
pnpm --filter @one/api test
```

Expected: 7 accounts tests pass; the whole suite stays green.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(api): add Clerk auth guards and account mirror with webhook sync"
```

---

### Task 14: Partner endpoints

**Files:**
- Create: `apps/api/src/modules/institutes/institutes.partner.routes.ts`
- Create: `apps/api/src/modules/batches/batches.partner.routes.ts`
- Modify: `apps/api/src/modules/institutes/institutes.repository.ts`, `institutes.service.ts`
- Modify: `apps/api/src/modules/batches/batches.service.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/src/modules/institutes/institutes.partner.routes.test.ts`, `apps/api/src/modules/batches/batches.service.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requireOrg`, `currentAuth` (Task 13); `resolveLocalOrgId` (Task 13); `assertOrgOwnsListing`, `submitForReview` (Task 10); partner contracts (Task 7).
- Produces:
  - `partnerInstitutesRouter` — mounted at `/api/v1/partner/listings`
  - `partnerBatchesRouter` — mounted at `/api/v1/partner/batches`
  - `institutes.service.listForOrg(orgId)` → `PartnerListingListResponse`
  - `institutes.service.getForOrg(listingId, orgId)` → `PartnerListingDetail`
  - `institutes.service.updateForOrg(listingId, orgId, body)` → `PartnerListingDetail`
  - `batches.service.createForOrg(listingId, orgId, body)` → `BatchSummary`
  - `batches.service.updateForOrg(batchId, orgId, body)` → `BatchSummary`

- [ ] **Step 1: Write the failing batch service test for BR-003, BR-004, BR-010**

`apps/api/src/modules/batches/batches.service.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import { createForOrg, updateForOrg } from './batches.service.js'

let seed: MinimalSeed

beforeEach(async () => {
  await resetDb()
  seed = await seedMinimal()
})

afterAll(async () => {
  await prisma.$disconnect()
})

const future = new Date('2027-09-01T00:00:00Z')
const past = new Date('2020-01-01T00:00:00Z')

const body = (overrides: Record<string, unknown> = {}) => ({
  title: 'New Batch',
  exam: 'JEE',
  mode: 'ONLINE' as const,
  startDate: future,
  seatsTotal: 30,
  feeAmount: 500000,
  feeCurrency: 'INR',
  ...overrides,
})

describe('createForOrg', () => {
  it('creates a DRAFT batch defaulting seatsAvailable to seatsTotal', async () => {
    const created = await createForOrg(seed.publishedListingId, seed.orgId, body())
    expect(created.seatsAvailable).toBe(30)
    const row = await prisma.batch.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.status).toBe('DRAFT')
  })

  it('forbids creating on another organization\'s listing', async () => {
    await expect(
      createForOrg(seed.publishedListingId, seed.otherOrgId, body()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects seatsAvailable above seatsTotal (BR-010)', async () => {
    await expect(
      createForOrg(seed.publishedListingId, seed.orgId, body({ seatsAvailable: 31 })),
    ).rejects.toMatchObject({ code: 'SEATS_OUT_OF_RANGE' })
  })
})

describe('updateForOrg publishing rules', () => {
  it('refuses to publish a batch starting in the past (BR-003)', async () => {
    const created = await createForOrg(seed.publishedListingId, seed.orgId, body({ startDate: past }))
    await expect(
      updateForOrg(created.id, seed.orgId, { status: 'PUBLISHED' }),
    ).rejects.toMatchObject({ code: 'BATCH_START_DATE_PAST' })
  })

  it('refuses to publish when the parent listing is not PUBLISHED (BR-004)', async () => {
    const created = await createForOrg(seed.draftListingId, seed.orgId, body())
    await expect(
      updateForOrg(created.id, seed.orgId, { status: 'PUBLISHED' }),
    ).rejects.toMatchObject({ code: 'BATCH_PARENT_NOT_PUBLISHED' })
  })

  it('publishes a future batch on a published listing', async () => {
    const created = await createForOrg(seed.publishedListingId, seed.orgId, body())
    await updateForOrg(created.id, seed.orgId, { status: 'PUBLISHED' })
    const row = await prisma.batch.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.status).toBe('PUBLISHED')
  })

  it('rejects an update that would break the seats invariant (BR-010)', async () => {
    const created = await createForOrg(seed.publishedListingId, seed.orgId, body())
    await expect(
      updateForOrg(created.id, seed.orgId, { seatsTotal: 10 }),
    ).rejects.toMatchObject({ code: 'SEATS_OUT_OF_RANGE' })
  })

  it('forbids updating another organization\'s batch', async () => {
    await expect(
      updateForOrg(seed.publishedBatchId, seed.otherOrgId, { title: 'Hijacked' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
```

The last BR-010 case is the subtle one: lowering `seatsTotal` below the existing `seatsAvailable` must be rejected, not silently clamped.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @one/api test batches.service
```

Expected: FAIL — `createForOrg` is not exported.

- [ ] **Step 3: Extend the batches service**

Append to `apps/api/src/modules/batches/batches.service.ts`:

```ts
import type { BatchSummary, CreateBatchBody, UpdateBatchBody } from '@one/shared'
import { ConflictError, NotFoundError } from '../../lib/errors.js'
import { assertOrgOwnsListing, isPublished } from '../listings/listings.service.js'

function assertSeats(seatsTotal: number, seatsAvailable: number) {
  if (seatsAvailable < 0 || seatsAvailable > seatsTotal) {
    throw new ConflictError(
      'SEATS_OUT_OF_RANGE',
      `seatsAvailable (${seatsAvailable}) must be between 0 and seatsTotal (${seatsTotal})`,
    )
  }
}

export async function createForOrg(
  listingId: string,
  organizationId: string,
  body: CreateBatchBody,
): Promise<BatchSummary> {
  await assertOrgOwnsListing(listingId, organizationId)

  const seatsAvailable = body.seatsAvailable ?? body.seatsTotal
  assertSeats(body.seatsTotal, seatsAvailable)

  const created = await repo.create({
    listingId,
    title: body.title,
    exam: body.exam,
    mode: body.mode,
    startDate: body.startDate,
    ...(body.endDate ? { endDate: body.endDate } : {}),
    ...(body.scheduleText ? { scheduleText: body.scheduleText } : {}),
    seatsTotal: body.seatsTotal,
    seatsAvailable,
    feeAmount: body.feeAmount,
    feeCurrency: body.feeCurrency,
  })

  return toSummary(created)
}

export async function updateForOrg(
  batchId: string,
  organizationId: string,
  body: UpdateBatchBody,
): Promise<BatchSummary> {
  const existing = await repo.findById(batchId)
  if (!existing) throw new NotFoundError('Batch not found')
  await assertOrgOwnsListing(existing.listingId, organizationId)

  const seatsTotal = body.seatsTotal ?? existing.seatsTotal
  const seatsAvailable = body.seatsAvailable ?? existing.seatsAvailable
  assertSeats(seatsTotal, seatsAvailable)

  if (body.status === 'PUBLISHED') {
    const startDate = body.startDate ?? existing.startDate
    if (startDate.getTime() < Date.now()) {
      throw new ConflictError('BATCH_START_DATE_PAST', 'A batch starting in the past cannot be published')
    }
    if (!(await isPublished(existing.listingId))) {
      throw new ConflictError(
        'BATCH_PARENT_NOT_PUBLISHED',
        'The parent listing must be PUBLISHED before a batch can be published',
      )
    }
  }

  const updated = await repo.update(batchId, {
    ...(body.title ? { title: body.title } : {}),
    ...(body.exam ? { exam: body.exam } : {}),
    ...(body.mode ? { mode: body.mode } : {}),
    ...(body.startDate ? { startDate: body.startDate } : {}),
    ...(body.endDate ? { endDate: body.endDate } : {}),
    ...(body.scheduleText ? { scheduleText: body.scheduleText } : {}),
    ...(body.seatsTotal !== undefined ? { seatsTotal: body.seatsTotal } : {}),
    ...(body.seatsAvailable !== undefined ? { seatsAvailable: body.seatsAvailable } : {}),
    ...(body.feeAmount !== undefined ? { feeAmount: body.feeAmount } : {}),
    ...(body.status ? { status: body.status } : {}),
  })

  return toSummary(updated)
}

export async function listAllForListing(listingId: string) {
  const rows = await repo.listAllByListing(listingId)
  return rows.map((row) => ({ ...toSummary(row), status: row.status }))
}
```

Move the existing `import * as repo` and `toSummary` above these additions if they are not already at the top of the file.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @one/api test batches.service
```

Expected: 8 passing.

- [ ] **Step 5: Write the failing partner route test**

`apps/api/src/modules/institutes/institutes.partner.routes.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { partnerListingDetail, partnerListingListResponse } from '@one/shared'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import { testApp } from '../../../test/helpers/app.js'

let seed: MinimalSeed

beforeEach(async () => {
  await resetDb()
  seed = await seedMinimal()
  await prisma.organization.update({
    where: { id: seed.orgId },
    data: { clerkOrgId: 'co_alpha' },
  })
  await prisma.organization.update({
    where: { id: seed.otherOrgId },
    data: { clerkOrgId: 'co_beta' },
  })
})

afterAll(async () => {
  await prisma.$disconnect()
})

const auth = (orgId: string, globalRole: 'USER' | 'ADMIN' = 'USER') =>
  JSON.stringify({ userId: 'u1', orgId, globalRole })

describe('GET /api/v1/partner/listings', () => {
  it('401s without authentication', async () => {
    const res = await testApp().get('/api/v1/partner/listings')
    expect(res.status).toBe(401)
  })

  it('403s when no organization is active', async () => {
    const res = await testApp()
      .get('/api/v1/partner/listings')
      .set('x-test-auth', JSON.stringify({ userId: 'u1', globalRole: 'USER' }))
    expect(res.status).toBe(403)
  })

  it('returns both draft and published listings for the active organization', async () => {
    const res = await testApp().get('/api/v1/partner/listings').set('x-test-auth', auth('co_alpha'))
    expect(res.status).toBe(200)
    const body = partnerListingListResponse.parse(res.body)
    expect(body.items).toHaveLength(2)
    expect(body.items.map((item) => item.status).sort()).toEqual(['DRAFT', 'PUBLISHED'])
  })

  it('returns nothing for an organization that owns no listings', async () => {
    const res = await testApp().get('/api/v1/partner/listings').set('x-test-auth', auth('co_beta'))
    expect(partnerListingListResponse.parse(res.body).items).toHaveLength(0)
  })

  it('403s for an organization that is not provisioned locally', async () => {
    const res = await testApp()
      .get('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_unknown'))
    expect(res.status).toBe(403)
  })
})

describe('GET /api/v1/partner/listings/:listingId', () => {
  it('returns the listing with all batches, including drafts', async () => {
    const res = await testApp()
      .get(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_alpha'))
    expect(res.status).toBe(200)
    const body = partnerListingDetail.parse(res.body)
    expect(body.batches).toHaveLength(2)
  })

  it('403s another organization', async () => {
    const res = await testApp()
      .get(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_beta'))
    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/v1/partner/listings/:listingId', () => {
  it('updates the description', async () => {
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ shortDescription: 'Updated copy' })
    expect(res.status).toBe(200)
    expect(partnerListingDetail.parse(res.body).shortDescription).toBe('Updated copy')
  })

  it('400s an empty patch body', async () => {
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({})
    expect(res.status).toBe(400)
  })

  it('403s another organization', async () => {
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_beta'))
      .send({ shortDescription: 'Hijack' })
    expect(res.status).toBe(403)
  })
})

describe('POST /api/v1/partner/listings/:listingId/batches', () => {
  it('creates a batch', async () => {
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.draftListingId}/batches`)
      .set('x-test-auth', auth('co_alpha'))
      .send({
        title: 'NEET 2028',
        exam: 'NEET',
        mode: 'ONLINE',
        startDate: '2028-01-10',
        seatsTotal: 25,
        feeAmount: 750000,
      })
    expect(res.status).toBe(201)
    expect(await prisma.batch.count({ where: { listingId: seed.draftListingId } })).toBe(1)
  })

  it('400s a non-integer fee (BR-005)', async () => {
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.draftListingId}/batches`)
      .set('x-test-auth', auth('co_alpha'))
      .send({
        title: 'Bad fee',
        exam: 'NEET',
        mode: 'ONLINE',
        startDate: '2028-01-10',
        seatsTotal: 25,
        feeAmount: 7500.5,
      })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/partner/listings/:listingId/submit', () => {
  it('moves a draft to PENDING_REVIEW', async () => {
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.draftListingId}/submit`)
      .set('x-test-auth', auth('co_alpha'))
    expect(res.status).toBe(200)
    expect(partnerListingDetail.parse(res.body).status).toBe('PENDING_REVIEW')
  })

  it('409s an already published listing', async () => {
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.publishedListingId}/submit`)
      .set('x-test-auth', auth('co_alpha'))
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION')
  })
})
```

- [ ] **Step 6: Extend the institutes repository and service for partner reads**

Append to `apps/api/src/modules/institutes/institutes.repository.ts`:

```ts
export type PartnerListingRow = {
  id: string
  slug: string
  name: string
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'SUSPENDED'
  shortDescription: string | null
  updatedAt: Date
  city: { name: string }
  instituteProfile: { about: string | null; website: string | null } | null
  _count: { batches: number }
}

const PARTNER_SELECT = {
  id: true,
  slug: true,
  name: true,
  status: true,
  shortDescription: true,
  updatedAt: true,
  city: { select: { name: true } },
  instituteProfile: { select: { about: true, website: true } },
  _count: { select: { batches: true } },
} as const

export async function listByOrg(organizationId: string): Promise<PartnerListingRow[]> {
  return prisma.listing.findMany({
    where: { organizationId, vertical: 'INSTITUTE' },
    orderBy: { updatedAt: 'desc' },
    select: PARTNER_SELECT,
  })
}

export async function findByIdForPartner(id: string): Promise<PartnerListingRow | null> {
  return prisma.listing.findUnique({ where: { id }, select: PARTNER_SELECT })
}

export async function updateListingAndProfile(
  id: string,
  listing: { name?: string; shortDescription?: string; locality?: string },
  profile: {
    about?: string
    website?: string
    establishedYear?: number
    facultyCount?: number
    modes?: ('ONLINE' | 'OFFLINE' | 'HYBRID')[]
  },
): Promise<void> {
  await prisma.listing.update({
    where: { id },
    data: {
      ...listing,
      ...(Object.keys(profile).length > 0
        ? { instituteProfile: { upsert: { create: profile, update: profile } } }
        : {}),
    },
  })
}
```

Append to `apps/api/src/modules/institutes/institutes.service.ts`:

```ts
import type {
  PartnerListingDetail,
  PartnerListingListResponse,
  PartnerListingSummary,
  UpdateListingBody,
} from '@one/shared'
import { assertOrgOwnsListing } from '../listings/listings.service.js'
import * as batchesService from '../batches/batches.service.js'

function toPartnerSummary(row: repo.PartnerListingRow): PartnerListingSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    cityName: row.city.name,
    batchCount: row._count.batches,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listForOrg(organizationId: string): Promise<PartnerListingListResponse> {
  const rows = await repo.listByOrg(organizationId)
  return { items: rows.map(toPartnerSummary) }
}

export async function getForOrg(
  listingId: string,
  organizationId: string,
): Promise<PartnerListingDetail> {
  await assertOrgOwnsListing(listingId, organizationId)
  const row = await repo.findByIdForPartner(listingId)
  if (!row) throw new NotFoundError('Listing not found')

  return {
    ...toPartnerSummary(row),
    shortDescription: row.shortDescription,
    about: row.instituteProfile?.about ?? null,
    website: row.instituteProfile?.website ?? null,
    batches: await batchesService.listAllForListing(listingId),
  }
}

export async function updateForOrg(
  listingId: string,
  organizationId: string,
  body: UpdateListingBody,
): Promise<PartnerListingDetail> {
  await assertOrgOwnsListing(listingId, organizationId)

  await repo.updateListingAndProfile(
    listingId,
    {
      ...(body.name ? { name: body.name } : {}),
      ...(body.shortDescription !== undefined ? { shortDescription: body.shortDescription } : {}),
      ...(body.locality !== undefined ? { locality: body.locality } : {}),
    },
    {
      ...(body.about !== undefined ? { about: body.about } : {}),
      ...(body.website !== undefined ? { website: body.website } : {}),
      ...(body.establishedYear !== undefined ? { establishedYear: body.establishedYear } : {}),
      ...(body.facultyCount !== undefined ? { facultyCount: body.facultyCount } : {}),
      ...(body.modes !== undefined ? { modes: body.modes } : {}),
    },
  )

  return getForOrg(listingId, organizationId)
}
```

- [ ] **Step 7: Implement the partner routes**

`apps/api/src/modules/institutes/institutes.partner.routes.ts`:

```ts
import { Router } from 'express'
import {
  createBatchBody,
  listingIdParam,
  updateListingBody,
  type CreateBatchBody,
  type ListingIdParam,
  type UpdateListingBody,
} from '@one/shared'
import { currentAuth, requireAuth, requireOrg } from '../../middleware/auth.js'
import { validate, validated } from '../../middleware/validate.js'
import * as accounts from '../accounts/accounts.service.js'
import * as batches from '../batches/batches.service.js'
import { submitForReview } from '../listings/listings.service.js'
import * as institutes from './institutes.service.js'

export const partnerInstitutesRouter = Router()

partnerInstitutesRouter.use(requireAuth, requireOrg)

async function orgIdFor(req: Parameters<typeof currentAuth>[0]) {
  const auth = currentAuth(req)
  return accounts.resolveLocalOrgId(auth.orgId as string)
}

partnerInstitutesRouter.get('/', async (req, res) => {
  res.json(await institutes.listForOrg(await orgIdFor(req)))
})

partnerInstitutesRouter.get('/:listingId', validate({ params: listingIdParam }), async (req, res) => {
  const { listingId } = validated<ListingIdParam>(req, 'params')
  res.json(await institutes.getForOrg(listingId, await orgIdFor(req)))
})

partnerInstitutesRouter.patch(
  '/:listingId',
  validate({ params: listingIdParam, body: updateListingBody }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    const body = validated<UpdateListingBody>(req, 'body')
    res.json(await institutes.updateForOrg(listingId, await orgIdFor(req), body))
  },
)

partnerInstitutesRouter.post(
  '/:listingId/batches',
  validate({ params: listingIdParam, body: createBatchBody }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    const body = validated<CreateBatchBody>(req, 'body')
    res.status(201).json(await batches.createForOrg(listingId, await orgIdFor(req), body))
  },
)

partnerInstitutesRouter.post(
  '/:listingId/submit',
  validate({ params: listingIdParam }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    const organizationId = await orgIdFor(req)
    await institutes.getForOrg(listingId, organizationId)
    await submitForReview(listingId)
    res.json(await institutes.getForOrg(listingId, organizationId))
  },
)
```

`apps/api/src/modules/batches/batches.partner.routes.ts`:

```ts
import { Router } from 'express'
import { batchIdParam, updateBatchBody, type BatchIdParam, type UpdateBatchBody } from '@one/shared'
import { currentAuth, requireAuth, requireOrg } from '../../middleware/auth.js'
import { validate, validated } from '../../middleware/validate.js'
import * as accounts from '../accounts/accounts.service.js'
import * as batches from './batches.service.js'

export const partnerBatchesRouter = Router()

partnerBatchesRouter.use(requireAuth, requireOrg)

partnerBatchesRouter.patch(
  '/:batchId',
  validate({ params: batchIdParam, body: updateBatchBody }),
  async (req, res) => {
    const { batchId } = validated<BatchIdParam>(req, 'params')
    const body = validated<UpdateBatchBody>(req, 'body')
    const auth = currentAuth(req)
    const organizationId = await accounts.resolveLocalOrgId(auth.orgId as string)
    res.json(await batches.updateForOrg(batchId, organizationId, body))
  },
)
```

Mount both in `server.ts`:

```ts
import { partnerInstitutesRouter } from './modules/institutes/institutes.partner.routes.js'
import { partnerBatchesRouter } from './modules/batches/batches.partner.routes.js'
```

```ts
  app.use('/api/v1/partner/listings', partnerInstitutesRouter)
  app.use('/api/v1/partner/batches', partnerBatchesRouter)
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
pnpm --filter @one/api test institutes.partner
```

Expected: 12 passing. The `orgIdFor` helper translating a Clerk org id to the local id is what makes the "not provisioned locally" case a 403 rather than a crash.

- [ ] **Step 9: Verify the whole suite and the boundary rules**

```bash
pnpm --filter @one/api lint && pnpm --filter @one/api typecheck && pnpm --filter @one/api test
```

Expected: all green. R4 is now genuinely exercised — `institutes.service.ts` imports `batches.service.ts`, never `batches.repository.ts`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(api): add partner listing and batch management with ownership checks"
```

---

### Task 15: Admin moderation endpoints

**Files:**
- Create: `apps/api/src/modules/listings/listings.admin.routes.ts`
- Modify: `apps/api/src/modules/listings/listings.repository.ts`, `listings.service.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/src/modules/listings/listings.admin.routes.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requireAdmin` (Task 13); `publish` (Task 10); `adminListingQueueQuery`, `adminListingSummary` (Task 7).
- Produces:
  - `adminListingsRouter` — mounted at `/api/v1/admin/listings`
  - `listings.service.listForModeration(query)` → `Paginated<AdminListingSummary>`
  - `listings.service.publishAsAdmin(listingId)` → `AdminListingSummary`

- [ ] **Step 1: Write the failing admin route test**

`apps/api/src/modules/listings/listings.admin.routes.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { adminListingQueueResponse, adminListingSummary } from '@one/shared'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import { testApp } from '../../../test/helpers/app.js'

let seed: MinimalSeed

beforeEach(async () => {
  await resetDb()
  seed = await seedMinimal()
})

afterAll(async () => {
  await prisma.$disconnect()
})

const asAdmin = JSON.stringify({ userId: 'u-admin', globalRole: 'ADMIN' })
const asUser = JSON.stringify({ userId: 'u-user', orgId: 'co_alpha', globalRole: 'USER' })

describe('GET /api/v1/admin/listings (BR-001)', () => {
  it('401s anonymously', async () => {
    expect((await testApp().get('/api/v1/admin/listings')).status).toBe(401)
  })

  it('403s a non-admin', async () => {
    const res = await testApp().get('/api/v1/admin/listings').set('x-test-auth', asUser)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('defaults to the PENDING_REVIEW queue', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })
    const res = await testApp().get('/api/v1/admin/listings').set('x-test-auth', asAdmin)
    expect(res.status).toBe(200)
    const body = adminListingQueueResponse.parse(res.body)
    expect(body.total).toBe(1)
    expect(body.items[0]?.id).toBe(seed.draftListingId)
    expect(body.items[0]?.organizationName).toBe('Alpha')
  })

  it('filters by an explicit status', async () => {
    const res = await testApp()
      .get('/api/v1/admin/listings?status=PUBLISHED')
      .set('x-test-auth', asAdmin)
    const body = adminListingQueueResponse.parse(res.body)
    expect(body.total).toBe(1)
    expect(body.items[0]?.id).toBe(seed.publishedListingId)
  })

  it('rejects an unknown status', async () => {
    const res = await testApp()
      .get('/api/v1/admin/listings?status=NOPE')
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/admin/listings/:listingId/publish (BR-001)', () => {
  it('403s a non-admin', async () => {
    const res = await testApp()
      .post(`/api/v1/admin/listings/${seed.draftListingId}/publish`)
      .set('x-test-auth', asUser)
    expect(res.status).toBe(403)
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(listing.status).toBe('DRAFT')
  })

  it('publishes a pending listing and stamps publishedAt', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })
    const res = await testApp()
      .post(`/api/v1/admin/listings/${seed.draftListingId}/publish`)
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(200)
    expect(adminListingSummary.parse(res.body).status).toBe('PUBLISHED')

    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(listing.publishedAt).toBeInstanceOf(Date)
  })

  it('409s an already published listing', async () => {
    const res = await testApp()
      .post(`/api/v1/admin/listings/${seed.publishedListingId}/publish`)
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it('404s an unknown listing', async () => {
    const res = await testApp()
      .post('/api/v1/admin/listings/missing/publish')
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(404)
  })

  it('makes the newly published listing visible on the public endpoint', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })
    await testApp()
      .post(`/api/v1/admin/listings/${seed.draftListingId}/publish`)
      .set('x-test-auth', asAdmin)

    const publicRes = await testApp().get(`/api/v1/institutes/${seed.draftSlug}`)
    expect(publicRes.status).toBe(200)
  })
})
```

The final test is the P0 acceptance criterion in miniature: moderation genuinely gates public visibility.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @one/api test listings.admin
```

Expected: FAIL — router not mounted.

- [ ] **Step 3: Extend the listings repository**

Append to `apps/api/src/modules/listings/listings.repository.ts`:

```ts
export type ModerationRow = {
  id: string
  slug: string
  name: string
  status: ListingCore['status']
  updatedAt: Date
  organization: { name: string }
  city: { name: string }
}

const MODERATION_SELECT = {
  id: true,
  slug: true,
  name: true,
  status: true,
  updatedAt: true,
  organization: { select: { name: true } },
  city: { select: { name: true } },
} as const

export async function listByStatus(
  status: ListingCore['status'],
  skip: number,
  take: number,
): Promise<{ rows: ModerationRow[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.listing.findMany({
      where: { status },
      orderBy: { updatedAt: 'asc' },
      skip,
      take,
      select: MODERATION_SELECT,
    }),
    prisma.listing.count({ where: { status } }),
  ])
  return { rows, total }
}

export async function findModerationRow(id: string): Promise<ModerationRow | null> {
  return prisma.listing.findUnique({ where: { id }, select: MODERATION_SELECT })
}
```

- [ ] **Step 4: Extend the listings service**

Append to `apps/api/src/modules/listings/listings.service.ts`:

```ts
import type { AdminListingQueueQuery, AdminListingSummary, Paginated } from '@one/shared'

function toAdminSummary(row: repo.ModerationRow): AdminListingSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    organizationName: row.organization.name,
    cityName: row.city.name,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listForModeration(
  query: AdminListingQueueQuery,
): Promise<Paginated<AdminListingSummary>> {
  const { rows, total } = await repo.listByStatus(
    query.status,
    (query.page - 1) * query.limit,
    query.limit,
  )
  return { items: rows.map(toAdminSummary), total, page: query.page, limit: query.limit }
}

export async function publishAsAdmin(listingId: string): Promise<AdminListingSummary> {
  await publish(listingId)
  const row = await repo.findModerationRow(listingId)
  if (!row) throw new NotFoundError('Listing not found')
  return toAdminSummary(row)
}
```

- [ ] **Step 5: Implement the admin routes**

`apps/api/src/modules/listings/listings.admin.routes.ts`:

```ts
import { Router } from 'express'
import {
  adminListingQueueQuery,
  listingIdParam,
  type AdminListingQueueQuery,
  type ListingIdParam,
} from '@one/shared'
import { requireAdmin, requireAuth } from '../../middleware/auth.js'
import { validate, validated } from '../../middleware/validate.js'
import * as listings from './listings.service.js'

export const adminListingsRouter = Router()

adminListingsRouter.use(requireAuth, requireAdmin)

adminListingsRouter.get('/', validate({ query: adminListingQueueQuery }), async (req, res) => {
  const query = validated<AdminListingQueueQuery>(req, 'query')
  res.json(await listings.listForModeration(query))
})

adminListingsRouter.post(
  '/:listingId/publish',
  validate({ params: listingIdParam }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    res.json(await listings.publishAsAdmin(listingId))
  },
)
```

Mount in `server.ts`:

```ts
import { adminListingsRouter } from './modules/listings/listings.admin.routes.js'
```

```ts
  app.use('/api/v1/admin/listings', adminListingsRouter)
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm --filter @one/api test listings.admin
```

Expected: 10 passing.

- [ ] **Step 7: Verify the backend is complete**

```bash
pnpm --filter @one/api lint && pnpm --filter @one/api typecheck && pnpm --filter @one/api test
pnpm --filter @one/shared gen:openapi && git diff --stat -- docs/api/openapi.json
```

Expected: full suite green; the OpenAPI document regenerates with no diff, proving every implemented route matches its registered contract.

**Phase D checkpoint.** All ten §9 endpoints are implemented and integration-tested against real Postgres. This is the first independently reviewable deliverable: the API is complete with no UI.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): add admin moderation queue and publish endpoint"
```

---

### Task 16: `packages/ui` and `apps/web` skeleton with the typed API client

**Files:**
- Create: `packages/ui/package.json`, `src/index.ts`, `src/styles.css`, `src/Badge.tsx`, `src/Card.tsx`
- Create: `apps/web/package.json`, `tsconfig.json`, `eslint.config.js`, `next.config.ts`, `.env.local`, `.env.example`
- Create: `apps/web/src/lib/api.ts`, `src/lib/format.ts`
- Create: `apps/web/src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/institutes/page.tsx`
- Test: `apps/web/src/lib/format.test.ts`

**Interfaces:**
- Consumes: `@one/shared` contracts.
- Produces:
  - `apiGet<T>(path: string, schema: ZodType<T>, init?: RequestInit)` → `Promise<T>`; throws `ApiError` with `{ status, code, message }`
  - `apiPost<T>(path, body, schema)` → `Promise<T>`
  - `formatFee(minorUnits: number, currency: string)` → `string` (e.g. `₹1,25,000`)
  - `formatDateRange(startIso: string, endIso: string | null)` → `string`
  - `@one/ui` exporting `Badge`, `Card`

- [ ] **Step 1: Create `packages/ui`**

`packages/ui/package.json`:

```json
{
  "name": "@one/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./styles.css": "./src/styles.css" },
  "scripts": {
    "build": "echo no-op",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "echo no-op"
  },
  "peerDependencies": { "react": "catalog:" },
  "devDependencies": {
    "@one/config": "workspace:*",
    "@types/react": "catalog:",
    "react": "catalog:",
    "tailwindcss": "catalog:",
    "typescript": "catalog:"
  }
}
```

`packages/ui/tsconfig.json`:

```json
{ "extends": "@one/config/tsconfig.react", "include": ["src"] }
```

`packages/ui/eslint.config.js`:

```js
import base from '@one/config/eslint/base'

export default base
```

`packages/ui/src/styles.css`:

```css
@import 'tailwindcss';

@theme {
  --color-brand-50: oklch(0.97 0.02 250);
  --color-brand-500: oklch(0.58 0.16 250);
  --color-brand-700: oklch(0.44 0.15 250);
}
```

Tailwind 4 is CSS-first: no `tailwind.config.js` exists anywhere in this repo.

`packages/ui/src/Badge.tsx`:

```tsx
import type { ReactNode } from 'react'

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
      {children}
    </span>
  )
}
```

`packages/ui/src/Card.tsx`:

```tsx
import type { ReactNode } from 'react'

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">{children}</div>
  )
}
```

`packages/ui/src/index.ts`:

```ts
export { Badge } from './Badge.js'
export { Card } from './Card.js'
```

- [ ] **Step 2: Create `apps/web`**

`apps/web/package.json`:

```json
{
  "name": "@one/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@one/shared": "workspace:*",
    "@one/ui": "workspace:*",
    "next": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@one/config": "workspace:*",
    "@types/node": "24.9.2",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "tailwindcss": "catalog:",
    "@tailwindcss/postcss": "4.3.3",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "@one/config/tsconfig.react",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] },
    "baseUrl": "."
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"]
}
```

`apps/web/eslint.config.js`:

```js
import next from '@one/config/eslint/next'

export default [...next, { ignores: ['.next/**'] }]
```

`apps/web/next.config.ts`:

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@one/ui', '@one/shared'],
}

export default config
```

`apps/web/postcss.config.mjs`:

```js
export default { plugins: { '@tailwindcss/postcss': {} } }
```

`apps/web/.env.example` and `.env.local`:

```
API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

`apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } })
```

- [ ] **Step 3: Write the failing formatter test**

`apps/web/src/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatDateRange, formatFee } from './format.js'

describe('formatFee (BR-005)', () => {
  it('renders minor units as rupees with Indian grouping', () => {
    expect(formatFee(12500000, 'INR')).toBe('₹1,25,000')
  })

  it('renders zero', () => {
    expect(formatFee(0, 'INR')).toBe('₹0')
  })

  it('drops paise when they are zero but keeps the value exact', () => {
    expect(formatFee(99900, 'INR')).toBe('₹999')
  })
})

describe('formatDateRange', () => {
  it('renders a start and end date', () => {
    expect(formatDateRange('2027-04-01T00:00:00Z', '2027-12-20T00:00:00Z')).toBe(
      '1 Apr 2027 – 20 Dec 2027',
    )
  })

  it('renders an open-ended range', () => {
    expect(formatDateRange('2027-04-01T00:00:00Z', null)).toBe('From 1 Apr 2027')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
pnpm install
pnpm --filter @one/web test
```

Expected: FAIL — `./format.js` cannot be resolved.

- [ ] **Step 5: Implement the formatters and API client**

`apps/web/src/lib/format.ts`:

```ts
const FEE_FORMAT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export function formatFee(minorUnits: number, currency: string): string {
  const major = minorUnits / 100
  if (currency !== 'INR') return `${currency} ${major.toLocaleString('en-IN')}`
  return FEE_FORMAT.format(major).replace(/ /g, '')
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatDateRange(startIso: string, endIso: string | null): string {
  const start = DATE_FORMAT.format(new Date(startIso))
  if (!endIso) return `From ${start}`
  return `${start} – ${DATE_FORMAT.format(new Date(endIso))}`
}
```

If `formatFee` returns `₹1,25,000` with a different separator or a trailing `.00`, adjust `maximumFractionDigits` and the replace until the test passes — do not change the test's expectation.

`apps/web/src/lib/api.ts`:

```ts
import { errorEnvelope, type ErrorCode } from '@one/shared'
import type { ZodType } from 'zod'

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'UNKNOWN',
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const parsed = errorEnvelope.safeParse(await response.json())
    if (parsed.success) {
      return new ApiError(response.status, parsed.data.error.code, parsed.data.error.message)
    }
  } catch {
    // fall through to the generic error below
  }
  return new ApiError(response.status, 'UNKNOWN', `Request failed with ${response.status}`)
}

export async function apiGet<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  })
  if (!response.ok) throw await toApiError(response)
  return schema.parse(await response.json())
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  schema: ZodType<T>,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await toApiError(response)
  return schema.parse(await response.json())
}
```

Parsing every response with the shared schema is the point: a contract violation fails loudly here instead of surfacing as `undefined` deep in a component.

- [ ] **Step 6: Create the shell and the institutes index page**

`apps/web/src/app/globals.css`:

```css
@import '@one/ui/styles.css';
```

`apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'One Academy', template: '%s | One Academy' },
  description: 'Compare coaching institutes, batches and fees across India.',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <header className="border-b border-gray-200 bg-white">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4">
            <a href="/" className="text-lg font-semibold text-brand-700">
              One Academy
            </a>
            <a href="/institutes" className="text-sm text-gray-600 hover:text-gray-900">
              Institutes
            </a>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  )
}
```

`apps/web/src/app/page.tsx`:

```tsx
import Link from 'next/link'

export default function HomePage() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold">Find the right coaching institute</h1>
      <p className="max-w-2xl text-gray-600">
        Browse institutes, compare upcoming batches, fees and schedules in one place.
      </p>
      <Link
        href="/institutes"
        className="inline-block rounded-md bg-brand-500 px-4 py-2 text-white hover:bg-brand-700"
      >
        Browse institutes
      </Link>
    </section>
  )
}
```

`apps/web/src/app/institutes/page.tsx`:

```tsx
import Link from 'next/link'
import { Badge, Card } from '@one/ui'
import { instituteListResponse, listInstitutesQuery } from '@one/shared'
import { apiGet } from '@/lib/api'

export const revalidate = 300

export const metadata = {
  title: 'Coaching institutes',
  description: 'Browse coaching institutes with upcoming batches.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function InstitutesPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const parsed = listInstitutesQuery.safeParse(raw)
  const query = parsed.success ? parsed.data : listInstitutesQuery.parse({})

  const search = new URLSearchParams()
  search.set('page', String(query.page))
  search.set('limit', String(query.limit))
  search.set('sort', query.sort)
  if (query.city) search.set('city', query.city)
  if (query.exam) search.set('exam', query.exam)
  if (query.mode) search.set('mode', query.mode)

  const data = await apiGet(`/api/v1/institutes?${search.toString()}`, instituteListResponse, {
    next: { revalidate: 300 },
  } as RequestInit)

  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Coaching institutes</h1>
        <p className="text-sm text-gray-600">{data.total} found</p>
      </div>

      {data.items.length === 0 ? (
        <p className="text-gray-600">No institutes match these filters yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.items.map((institute) => (
            <li key={institute.id}>
              <Card>
                <Link href={`/institutes/${institute.slug}`} className="block space-y-2">
                  <h2 className="text-lg font-semibold text-brand-700">{institute.name}</h2>
                  <p className="text-sm text-gray-600">
                    {institute.locality ? `${institute.locality}, ` : ''}
                    {institute.city.name}
                  </p>
                  {institute.shortDescription ? (
                    <p className="text-sm text-gray-700">{institute.shortDescription}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {institute.exams.map((exam) => (
                      <Badge key={exam}>{exam.toUpperCase()}</Badge>
                    ))}
                  </div>
                  <p className="pt-1 text-xs text-gray-500">
                    {institute.batchCount} upcoming {institute.batchCount === 1 ? 'batch' : 'batches'}
                  </p>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 7: Run the test and build**

```bash
pnpm --filter @one/web test
pnpm --filter @one/web typecheck
pnpm --filter @one/web lint
```

Expected: 5 tests pass; typecheck and lint exit 0. If `next` types are missing, run `pnpm --filter @one/web exec next build` once to generate `next-env.d.ts`.

- [ ] **Step 8: Verify the page renders against the live API**

```bash
pnpm --filter @one/db db:seed
pnpm --filter @one/api dev &
pnpm --filter @one/web dev &
sleep 8
curl -s http://localhost:3000/institutes | grep -c "Alpha Academy"
kill %1 %2
```

Expected: at least `1`. If it is `0`, check the API is responding with `curl -s http://localhost:4000/api/v1/institutes | head -c 300`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(web): add public shell, typed API client and institutes index"
```

---

### Task 17: Institute detail page with SEO

**Files:**
- Create: `apps/web/src/app/institutes/[slug]/page.tsx`, `not-found.tsx`
- Create: `apps/web/src/app/sitemap.ts`, `src/app/robots.ts`
- Modify: `apps/web/src/lib/api.ts` (add `apiGetOptional`)

**Interfaces:**
- Consumes: `apiGet`, `formatFee`, `formatDateRange`, `instituteDetail`, `batchListResponse`.
- Produces: `generateMetadata` per institute, JSON-LD `EducationalOrganization`, a `sitemap()` enumerating published institutes.

- [ ] **Step 1: Add the optional fetch helper**

Append to `apps/web/src/lib/api.ts`:

```ts
export async function apiGetOptional<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T | null> {
  try {
    return await apiGet(path, schema, init)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}
```

- [ ] **Step 2: Create the detail page**

`apps/web/src/app/institutes/[slug]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge, Card } from '@one/ui'
import { batchListResponse, instituteDetail } from '@one/shared'
import { apiGet, apiGetOptional } from '@/lib/api'
import { formatDateRange, formatFee } from '@/lib/format'
import { EnquiryForm } from './EnquiryForm'

export const revalidate = 300

type Params = Promise<{ slug: string }>

async function loadInstitute(slug: string) {
  return apiGetOptional(`/api/v1/institutes/${slug}`, instituteDetail, {
    next: { revalidate: 300 },
  } as RequestInit)
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const institute = await loadInstitute(slug)
  if (!institute) return { title: 'Institute not found' }

  const description =
    institute.shortDescription ??
    `${institute.name} in ${institute.city.name} — batches, fees and schedules.`

  return {
    title: `${institute.name}, ${institute.city.name}`,
    description,
    alternates: { canonical: `/institutes/${institute.slug}` },
    openGraph: { title: institute.name, description, type: 'website' },
  }
}

export default async function InstituteDetailPage({ params }: { params: Params }) {
  const { slug } = await params
  const institute = await loadInstitute(slug)
  if (!institute) notFound()

  const batches = await apiGet(`/api/v1/institutes/${slug}/batches`, batchListResponse, {
    next: { revalidate: 300 },
  } as RequestInit)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: institute.name,
    description: institute.shortDescription ?? undefined,
    url: institute.website ?? undefined,
    foundingDate: institute.establishedYear ? String(institute.establishedYear) : undefined,
    address: {
      '@type': 'PostalAddress',
      addressLocality: institute.city.name,
      ...(institute.locality ? { streetAddress: institute.locality } : {}),
    },
    ...(institute.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: institute.ratingAvg,
            reviewCount: institute.ratingCount,
          },
        }
      : {}),
  }

  return (
    <article className="space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="space-y-3">
        <h1 className="text-3xl font-bold">{institute.name}</h1>
        <p className="text-gray-600">
          {institute.locality ? `${institute.locality}, ` : ''}
          {institute.city.name}
        </p>
        <div className="flex flex-wrap gap-2">
          {institute.exams.map((exam) => (
            <Badge key={exam}>{exam.toUpperCase()}</Badge>
          ))}
          {institute.modes.map((mode) => (
            <Badge key={mode}>{mode}</Badge>
          ))}
        </div>
      </header>

      {institute.about ? (
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">About</h2>
          <p className="text-gray-700">{institute.about}</p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Upcoming batches</h2>
        {batches.items.length === 0 ? (
          <p className="text-gray-600">No published batches right now.</p>
        ) : (
          <ul className="space-y-3">
            {batches.items.map((batch) => (
              <li key={batch.id}>
                <Card>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold">{batch.title}</h3>
                    <p className="font-semibold text-brand-700">
                      {formatFee(batch.feeAmount, batch.feeCurrency)}
                    </p>
                  </div>
                  <dl className="mt-2 grid gap-1 text-sm text-gray-700 sm:grid-cols-2">
                    <div>
                      <dt className="inline font-medium">Exam: </dt>
                      <dd className="inline">{batch.exam}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Mode: </dt>
                      <dd className="inline">{batch.mode}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Dates: </dt>
                      <dd className="inline">{formatDateRange(batch.startDate, batch.endDate)}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Seats left: </dt>
                      <dd className="inline">
                        {batch.seatsAvailable} of {batch.seatsTotal}
                      </dd>
                    </div>
                  </dl>
                  {batch.scheduleText ? (
                    <p className="mt-2 text-sm text-gray-600">{batch.scheduleText}</p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Request a callback</h2>
        <EnquiryForm
          listingSlug={institute.slug}
          batches={batches.items.map((batch) => ({ id: batch.id, title: batch.title }))}
        />
      </section>
    </article>
  )
}
```

`apps/web/src/app/institutes/[slug]/not-found.tsx`:

```tsx
export default function InstituteNotFound() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-bold">Institute not found</h1>
      <p className="text-gray-600">
        This institute may not be published yet, or the link may be out of date.
      </p>
      <a href="/institutes" className="text-brand-700 underline">
        Browse all institutes
      </a>
    </section>
  )
}
```

- [ ] **Step 3: Add sitemap and robots**

`apps/web/src/app/sitemap.ts`:

```ts
import type { MetadataRoute } from 'next'
import { instituteListResponse } from '@one/shared'
import { apiGet } from '@/lib/api'

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3000'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/institutes`, changeFrequency: 'daily', priority: 0.9 },
  ]

  let page = 1
  for (;;) {
    const data = await apiGet(
      `/api/v1/institutes?page=${page}&limit=50`,
      instituteListResponse,
      { next: { revalidate: 3600 } } as RequestInit,
    )
    for (const institute of data.items) {
      entries.push({
        url: `${SITE_URL}/institutes/${institute.slug}`,
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    }
    if (page * data.limit >= data.total) break
    page += 1
  }

  return entries
}
```

`apps/web/src/app/robots.ts`:

```ts
import type { MetadataRoute } from 'next'

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3000'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
```

- [ ] **Step 4: Verify typecheck passes**

```bash
pnpm --filter @one/web typecheck
```

Expected: exit 0. `EnquiryForm` does not exist yet, so this will fail on that import — create the file in Task 18 and re-run, or create a temporary stub now and replace it in Task 18. Prefer completing Task 18 before running the full verify.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): add institute detail page with metadata, JSON-LD and sitemap"
```

---

### Task 18: Enquiry form

**Files:**
- Create: `apps/web/src/app/institutes/[slug]/EnquiryForm.tsx`
- Create: `apps/web/src/app/institutes/[slug]/actions.ts`

**Interfaces:**
- Consumes: `createEnquiryBody`, `enquiryCreatedResponse`, `apiPost`.
- Produces: `submitEnquiry(prevState, formData)` server action returning `{ status: 'idle' | 'success' | 'error'; message?: string; fieldErrors?: Record<string, string[]> }`; `EnquiryForm` client component.

- [ ] **Step 1: Write the server action**

`apps/web/src/app/institutes/[slug]/actions.ts`:

```ts
'use server'

import { createEnquiryBody, enquiryCreatedResponse } from '@one/shared'
import { ApiError, apiPost } from '@/lib/api'

export type EnquiryFormState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
}

export async function submitEnquiry(
  _prevState: EnquiryFormState,
  formData: FormData,
): Promise<EnquiryFormState> {
  const raw = {
    listingSlug: String(formData.get('listingSlug') ?? ''),
    name: String(formData.get('name') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    ...(formData.get('email') ? { email: String(formData.get('email')) } : {}),
    ...(formData.get('message') ? { message: String(formData.get('message')) } : {}),
    ...(formData.get('batchId') ? { batchId: String(formData.get('batchId')) } : {}),
  }

  const parsed = createEnquiryBody.safeParse(raw)
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  try {
    await apiPost('/api/v1/enquiries', parsed.data, enquiryCreatedResponse)
    return { status: 'success', message: 'Thanks — the institute will contact you shortly.' }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
      return { status: 'error', message: 'Too many requests. Please try again later.' }
    }
    return { status: 'error', message: 'Something went wrong. Please try again.' }
  }
}
```

Validating with the same schema the API enforces means the client never sends a request the server will reject for a reason the user could have been told about immediately.

- [ ] **Step 2: Write the client component**

`apps/web/src/app/institutes/[slug]/EnquiryForm.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { Card } from '@one/ui'
import { submitEnquiry, type EnquiryFormState } from './actions'

const INITIAL: EnquiryFormState = { status: 'idle' }

export function EnquiryForm({
  listingSlug,
  batches,
}: {
  listingSlug: string
  batches: { id: string; title: string }[]
}) {
  const [state, formAction, pending] = useActionState(submitEnquiry, INITIAL)

  if (state.status === 'success') {
    return (
      <Card>
        <p className="text-sm font-medium text-green-700">{state.message}</p>
      </Card>
    )
  }

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="listingSlug" value={listingSlug} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Your name</span>
            <input
              name="name"
              required
              minLength={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
            {state.fieldErrors?.name ? (
              <span className="text-xs text-red-600">{state.fieldErrors.name[0]}</span>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Phone</span>
            <input
              name="phone"
              required
              inputMode="numeric"
              pattern="\d{10}"
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
            {state.fieldErrors?.phone ? (
              <span className="text-xs text-red-600">{state.fieldErrors.phone[0]}</span>
            ) : null}
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Email (optional)</span>
          <input
            name="email"
            type="email"
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>

        {batches.length > 0 ? (
          <label className="block space-y-1">
            <span className="text-sm font-medium">Batch of interest (optional)</span>
            <select
              name="batchId"
              defaultValue=""
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Any batch</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block space-y-1">
          <span className="text-sm font-medium">Message (optional)</span>
          <textarea
            name="message"
            rows={3}
            maxLength={1000}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>

        {state.status === 'error' && state.message ? (
          <p className="text-sm text-red-600">{state.message}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-500 px-4 py-2 text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? 'Sending…' : 'Request callback'}
        </button>
      </form>
    </Card>
  )
}
```

- [ ] **Step 3: Verify the web app builds and lints**

```bash
pnpm --filter @one/web lint
pnpm --filter @one/web typecheck
pnpm --filter @one/web build
```

Expected: all exit 0. The build needs the API reachable only if a page is statically prerendered at build time; `revalidate` with dynamic `searchParams` makes `/institutes` dynamic, so the build should not require the API. If the build fails trying to prerender `/sitemap.xml`, start the API first.

- [ ] **Step 4: Verify an enquiry round-trips end to end**

```bash
pnpm --filter @one/api dev &
pnpm --filter @one/web dev &
sleep 8
curl -s http://localhost:3000/institutes/alpha-academy | grep -c "Request callback"
curl -s -X POST http://localhost:4000/api/v1/enquiries \
  -H 'content-type: application/json' \
  -d '{"listingSlug":"alpha-academy","name":"Manual Test","phone":"9876543210"}' | head -c 200
kill %1 %2
```

Expected: the grep returns at least `1`, and the POST returns a JSON body containing `"status":"NEW"`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): add enquiry form with shared-schema validation"
```

---

### Task 19: `apps/partner` shell with Clerk authentication

**Files:**
- Create: `apps/partner/package.json`, `tsconfig.json`, `eslint.config.js`, `next.config.ts`, `postcss.config.mjs`, `.env.example`, `.env.local`
- Create: `apps/partner/src/middleware.ts`, `src/lib/api.ts`
- Create: `apps/partner/src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `@one/shared` partner contracts, `@clerk/nextjs`.
- Produces: `partnerApiGet<T>(path, schema)` and `partnerApiSend<T>(path, method, body, schema)`, both attaching the Clerk session token as a bearer header; a `/dashboard` route listing the active organization's listings.

- [ ] **Step 1: Create the workspace**

`apps/partner/package.json`:

```json
{
  "name": "@one/partner",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "echo no-op"
  },
  "dependencies": {
    "@clerk/nextjs": "catalog:",
    "@one/shared": "workspace:*",
    "@one/ui": "workspace:*",
    "next": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@one/config": "workspace:*",
    "@types/node": "24.9.2",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@tailwindcss/postcss": "4.3.3",
    "tailwindcss": "catalog:",
    "typescript": "catalog:"
  }
}
```

`apps/partner/tsconfig.json`, `eslint.config.js`, `next.config.ts`, `postcss.config.mjs` are identical to `apps/web`'s equivalents from Task 16, except `next.config.ts` keeps the same `transpilePackages: ['@one/ui', '@one/shared']`.

`apps/partner/.env.example` and `.env.local`:

```
API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_replace_me
CLERK_SECRET_KEY=sk_test_replace_me
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

- [ ] **Step 2: Add Clerk route protection**

`apps/partner/src/middleware.ts`:

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublic = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)'])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublic(request)) await auth.protect()
})

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
```

- [ ] **Step 3: Create the authenticated API client**

`apps/partner/src/lib/api.ts`:

```ts
import { auth } from '@clerk/nextjs/server'
import { errorEnvelope, type ErrorCode } from '@one/shared'
import type { ZodType } from 'zod'

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000'

export class PartnerApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'UNKNOWN',
    message: string,
  ) {
    super(message)
    this.name = 'PartnerApiError'
  }
}

async function authHeaders() {
  const { getToken } = await auth()
  const token = await getToken()
  return token ? { authorization: `Bearer ${token}` } : {}
}

async function toError(response: Response): Promise<PartnerApiError> {
  try {
    const parsed = errorEnvelope.safeParse(await response.json())
    if (parsed.success) {
      return new PartnerApiError(response.status, parsed.data.error.code, parsed.data.error.message)
    }
  } catch {
    // fall through
  }
  return new PartnerApiError(response.status, 'UNKNOWN', `Request failed with ${response.status}`)
}

export async function partnerApiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { accept: 'application/json', ...(await authHeaders()) },
    cache: 'no-store',
  })
  if (!response.ok) throw await toError(response)
  return schema.parse(await response.json())
}

export async function partnerApiSend<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
  schema: ZodType<T>,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!response.ok) throw await toError(response)
  return schema.parse(await response.json())
}
```

`cache: 'no-store'` on every partner call — dashboard data is per-organization and must never be shared from a cache.

- [ ] **Step 4: Create the shell and dashboard**

`apps/partner/src/app/globals.css`:

```css
@import '@one/ui/styles.css';
```

`apps/partner/src/app/layout.tsx`:

```tsx
import { ClerkProvider, SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'One Academy for Partners',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
          <header className="border-b border-gray-200 bg-white">
            <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
              <a href="/dashboard" className="text-lg font-semibold text-brand-700">
                One Academy Partners
              </a>
              <SignedIn>
                <UserButton />
              </SignedIn>
              <SignedOut>
                <SignInButton />
              </SignedOut>
            </nav>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  )
}
```

`robots: { index: false }` because the partner app must never be indexed.

`apps/partner/src/app/page.tsx`:

```tsx
import Link from 'next/link'

export default function PartnerHome() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold">Manage your institute</h1>
      <p className="max-w-2xl text-gray-600">
        Update your profile, publish batches and track enquiries from students.
      </p>
      <Link
        href="/dashboard"
        className="inline-block rounded-md bg-brand-500 px-4 py-2 text-white hover:bg-brand-700"
      >
        Go to dashboard
      </Link>
    </section>
  )
}
```

`apps/partner/src/app/dashboard/page.tsx`:

```tsx
import Link from 'next/link'
import { Badge, Card } from '@one/ui'
import { partnerListingListResponse } from '@one/shared'
import { PartnerApiError, partnerApiGet } from '@/lib/api'

export default async function DashboardPage() {
  let data
  try {
    data = await partnerApiGet('/api/v1/partner/listings', partnerListingListResponse)
  } catch (error) {
    if (error instanceof PartnerApiError && error.status === 403) {
      return (
        <Card>
          <h1 className="text-xl font-semibold">No organisation selected</h1>
          <p className="mt-2 text-sm text-gray-600">
            Your account is not linked to an institute yet. Create or select an organisation, then
            reload this page.
          </p>
        </Card>
      )
    }
    throw error
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Your listings</h1>

      {data.items.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-600">
            No listings yet. Contact One Academy to have your institute added.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.items.map((listing) => (
            <li key={listing.id}>
              <Card>
                <Link href={`/dashboard/${listing.id}`} className="block space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-semibold text-brand-700">{listing.name}</h2>
                    <Badge>{listing.status}</Badge>
                  </div>
                  <p className="text-sm text-gray-600">{listing.cityName}</p>
                  <p className="text-xs text-gray-500">
                    {listing.batchCount} {listing.batchCount === 1 ? 'batch' : 'batches'}
                  </p>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 5: Verify it builds**

```bash
pnpm install
pnpm --filter @one/partner lint && pnpm --filter @one/partner typecheck
```

Expected: both exit 0. `pnpm --filter @one/partner build` requires a real `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`; with the placeholder it may fail at build time. If so, obtain real test keys from the Clerk dashboard before completing this step — this is the one task that cannot be finished without them.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(partner): add authenticated shell and listings dashboard"
```

---

### Task 20: Batch management in the partner app

**Files:**
- Create: `apps/partner/src/app/dashboard/[listingId]/page.tsx`, `BatchForm.tsx`, `actions.ts`

**Interfaces:**
- Consumes: `partnerApiGet`, `partnerApiSend`, `createBatchBody`, `updateBatchBody`, `partnerListingDetail`, `batchSummary`.
- Produces: `createBatchAction(listingId, prevState, formData)`, `publishBatchAction(batchId)`, `submitListingAction(listingId)` server actions; the listing detail screen.

- [ ] **Step 1: Write the server actions**

`apps/partner/src/app/dashboard/[listingId]/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { batchSummary, createBatchBody, partnerListingDetail } from '@one/shared'
import { PartnerApiError, partnerApiSend } from '@/lib/api'

export type BatchFormState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
}

const batchWithStatus = batchSummary.extend({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
})

export async function createBatchAction(
  listingId: string,
  _prevState: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const feeRupees = Number(formData.get('feeRupees') ?? '0')

  const raw = {
    title: String(formData.get('title') ?? ''),
    exam: String(formData.get('exam') ?? ''),
    mode: String(formData.get('mode') ?? 'OFFLINE'),
    startDate: String(formData.get('startDate') ?? ''),
    ...(formData.get('endDate') ? { endDate: String(formData.get('endDate')) } : {}),
    ...(formData.get('scheduleText')
      ? { scheduleText: String(formData.get('scheduleText')) }
      : {}),
    seatsTotal: Number(formData.get('seatsTotal') ?? '0'),
    feeAmount: Math.round(feeRupees * 100),
    feeCurrency: 'INR',
  }

  const parsed = createBatchBody.safeParse(raw)
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  try {
    await partnerApiSend(
      `/api/v1/partner/listings/${listingId}/batches`,
      'POST',
      parsed.data,
      batchSummary,
    )
    revalidatePath(`/dashboard/${listingId}`)
    return { status: 'success', message: 'Batch created as a draft.' }
  } catch (error) {
    return { status: 'error', message: errorMessage(error) }
  }
}

export async function publishBatchAction(
  listingId: string,
  batchId: string,
): Promise<BatchFormState> {
  try {
    await partnerApiSend(
      `/api/v1/partner/batches/${batchId}`,
      'PATCH',
      { status: 'PUBLISHED' },
      batchWithStatus,
    )
    revalidatePath(`/dashboard/${listingId}`)
    return { status: 'success', message: 'Batch published.' }
  } catch (error) {
    return { status: 'error', message: errorMessage(error) }
  }
}

export async function submitListingAction(listingId: string): Promise<BatchFormState> {
  try {
    await partnerApiSend(
      `/api/v1/partner/listings/${listingId}/submit`,
      'POST',
      {},
      partnerListingDetail,
    )
    revalidatePath(`/dashboard/${listingId}`)
    return { status: 'success', message: 'Submitted for review.' }
  } catch (error) {
    return { status: 'error', message: errorMessage(error) }
  }
}

function errorMessage(error: unknown): string {
  if (!(error instanceof PartnerApiError)) return 'Something went wrong. Please try again.'

  switch (error.code) {
    case 'BATCH_START_DATE_PAST':
      return 'A batch starting in the past cannot be published.'
    case 'BATCH_PARENT_NOT_PUBLISHED':
      return 'Your listing must be published before you can publish a batch.'
    case 'SEATS_OUT_OF_RANGE':
      return 'Seats available must be between zero and the total seats.'
    case 'INVALID_STATUS_TRANSITION':
      return 'This listing cannot be submitted in its current state.'
    case 'FORBIDDEN':
      return 'You do not have permission to change this listing.'
    default:
      return error.message
  }
}
```

The `errorMessage` map turns every domain error code the API can return into partner-facing copy, so a BR violation reads as an explanation rather than a generic failure. Rupees are converted to paise here — the form takes rupees because that is what a human types, and BR-005 is satisfied at the boundary.

- [ ] **Step 2: Write the batch form component**

`apps/partner/src/app/dashboard/[listingId]/BatchForm.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { Card } from '@one/ui'
import { createBatchAction, type BatchFormState } from './actions'

const INITIAL: BatchFormState = { status: 'idle' }

export function BatchForm({ listingId }: { listingId: string }) {
  const [state, formAction, pending] = useActionState(
    (prev: BatchFormState, formData: FormData) => createBatchAction(listingId, prev, formData),
    INITIAL,
  )

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Batch title</span>
            <input name="title" required className="w-full rounded-md border border-gray-300 px-3 py-2" />
            {state.fieldErrors?.title ? (
              <span className="text-xs text-red-600">{state.fieldErrors.title[0]}</span>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Exam</span>
            <input name="exam" required className="w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Mode</span>
            <select name="mode" defaultValue="OFFLINE" className="w-full rounded-md border border-gray-300 px-3 py-2">
              <option value="OFFLINE">Offline</option>
              <option value="ONLINE">Online</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Start date</span>
            <input name="startDate" type="date" required className="w-full rounded-md border border-gray-300 px-3 py-2" />
            {state.fieldErrors?.startDate ? (
              <span className="text-xs text-red-600">{state.fieldErrors.startDate[0]}</span>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">End date (optional)</span>
            <input name="endDate" type="date" className="w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Total seats</span>
            <input name="seatsTotal" type="number" min={1} required className="w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Fee (₹)</span>
            <input name="feeRupees" type="number" min={0} step={1} required className="w-full rounded-md border border-gray-300 px-3 py-2" />
            {state.fieldErrors?.feeAmount ? (
              <span className="text-xs text-red-600">{state.fieldErrors.feeAmount[0]}</span>
            ) : null}
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Schedule (optional)</span>
          <input name="scheduleText" placeholder="Mon-Sat, 7:00-10:00" className="w-full rounded-md border border-gray-300 px-3 py-2" />
        </label>

        {state.message ? (
          <p className={state.status === 'error' ? 'text-sm text-red-600' : 'text-sm text-green-700'}>
            {state.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-500 px-4 py-2 text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create batch'}
        </button>
      </form>
    </Card>
  )
}
```

- [ ] **Step 3: Write the listing detail screen**

`apps/partner/src/app/dashboard/[listingId]/page.tsx`:

```tsx
import { Badge, Card } from '@one/ui'
import { partnerListingDetail } from '@one/shared'
import { partnerApiGet } from '@/lib/api'
import { BatchForm } from './BatchForm'
import { publishBatchAction, submitListingAction } from './actions'

type Params = Promise<{ listingId: string }>

export default async function ListingDetailPage({ params }: { params: Params }) {
  const { listingId } = await params
  const listing = await partnerApiGet(
    `/api/v1/partner/listings/${listingId}`,
    partnerListingDetail,
  )

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold">{listing.name}</h1>
          <Badge>{listing.status}</Badge>
        </div>
        <p className="text-sm text-gray-600">{listing.cityName}</p>

        {listing.status === 'DRAFT' ? (
          <form
            action={async () => {
              'use server'
              await submitListingAction(listingId)
            }}
          >
            <button
              type="submit"
              className="mt-2 rounded-md border border-brand-500 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50"
            >
              Submit for review
            </button>
          </form>
        ) : null}

        {listing.status === 'PENDING_REVIEW' ? (
          <p className="text-sm text-gray-600">
            Awaiting review by One Academy. You can keep editing batches meanwhile.
          </p>
        ) : null}
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Batches</h2>
        {listing.batches.length === 0 ? (
          <p className="text-sm text-gray-600">No batches yet.</p>
        ) : (
          <ul className="space-y-3">
            {listing.batches.map((batch) => (
              <li key={batch.id}>
                <Card>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold">{batch.title}</h3>
                    <Badge>{batch.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {batch.exam} · {batch.mode} · {batch.seatsAvailable}/{batch.seatsTotal} seats ·
                    ₹{(batch.feeAmount / 100).toLocaleString('en-IN')}
                  </p>

                  {batch.status === 'DRAFT' ? (
                    <form
                      action={async () => {
                        'use server'
                        await publishBatchAction(listingId, batch.id)
                      }}
                    >
                      <button
                        type="submit"
                        className="mt-3 rounded-md border border-brand-500 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50"
                      >
                        Publish batch
                      </button>
                    </form>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Add a batch</h2>
        <BatchForm listingId={listingId} />
      </section>
    </section>
  )
}
```

- [ ] **Step 4: Verify lint and typecheck**

```bash
pnpm --filter @one/partner lint && pnpm --filter @one/partner typecheck
```

Expected: both exit 0. If inline `'use server'` closures inside `action={}` are rejected, move each to a named export in `actions.ts` that takes `FormData` and reads a hidden input, then bind it with a hidden field instead of a closure.

- [ ] **Step 5: Verify the full P0 acceptance flow by hand**

Start everything, then walk the flow in a browser at `http://localhost:3001`:

```bash
pnpm --filter @one/api dev &
pnpm --filter @one/web dev &
pnpm --filter @one/partner dev &
```

1. Sign in to the partner app and select an organisation whose `clerkOrgId` matches a local `Organization` row. Link one if needed:
   ```bash
   psql "postgresql://one_academy:local_dev_only@localhost:5432/one_academy_dev" \
     -c "UPDATE \"Organization\" SET \"clerkOrgId\"='<clerk org id>' WHERE id='org-seed-alpha';"
   ```
2. Open the `Draft Academy` listing, create a batch, and submit the listing for review.
3. Publish the listing as an admin:
   ```bash
   curl -s -X POST http://localhost:4000/api/v1/admin/listings/listing-draft/publish \
     -H 'content-type: application/json'
   ```
   This returns 401 in development because `x-test-auth` works only when `NODE_ENV=test`. Instead grant yourself ADMIN in Clerk's user metadata (`{"globalRole":"ADMIN"}`) and call it with a real bearer token, or publish directly for this manual check:
   ```bash
   psql "postgresql://one_academy:local_dev_only@localhost:5432/one_academy_dev" \
     -c "UPDATE \"Listing\" SET status='PUBLISHED', \"publishedAt\"=now() WHERE id='listing-draft';"
   ```
4. Publish the batch from the partner app, then confirm it appears publicly:
   ```bash
   curl -s http://localhost:3000/institutes/draft-academy | grep -c "Draft Academy"
   ```
   Expected: at least `1`.
5. Submit an enquiry from the public page and confirm it stored:
   ```bash
   psql "postgresql://one_academy:local_dev_only@localhost:5432/one_academy_dev" -c "SELECT name, phone FROM \"Enquiry\";"
   ```

Stop the servers with `kill %1 %2 %3`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(partner): add batch creation, publishing and listing submission"
```

---

### Task 21: Seed the documentation system

**Files:**
- Create: `CLAUDE.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`, `apps/partner/CLAUDE.md`, `packages/db/CLAUDE.md`
- Create: `docs/README.md`, `docs/architecture.md`
- Create: `docs/flows/institute-discovery.md`, `docs/flows/listing-lifecycle.md`
- Create: `docs/domain/business-rules.md`, `docs/domain/glossary.md`
- Create: `docs/decisions/0001`–`0007`
- Create: `docs/runbooks/local-setup.md`, `docs/runbooks/migrations.md`
- Create: `docs/work/requests/TEMPLATE.md`, `docs/work/bugs/TEMPLATE.md`, `docs/work/bugs/BUG-001-clerk-webhook-unverified.md`
- Create: `scripts/check-docs-freshness.ts`

**Interfaces:**
- Consumes: the implemented code, for accurate anchors.
- Produces: `pnpm exec tsx scripts/check-docs-freshness.ts` exiting 0 when flows are current and printing warnings when stale.

- [ ] **Step 1: Write the root `CLAUDE.md`**

```markdown
# One Academy

A discovery marketplace for coaching institutes. Three deployable apps in one monorepo:
`apps/web` (public, SEO), `apps/partner` (institute dashboard), `apps/api` (Express REST).

## Commands

Every workspace exposes `dev`, `build`, `lint`, `typecheck`, `test`.

- `pnpm verify` — lint, typecheck, test, build. **A change is not done until this is green.**
- `pnpm --filter @one/api test` — API tests (needs local Postgres running)
- `pnpm --filter @one/db db:migrate` — create and apply a migration
- `pnpm --filter @one/shared gen:openapi` — regenerate `docs/api/openapi.json`

## Non-negotiable rules

Enforced by ESLint — you will see a failing check, not a review comment:

- **R1/R3** Only `*.repository.ts` imports `@one/db`. Routes never touch the database.
- **R2** Services never import `express` or touch `req`/`res`.
- **R4** Cross-module access goes through the other module's **service**, never its repository.
- **R5** Every route input is validated by a Zod schema from `@one/shared`.
- **R6** Throw `AppError` subclasses; only `middleware/errorHandler.ts` maps to HTTP.

Also:

- **Money is integer minor units (paise)** with an explicit currency. Never a float.
- **Versions are pinned exactly.** Prisma stays on 7.10.0 (npm `latest` is an 8.0 RC) and
  TypeScript on 6.0.3 (typescript-eslint caps at `<6.1.0`). Do not "upgrade to latest".
- **Express 5 catches async rejections.** Never add an `asyncHandler` wrapper.
- **Never mock the database.** Integration tests use real Postgres.
- **Do not use corepack here.** pnpm is installed globally via npm.

## Read first

1. `docs/README.md` — the documentation map
2. The relevant file in `docs/flows/` — how the feature actually works end to end
3. `docs/domain/business-rules.md` — the BR-### rules referenced by tests

## Definition of done

1. `pnpm verify` green
2. Integration test for any new or changed endpoint
3. Contract updated in `packages/shared` if the API changed
4. Flow doc updated and its verified-sha bumped if behaviour changed
5. ADR added in `docs/decisions/` if a structural decision was made
6. Work item moved to `docs/work/archive/` with an Outcome block
7. Conventional commit referencing the work item ID
```

- [ ] **Step 2: Write the per-workspace `CLAUDE.md` files**

`apps/api/CLAUDE.md`:

```markdown
# apps/api

Express 5 REST API. Vertical slices in `src/modules/<module>/`.

## Adding an endpoint, in order

1. Define its Zod schemas in `packages/shared/src/contracts/<module>.ts` and export inferred types.
2. Add the query to `<module>.repository.ts`. Return a plain row type, never a Prisma type.
3. Add the business rule to `<module>.service.ts`. Throw `AppError` subclasses.
4. Add the route to `<module>.routes.ts` (or `.partner.routes.ts` / `.admin.routes.ts`),
   wrapped in `validate({ ... })` and reading input via `validated<T>(req, 'body')`.
5. Mount the router in `src/server.ts` if the module is new.
6. Write the integration test in `<module>.routes.test.ts` against real Postgres.
7. Register the path in `packages/shared/scripts/gen-openapi.ts` and regenerate.

Routes are grouped by **resource**, never by audience. A module has one service and one
repository shared by its public, partner and admin routes.

## Tests

Integration tests need the test database migrated:

    DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test" \
      pnpm --filter @one/db exec prisma migrate deploy

`requireAuth` honours an `x-test-auth` header **only when `NODE_ENV=test`**, so tests
exercise real authorization logic without Clerk. Never rely on it outside tests.
```

`apps/web/CLAUDE.md`:

```markdown
# apps/web

Public Next.js 16 App Router site. SEO is the acquisition channel, so treat it as a feature.

- Server Components by default. `'use client'` only for interactivity.
- All data goes through `src/lib/api.ts`, which parses every response with the shared Zod
  schema. A contract violation must fail loudly here, not surface as `undefined`.
- Every indexable page exports `metadata` or `generateMetadata`.
- Detail pages include JSON-LD. Keep `src/app/sitemap.ts` covering every public route.
- `export const revalidate = 300` on cacheable pages; never `cache: 'no-store'` on public data.
- Never import `@one/db`. The frontend talks to the API only (lint-enforced).
```

`apps/partner/CLAUDE.md`:

```markdown
# apps/partner

Authenticated Next.js dashboard for institutes. Never indexed (`robots: { index: false }`).

- Clerk protects every route except `/`, `/sign-in`, `/sign-up` via `src/middleware.ts`.
- All API calls use `src/lib/api.ts`, which attaches the Clerk bearer token and sets
  `cache: 'no-store'` — organisation-scoped data must never be served from a shared cache.
- Authorization is **the API's** job. The dashboard never decides who may edit what; it
  renders what the API returns and maps error codes to copy in `actions.ts`.
- Money is entered in rupees and converted to paise before the request (BR-005).
```

`packages/db/CLAUDE.md`:

```markdown
# packages/db

The only workspace that talks to Postgres.

## Migrations

    pnpm --filter @one/db db:migrate            # create + apply in development
    pnpm --filter @one/db db:migrate:deploy     # apply existing migrations
    pnpm --filter @one/db db:reset              # drop, re-apply, re-seed (destructive)

- **Never edit an applied migration.** Add a new one.
- A data invariant that must hold regardless of application code belongs in a CHECK
  constraint via `--create-only`, as `Batch_seats_invariant` does for BR-010.
- Prisma is pinned to 7.10.0. `pnpm add prisma` would install an 8.0 release candidate.
- Repositories convert rows to plain types so Prisma stays replaceable.
```

- [ ] **Step 3: Write the docs map and architecture**

`docs/README.md`:

```markdown
# One Academy documentation

Docs hold what git cannot: intent, rejected alternatives, and how a flow spans three apps.
Git already records what changed and when — so nothing here duplicates a file-change log.

| Path | What it holds | Read it when |
|---|---|---|
| `architecture.md` | The three apps, data flow, deploy topology | Orienting for the first time |
| `flows/` | End-to-end flows with code anchors | Changing behaviour that crosses apps |
| `domain/business-rules.md` | Numbered BR-### rules | Implementing or testing a rule |
| `domain/glossary.md` | Exact meaning of Listing, Institute, Batch, Org | A term is ambiguous |
| `decisions/` | ADRs: why, and what was rejected | Tempted to re-litigate a decision |
| `api/openapi.json` | Generated API spec — never hand-edit | Checking the contract |
| `runbooks/` | Local setup, migrations | Operating the system |
| `work/` | Requests, bugs, and completed outcomes | Picking up or recording work |
| `superpowers/specs/`, `superpowers/plans/` | Design specs and implementation plans | Starting a phase |

## Keeping flows true

Each flow records `Last verified against commit: <sha>` plus the code anchors it describes.
`pnpm exec tsx scripts/check-docs-freshness.ts` flags flows whose anchors have newer commits.
When you change behaviour, update the flow and bump its sha in the same PR.
```

`docs/architecture.md`:

```markdown
# Architecture

## Shape

One monorepo, three deployable apps, four shared packages.

    apps/web      Next.js 16  public discovery, SSG/ISR, anonymous, SEO-critical
    apps/partner  Next.js 16  institute dashboard, Clerk-authenticated, never indexed
    apps/api      Express 5   REST API, the only writer to Postgres

    packages/shared  Zod contracts — one definition serves server validation and client types
    packages/db      Prisma schema, migrations, client singleton
    packages/ui      Design system shared by both frontends
    packages/config  tsconfig, ESLint flat configs, prettier

Both frontends call the API over HTTP. Neither may import `@one/db` — lint-enforced.

## Why a monorepo with separate apps

Atomic cross-stack commits: one commit changes the Express route, the shared contract and
the component that calls it, and CI type-checks all three together. Separate Next.js apps
keep the SEO-critical public bundle free of dashboard JavaScript and auth middleware.
Deployment stays independent — see ADR 0001 and 0002.

## Data model seam

A thin shared core (`Listing`, `Organization`, `User`, `Membership`, `MediaAsset`, `Review`,
`Enquiry`, `Tag`, `City`) carries identity, location, media and leads for every vertical,
discriminated by `Listing.vertical`. Per-vertical tables (`InstituteProfile`, `Batch`) hold
typed, queryable attributes. Adding hostels means new tables and a new module — nothing in
the core changes. See ADR 0004.

## Request path

    Browser → Next.js Server Component → src/lib/api.ts (parses with shared Zod schema)
            → Express route (validate() with the same schema)
            → service (business rules, BR-###)
            → repository (the only Prisma caller)
            → Postgres

## Authorization

Clerk owns identity and organisation membership. `User`, `Organization` and `Membership` are
local mirrors so authorization is a database join rather than an API call per request, synced
by webhook with `scripts/reconcile-clerk.ts` for repair. The API is the sole authority on who
may do what; the partner app renders what the API permits. See ADR 0006.

## Moderation

Partner-submitted content is gated: `DRAFT → PENDING_REVIEW → PUBLISHED → SUSPENDED`. Only a
global ADMIN publishes (BR-001), and only PUBLISHED listings appear in public routes (BR-009).
```

- [ ] **Step 4: Write the two flow documents**

`docs/flows/institute-discovery.md`:

```markdown
# Flow: Institute discovery

Last verified against commit: REPLACE_WITH_HEAD_SHA

## Purpose

How an anonymous student finds an institute, reads its batches, and submits an enquiry.
This is the acquisition path, so every step is cacheable and indexable.

## Actors and entry points

- Anonymous visitor, arriving from search at `/institutes/<slug>` or browsing `/institutes`
- Google crawler, via `/sitemap.xml`

## Sequence

List:

    apps/web/src/app/institutes/page.tsx
      → apps/web/src/lib/api.ts  apiGet(listInstitutesQuery → instituteListResponse)
      → GET /api/v1/institutes
      → apps/api/src/modules/institutes/institutes.routes.ts
      → institutes.service.listPublished()
      → institutes.repository.listPublished()   filters status=PUBLISHED (BR-009)

Detail:

    apps/web/src/app/institutes/[slug]/page.tsx
      → GET /api/v1/institutes/:slug
      → institutes.service.getPublishedBySlug()
      → listings.service.resolvePublishedSlug()   follows ListingRedirect (BR-002)
      → institutes.repository.findPublishedById()

Batches:

    GET /api/v1/institutes/:slug/batches
      → batches.service.listPublishedForListing()
      → batches.repository.listPublishedByListing()   status=PUBLISHED only

Enquiry:

    apps/web/src/app/institutes/[slug]/EnquiryForm.tsx
      → actions.ts submitEnquiry()   validates with createEnquiryBody
      → POST /api/v1/enquiries       rate limited 10/hour/IP
      → enquiries.service.create()
      → enquiries.repository.create()

## Diagram

A sequence diagram from visitor → web → api → service → repository → Postgres, with the
status filter applied at the repository boundary.

## Business rules invoked

BR-002, BR-005, BR-009

## Failure modes

| Condition | API response | What the user sees |
|---|---|---|
| Slug is DRAFT or unknown | 404 `NOT_FOUND` | `not-found.tsx` — "Institute not found" |
| Slug was renamed before publication | 301 to canonical slug | Transparent redirect |
| Enquiry phone not 10 digits | 400 `VALIDATION_FAILED` | Inline field error (caught client-side first) |
| Batch id belongs to another listing | 400 `VALIDATION_FAILED` | Generic form error |
| More than 10 enquiries in an hour | 429 `RATE_LIMITED` | "Too many requests. Please try again later." |
| API unreachable | — | Next.js error boundary |

## Related flows

`listing-lifecycle.md` — how a listing becomes publicly visible in the first place.
```

`docs/flows/listing-lifecycle.md`:

```markdown
# Flow: Listing lifecycle

Last verified against commit: REPLACE_WITH_HEAD_SHA

## Purpose

How an institute's listing moves from draft to publicly visible, and who may move it.
This is the moderation gate: nothing a partner writes reaches the public site unreviewed.

## Actors and entry points

- Partner (Clerk user with an active organisation) at `/dashboard/<listingId>`
- Global ADMIN, via `POST /api/v1/admin/listings/:listingId/publish`

## State machine

    DRAFT ──submit──▶ PENDING_REVIEW ──publish (ADMIN only)──▶ PUBLISHED ──▶ SUSPENDED

Only the ADMIN transition publishes (BR-001). A published slug is frozen (BR-002).

## Sequence

Partner edits and submits:

    apps/partner/src/app/dashboard/[listingId]/page.tsx
      → actions.ts submitListingAction()
      → POST /api/v1/partner/listings/:listingId/submit
      → apps/api/src/modules/institutes/institutes.partner.routes.ts
      → accounts.service.resolveLocalOrgId()      Clerk org id → local Organization.id
      → institutes.service.getForOrg()            → listings.service.assertOrgOwnsListing()
      → listings.service.submitForReview()        DRAFT only, else INVALID_STATUS_TRANSITION

Partner creates and publishes a batch:

    actions.ts createBatchAction()   rupees → paise (BR-005)
      → POST /api/v1/partner/listings/:listingId/batches
      → batches.service.createForOrg()            seats checked (BR-010), status DRAFT
    actions.ts publishBatchAction()
      → PATCH /api/v1/partner/batches/:batchId
      → batches.service.updateForOrg()            BR-003 start date, BR-004 parent published

Admin publishes:

    POST /api/v1/admin/listings/:listingId/publish
      → apps/api/src/modules/listings/listings.admin.routes.ts   requireAdmin (BR-001)
      → listings.service.publishAsAdmin() → publish()            stamps publishedAt

## Diagram

A state diagram of the four listing statuses with the actor permitted to make each
transition labelled on the arrows.

## Business rules invoked

BR-001, BR-002, BR-003, BR-004, BR-005, BR-010

## Failure modes

| Condition | API response | What the partner sees |
|---|---|---|
| Listing owned by another org | 403 `FORBIDDEN` | "You do not have permission to change this listing." |
| Clerk org not provisioned locally | 403 `FORBIDDEN` | "No organisation selected" card |
| Submitting a non-DRAFT listing | 409 `INVALID_STATUS_TRANSITION` | "This listing cannot be submitted in its current state." |
| Publishing a batch starting in the past | 409 `BATCH_START_DATE_PAST` | "A batch starting in the past cannot be published." |
| Publishing a batch on an unpublished listing | 409 `BATCH_PARENT_NOT_PUBLISHED` | "Your listing must be published before you can publish a batch." |
| seatsAvailable outside 0..seatsTotal | 409 `SEATS_OUT_OF_RANGE` | "Seats available must be between zero and the total seats." |
| Non-admin attempting publish | 403 `FORBIDDEN` | Not reachable from the partner UI |

## Related flows

`institute-discovery.md` — what becomes visible once PUBLISHED.
```

- [ ] **Step 5: Write the domain docs**

`docs/domain/business-rules.md` — the canonical BR table. Copy the ten rows from this plan's
Global Constraints section verbatim, each followed by a line naming its test:

```markdown
# Business rules

Each rule has a stable ID referenced from test names and from the one permitted code comment.
`grep -r BR-003` returns the rule, its test, and its implementation.

## BR-001 — Only a global ADMIN publishes a listing

Tested: `apps/api/src/modules/listings/listings.admin.routes.test.ts`
Implemented: `middleware/auth.ts requireAdmin`, `listings.service.publishAsAdmin`

## BR-002 — A PUBLISHED slug is immutable; changes create a redirect

Google is the acquisition channel, so a broken URL is lost traffic.
Tested: `listings.service.test.ts`, `institutes.routes.test.ts`
Implemented: `listings.service.changeSlug`, `ListingRedirect`

## BR-003 — A batch cannot be PUBLISHED with a start date in the past

Tested: `batches.service.test.ts`
Implemented: `batches.service.updateForOrg`

## BR-004 — A batch cannot be PUBLISHED unless its listing is PUBLISHED

Prevents content reaching the public site around the moderation gate.
Tested: `batches.service.test.ts`
Implemented: `batches.service.updateForOrg`

## BR-005 — Money is integer minor units with an explicit currency

Floats cannot represent currency exactly. Rupees are converted at the UI boundary.
Tested: `contracts.test.ts`, `format.test.ts`, `institutes.routes.test.ts`
Implemented: `Batch.feeAmount Int`, `createBatchBody`, `apps/web/src/lib/format.ts`

## BR-006 — Reviews are PENDING until moderated

Schema only in P0; no endpoints until P2.
Implemented: `Review.status` default PENDING

## BR-007 — Enquiries are readable only by the owning organisation and ADMINs

Implemented: `enquiries.service.listForListing` is reachable only through org-scoped routes.
P0 exposes no enquiry read endpoint; P2 adds the lead inbox.

## BR-008 — Comparison accepts 2–4 listings of one vertical

P1, not implemented.

## BR-009 — Only PUBLISHED listings appear in public routes

Tested: `institutes.routes.test.ts`, `enquiries.routes.test.ts`, `listings.service.test.ts`
Implemented: `listings.service.resolvePublishedSlug`, `institutes.repository` status filter

## BR-010 — seatsAvailable is always between 0 and seatsTotal

Enforced twice: in the service, and by the `Batch_seats_invariant` CHECK constraint.
Tested: `batches.service.test.ts`
```

`docs/domain/glossary.md`:

```markdown
# Glossary

**Listing** — the shared core row for anything discoverable, discriminated by `vertical`.
Carries identity, slug, status, location, rating. Not institute-specific.

**Institute** — a Listing with `vertical = INSTITUTE` plus its `InstituteProfile`. In
conversation "institute" usually means the pair; in code they are separate rows.

**Batch** — a dated cohort belonging to one institute Listing: exam, mode, schedule, seats,
fee. Has its own DRAFT/PUBLISHED/ARCHIVED status, independent of its listing's status.

**Organization** — the partner account that owns listings. Mirrors a Clerk organisation.
A user acts on behalf of exactly one at a time (`req.auth.orgId`).

**Membership** — a user's role within an organisation: OWNER, MANAGER, VIEWER.

**Global role** — `User.globalRole`, either USER or ADMIN. Distinct from Membership role.
ADMIN is granted only by direct database write; no endpoint grants it.

**Enquiry** — a student's lead on a listing, optionally naming a batch. Becomes the
admissions pipeline in P3.

**Vertical** — a listing category with its own typed profile tables. INSTITUTE today,
HOSTEL planned.
```

- [ ] **Step 6: Write the ADRs**

Create `docs/decisions/0001-monorepo-with-three-apps.md` through
`0007-pnpm-and-turborepo.md`, one per row of the spec's §4 decision table. Each uses:

```markdown
# ADR 0001 — Single monorepo with three deployable apps

Date: 2026-10-11
Status: Accepted

## Context

<the situation and constraints that forced a choice>

## Decision

<what we are doing>

## Alternatives rejected

<each option and the specific reason it lost>

## Consequences

<what this makes easy, what it makes harder, what we accept>
```

Fill each from the spec's §4 table — the titles are: 0001 monorepo with three apps, 0002
separate web and partner apps, 0003 Zod contracts with generated OpenAPI, 0004 thin
listing core with vertical modules, 0005 Postgres with Prisma, 0006 Clerk for auth and
organisations, 0007 pnpm and Turborepo. ADRs are immutable: supersede, never edit.

- [ ] **Step 7: Write the runbooks and work templates**

`docs/runbooks/local-setup.md`:

```markdown
# Local setup

Verified on macOS 2026-10-11.

## Prerequisites

- Node 22.16+ (`node --version`)
- pnpm 12.11.2, installed globally via npm: `npm install -g pnpm@12.11.2`
  **Do not use corepack** — 0.32 cannot load pnpm 12's `.mjs` bin, and 0.36 needs Node 22.22+.
- Postgres 17: `brew install postgresql@17 && brew services start postgresql@17`
  Add `/opt/homebrew/opt/postgresql@17/bin` to `PATH` (the formula is keg-only).

## Databases

    psql -d postgres -c "CREATE ROLE one_academy WITH LOGIN PASSWORD 'local_dev_only' CREATEDB;"
    createdb -O one_academy one_academy_dev
    createdb -O one_academy one_academy_test

The password is local-only and must never appear in a deployed environment.

## Install and run

    pnpm install
    cp apps/api/.env.example apps/api/.env
    cp apps/web/.env.example apps/web/.env.local
    cp apps/partner/.env.example apps/partner/.env.local   # needs real Clerk test keys
    pnpm --filter @one/db db:migrate
    pnpm --filter @one/db db:seed
    DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test" \
      pnpm --filter @one/db exec prisma migrate deploy
    pnpm dev

API on :4000, web on :3000, partner on :3001.

## Verify

    pnpm verify
```

`docs/runbooks/migrations.md`:

```markdown
# Migrations

## Development

    pnpm --filter @one/db db:migrate          # prompts for a name, applies to one_academy_dev

Then apply to the test database, or integration tests will fail against a stale schema:

    DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test" \
      pnpm --filter @one/db exec prisma migrate deploy

## Data invariants

A rule that must hold regardless of application code gets a CHECK constraint:

    pnpm --filter @one/db exec prisma migrate dev --create-only --name <name>

then hand-write the SQL. `Batch_seats_invariant` is the worked example (BR-010).

## Rules

- Never edit an applied migration — add a new one.
- Never let the API run migrations at boot; it is an explicit deploy step.
- CI fails if `schema.prisma` and the migration history disagree.
```

`docs/work/requests/TEMPLATE.md` and `docs/work/bugs/TEMPLATE.md` use the frontmatter shapes
from the spec's §10. Also create the first real bug from a known gap:

`docs/work/bugs/BUG-001-clerk-webhook-unverified.md`:

```markdown
---
id: BUG-001
title: Clerk webhook does not verify its signature
status: todo
created: 2026-10-11
---

## Symptom

`POST /api/v1/webhooks/clerk` trusts its payload. Anyone who can reach the endpoint could
create or rename local `User` and `Organization` rows.

## Repro

Send a crafted `organization.created` payload to the endpoint with `CLERK_WEBHOOK_SECRET` set.
It is accepted.

## Root cause

P0 shipped the sync logic without `svix` signature verification; the secret is checked for
presence only, never used to verify.

## Fix

Verify with `svix` using `CLERK_WEBHOOK_SECRET` over the raw body before parsing. Reject with
401 on failure. Add an integration test for a tampered signature.

## Constraint

Must be fixed before the API is exposed publicly. Not a blocker for local development.
```

- [ ] **Step 8: Write the docs freshness script**

`scripts/check-docs-freshness.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const FLOWS_DIR = 'docs/flows'
const SHA_PATTERN = /Last verified against commit:\s*(\S+)/
const ANCHOR_PATTERN = /\b((?:apps|packages)\/[\w./[\]-]+\.(?:ts|tsx|prisma))\b/g

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

let staleCount = 0

for (const file of readdirSync(FLOWS_DIR).filter((name) => name.endsWith('.md'))) {
  const path = join(FLOWS_DIR, file)
  const content = readFileSync(path, 'utf8')

  const shaMatch = SHA_PATTERN.exec(content)
  if (!shaMatch?.[1] || shaMatch[1].startsWith('REPLACE')) {
    console.error(`${path}: no verified sha recorded`)
    staleCount += 1
    continue
  }
  const verifiedSha = shaMatch[1]

  const anchors = [...new Set([...content.matchAll(ANCHOR_PATTERN)].map((match) => match[1]!))]
  const existing = anchors.filter((anchor) => existsSync(anchor))

  for (const anchor of anchors) {
    if (!existsSync(anchor)) {
      console.error(`${path}: anchor no longer exists — ${anchor}`)
      staleCount += 1
    }
  }

  const moved: string[] = []
  for (const anchor of existing) {
    const lastCommit = git(['log', '-1', '--format=%H', '--', anchor])
    if (!lastCommit) continue
    const isAncestor = (() => {
      try {
        execFileSync('git', ['merge-base', '--is-ancestor', lastCommit, verifiedSha], {
          stdio: 'ignore',
        })
        return true
      } catch {
        return false
      }
    })()
    if (!isAncestor) moved.push(anchor)
  }

  if (moved.length > 0) {
    console.error(
      `${path}: stale — verified at ${verifiedSha.slice(0, 8)} but these changed since:\n  ${moved.join('\n  ')}`,
    )
    staleCount += 1
  }
}

if (staleCount > 0) {
  console.error(`\n${staleCount} flow doc(s) need review. Update them and bump the verified sha.`)
  process.exit(1)
}

console.error('All flow docs are current.')
```

- [ ] **Step 9: Stamp the flow docs and verify the script both ways**

```bash
git add -A && git commit -m "docs: seed documentation system, CLAUDE contracts and ADRs"
HEAD_SHA=$(git rev-parse HEAD)
sed -i '' "s/REPLACE_WITH_HEAD_SHA/$HEAD_SHA/" docs/flows/institute-discovery.md docs/flows/listing-lifecycle.md
pnpm exec tsx scripts/check-docs-freshness.ts ; echo "exit=$?"
```

Expected: `All flow docs are current.` and `exit=0`.

Now prove it detects drift:

```bash
git add -A && git commit -m "docs: stamp flow docs with verified commit"
echo "// drift probe" >> apps/api/src/modules/institutes/institutes.service.ts
git add -A && git commit -m "chore: drift probe"
pnpm exec tsx scripts/check-docs-freshness.ts ; echo "exit=$?"
```

Expected: `exit=1`, naming `institutes.service.ts` under `institute-discovery.md`.

Revert the probe and re-stamp:

```bash
git revert --no-edit HEAD
HEAD_SHA=$(git rev-parse HEAD)
sed -i '' "s/Last verified against commit: .*/Last verified against commit: $HEAD_SHA/" \
  docs/flows/institute-discovery.md docs/flows/listing-lifecycle.md
pnpm exec tsx scripts/check-docs-freshness.ts ; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "docs: add flow freshness detector and stamp verified commits"
```

---

### Task 22: End-to-end tests

**Files:**
- Create: `e2e/package.json`, `playwright.config.ts`, `tests/discovery.spec.ts`, `tests/moderation.spec.ts`
- Modify: `pnpm-workspace.yaml` (add `e2e`), `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the running `@one/api` and `@one/web` apps, the seed data from Task 5.
- Produces: `pnpm --filter @one/e2e test` running two Playwright specs.

- [ ] **Step 1: Create the workspace**

Add `- 'e2e'` to `pnpm-workspace.yaml` packages, and add to the catalog:

```yaml
  '@playwright/test': 1.57.0
```

`e2e/package.json`:

```json
{
  "name": "@one/e2e",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "echo no-op",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "playwright test"
  },
  "devDependencies": {
    "@one/config": "workspace:*",
    "@one/db": "workspace:*",
    "@playwright/test": "catalog:",
    "typescript": "catalog:"
  }
}
```

`e2e/tsconfig.json`:

```json
{ "extends": "@one/config/tsconfig.node", "compilerOptions": { "noEmit": true }, "include": ["."] }
```

`e2e/eslint.config.js`:

```js
import base from '@one/config/eslint/base'

export default [...base, { rules: { 'no-console': 'off' } }]
```

`e2e/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

const DB_URL = 'postgresql://one_academy:local_dev_only@localhost:5432/one_academy_e2e'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'pnpm --filter @one/api dev',
      url: 'http://localhost:4000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: { DATABASE_URL: DB_URL, NODE_ENV: 'test', PORT: '4000' },
    },
    {
      command: 'pnpm --filter @one/web dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: { API_BASE_URL: 'http://localhost:4000' },
    },
  ],
})
```

A dedicated `one_academy_e2e` database keeps E2E runs from truncating the database the
unit tests use. Create it once:

```bash
createdb -O one_academy one_academy_e2e
DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_e2e" \
  pnpm --filter @one/db exec prisma migrate deploy
```

Running the API with `NODE_ENV=test` is what makes the `x-test-auth` header available to
the moderation spec, avoiding a dependency on live Clerk sessions.

- [ ] **Step 2: Write the discovery spec**

`e2e/tests/discovery.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { prisma } from '@one/db'

test.beforeAll(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "Enquiry", "Review", "ListingTag", "MediaAsset", "ListingRedirect",
      "Batch", "InstituteProfile", "Listing", "Membership", "Organization", "User",
      "Tag", "City" RESTART IDENTITY CASCADE;
  `)

  const city = await prisma.city.create({
    data: { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({ data: { name: 'Alpha', slug: 'alpha' } })

  await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'alpha-academy',
      name: 'Alpha Academy',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      organizationId: org.id,
      cityId: city.id,
      shortDescription: 'JEE and NEET coaching',
      instituteProfile: { create: { establishedYear: 2011, modes: ['OFFLINE'] } },
      batches: {
        create: {
          title: 'JEE Advanced 2027',
          exam: 'JEE',
          mode: 'OFFLINE',
          startDate: new Date('2027-04-01T00:00:00Z'),
          seatsTotal: 60,
          seatsAvailable: 18,
          feeAmount: 12500000,
          status: 'PUBLISHED',
        },
      },
    },
  })
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('student browses, opens an institute and submits an enquiry', async ({ page }) => {
  await page.goto('/institutes')
  await expect(page.getByRole('heading', { name: 'Coaching institutes' })).toBeVisible()

  await page.getByRole('link', { name: 'Alpha Academy' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha Academy' })).toBeVisible()

  await expect(page.getByText('JEE Advanced 2027')).toBeVisible()
  await expect(page.getByText('₹1,25,000')).toBeVisible()

  await page.getByLabel('Your name').fill('Asha Rao')
  await page.getByLabel('Phone').fill('9876543210')
  await page.getByRole('button', { name: 'Request callback' }).click()

  await expect(page.getByText(/institute will contact you/i)).toBeVisible()

  const enquiry = await prisma.enquiry.findFirstOrThrow()
  expect(enquiry.name).toBe('Asha Rao')
  expect(enquiry.phone).toBe('9876543210')
})

test('a draft listing is not publicly reachable (BR-009)', async ({ page }) => {
  const city = await prisma.city.findFirstOrThrow()
  const org = await prisma.organization.findFirstOrThrow()
  await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'secret-academy',
      name: 'Secret Academy',
      status: 'DRAFT',
      organizationId: org.id,
      cityId: city.id,
    },
  })

  await page.goto('/institutes/secret-academy')
  await expect(page.getByText('Institute not found')).toBeVisible()
})
```

- [ ] **Step 3: Write the moderation spec**

`e2e/tests/moderation.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { prisma } from '@one/db'

const API = 'http://localhost:4000'
const ADMIN_AUTH = JSON.stringify({ userId: 'e2e-admin', globalRole: 'ADMIN' })

let listingId = ''
let orgId = ''

test.beforeAll(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "Enquiry", "Review", "ListingTag", "MediaAsset", "ListingRedirect",
      "Batch", "InstituteProfile", "Listing", "Membership", "Organization", "User",
      "Tag", "City" RESTART IDENTITY CASCADE;
  `)

  const city = await prisma.city.create({
    data: { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({
    data: { name: 'Beta Coaching', slug: 'beta-coaching', clerkOrgId: 'co_e2e' },
  })
  orgId = org.id

  const listing = await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'beta-coaching-centre',
      name: 'Beta Coaching Centre',
      status: 'DRAFT',
      organizationId: org.id,
      cityId: city.id,
      shortDescription: 'New centre awaiting review',
      instituteProfile: { create: { modes: ['HYBRID'] } },
    },
  })
  listingId = listing.id
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('partner creates a batch, admin publishes, batch appears publicly', async ({
  request,
  page,
}) => {
  const partnerAuth = JSON.stringify({ userId: 'e2e-partner', orgId: 'co_e2e', globalRole: 'USER' })

  const created = await request.post(`${API}/api/v1/partner/listings/${listingId}/batches`, {
    headers: { 'x-test-auth': partnerAuth, 'content-type': 'application/json' },
    data: {
      title: 'NEET 2028 Foundation',
      exam: 'NEET',
      mode: 'HYBRID',
      startDate: '2028-03-01',
      seatsTotal: 40,
      feeAmount: 8800000,
    },
  })
  expect(created.status()).toBe(201)
  const batchId = (await created.json()).id as string

  const submitted = await request.post(`${API}/api/v1/partner/listings/${listingId}/submit`, {
    headers: { 'x-test-auth': partnerAuth, 'content-type': 'application/json' },
  })
  expect(submitted.status()).toBe(200)
  expect((await submitted.json()).status).toBe('PENDING_REVIEW')

  // BR-004: publishing a batch is refused while the listing is unpublished.
  const tooEarly = await request.patch(`${API}/api/v1/partner/batches/${batchId}`, {
    headers: { 'x-test-auth': partnerAuth, 'content-type': 'application/json' },
    data: { status: 'PUBLISHED' },
  })
  expect(tooEarly.status()).toBe(409)
  expect((await tooEarly.json()).error.code).toBe('BATCH_PARENT_NOT_PUBLISHED')

  // BR-001: only an admin may publish the listing.
  const asPartner = await request.post(`${API}/api/v1/admin/listings/${listingId}/publish`, {
    headers: { 'x-test-auth': partnerAuth, 'content-type': 'application/json' },
  })
  expect(asPartner.status()).toBe(403)

  const published = await request.post(`${API}/api/v1/admin/listings/${listingId}/publish`, {
    headers: { 'x-test-auth': ADMIN_AUTH, 'content-type': 'application/json' },
  })
  expect(published.status()).toBe(200)

  const batchPublished = await request.patch(`${API}/api/v1/partner/batches/${batchId}`, {
    headers: { 'x-test-auth': partnerAuth, 'content-type': 'application/json' },
    data: { status: 'PUBLISHED' },
  })
  expect(batchPublished.status()).toBe(200)

  await page.goto('/institutes/beta-coaching-centre')
  await expect(page.getByRole('heading', { level: 1, name: 'Beta Coaching Centre' })).toBeVisible()
  await expect(page.getByText('NEET 2028 Foundation')).toBeVisible()
  await expect(page.getByText('₹88,000')).toBeVisible()
})
```

This single spec is the P0 acceptance criterion executed automatically, including the two
negative cases that prove the moderation gate is real.

- [ ] **Step 4: Install browsers and run**

```bash
pnpm install
pnpm --filter @one/e2e exec playwright install chromium
pnpm --filter @one/e2e test
```

Expected: 3 passing. If the web server times out, raise the `timeout` in `playwright.config.ts`
— the first Next.js dev compile is slow. If `₹1,25,000` is not found, check what
`formatFee` actually produced and reconcile with the Task 16 formatter test rather than
loosening the assertion.

- [ ] **Step 5: Add E2E to CI**

Append a second job to `.github/workflows/ci.yml`:

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: verify
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: one_academy
          POSTGRES_PASSWORD: local_dev_only
          POSTGRES_DB: one_academy_e2e
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://one_academy:local_dev_only@localhost:5432/one_academy_e2e
      API_BASE_URL: http://localhost:4000
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: '22.16.0' }
      - run: npm install -g pnpm@12.11.2
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @one/db db:generate
      - run: pnpm --filter @one/db db:migrate:deploy
      - run: pnpm --filter @one/e2e exec playwright install --with-deps chromium
      - run: pnpm --filter @one/e2e test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: e2e/playwright-report/
```

- [ ] **Step 6: Final full verification**

```bash
pnpm verify
pnpm --filter @one/shared gen:openapi && git diff --exit-code -- docs/api/openapi.json
pnpm exec tsx scripts/check-docs-freshness.ts
pnpm --filter @one/e2e test
```

Expected: all four exit 0. **This is P0 complete.**

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: add end-to-end discovery and moderation specs"
```

---

## Self-Review Record

Run against the spec on 2026-10-11.

**Spec coverage.** Every section maps to a task: §5 repo layout → Tasks 1, 16, 19; §6
backend architecture and R1–R6 → Tasks 2, 9–15; §7 data model → Task 4; §8 business rules →
Tasks 10, 12, 14, 15 (BR-006 and BR-008 are explicit non-goals, recorded in Task 14's notes
and `business-rules.md`); §9 contract → Tasks 6–8; §10 documentation → Task 21; §11
guardrails → Tasks 2, 21; §12 enforcement → Tasks 3, 9, 22; §13 local environment → Task 21's
runbook; §14 milestones → the phase table.

**Deviations from the spec, deliberate:**

1. **`validated<T>(req, key)` helper** — the spec says every route input is validated but
   does not say how a route reads validated input type-safely. This helper throws if
   `validate()` was forgotten, turning R5 from a convention into a runtime guarantee.
2. **`x-test-auth` test seam, gated on `NODE_ENV=test`** — the spec requires integration
   tests for every endpoint and real-database testing, which is impossible for authenticated
   routes without either live Clerk sessions in CI or an injectable auth context. This is the
   only test-only branch in the API and is documented in `apps/api/CLAUDE.md`.
3. **A third database, `one_academy_e2e`** — the spec names dev and test. E2E truncates
   tables, so sharing `one_academy_test` would make unit and E2E runs interfere.
4. **`BUG-001` filed during P0** — Clerk webhook signature verification is not implemented.
   Recording it as a tracked bug is better than leaving an unmarked gap; the endpoint refuses
   to operate without the secret configured.
5. **Batch lists are unpaginated**, unlike the spec's blanket pagination rule, because a
   listing's batch count is bounded. Noted in Task 7.

**Type consistency checks performed:** `MinimalSeed` fields are used identically across
Tasks 9–15. `repo.BatchRow` is the single row type consumed by `toSummary`, `createForOrg`
and `updateForOrg`. `AdminListingSummary` is produced only by `toAdminSummary`.
`PartnerListingDetail.batches` carries `status`, supplied by `batches.service.listAllForListing`
and consumed by the partner detail page. `apiGet`/`apiPost` in `apps/web` and
`partnerApiGet`/`partnerApiSend` in `apps/partner` are deliberately separate, since only the
latter attaches a bearer token.

**Known risk accepted:** `eslint-plugin-boundaries` capture templating (`${from.module}`) is
unverified against v7.2.0. Task 2 Step 6 includes a fallback and requires the rule to fire
before the task may be closed.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-11-p0-foundation.md`.









