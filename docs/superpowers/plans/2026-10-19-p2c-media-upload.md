# P2c Media Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let partners add a logo and up to 10 photos to a listing, re-encoded and metadata-stripped on the server, moderated like text, and shown on public cards and detail pages.

**Architecture:** A new `media` API module receives multipart uploads (multer, memory), decodes and re-encodes them with sharp into fixed WebP variants, and writes them through `lib/storage.ts` (drivers `fs` and `s3`). Rows store a storage key; URLs are built at read time. Media writes reuse P2b's review lock and change tracking through one listings-service helper, and the watched snapshot gains `logo` and `photos`.

**Tech Stack:** Express 5.3.0, multer 2.4.0, sharp 0.35.5, @aws-sdk/client-s3 3.1146.0, Prisma 7.10.0, Zod 4.6.5, Next.js 16.4.0, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-p2c-media-upload-design.md`

## Global Constraints

- Branch `p2c-media` (from `p2b-moderation`). Conventional commits; never commit to `main`.
- New dependencies pinned exactly in the `catalog:` of `pnpm-workspace.yaml`: `multer: 2.4.0`, `'@types/multer': 2.3.0`, `sharp: 0.35.5`, `'@aws-sdk/client-s3': 3.1146.0`.
- R1–R6 hold. `multer` is imported only in `apps/api/src/middleware/upload.ts` (R2: services never see Express). Cross-module calls go through services; `media.service` may call `listings.service`, never the reverse.
- `MEDIA_LIMITS` (exact): `logos: 1`, `photos: 10`, `maxBytes: 8 * 1024 * 1024`, `maxPixels: 40_000_000`, `altMax: 120`.
- Variants (exact): photos `-640.webp` and `-1600.webp` (width, never upscaled); logo `-256.webp`, 256 × 256, `fit: 'contain'` on white. Header `Cache-Control: public, max-age=31536000, immutable`.
- Storage key format: `listings/<listingId>/<cuid2>`; a key is never reused.
- Every status-dependent media write is guarded inside its transaction by `tx.listing.updateMany({ where: { id, status: { not: 'PENDING_REVIEW' } }, data: { updatedAt: new Date() } })`; count 0 → `LISTING_UNDER_REVIEW` (same pattern as the P2b review fix).
- Never mock the database. Tests use `STORAGE_DRIVER=fs` into a temp directory; fixture images are generated with sharp in `apps/api/test/helpers/images.ts`, never checked in.
- After each migration, migrate the test DB (command in the P2b plan's Global Constraints). Register every new path in `gen-openapi.ts` and regenerate.
- Copy is exactly as the spec gives it. Mobile first.

## Review Focus

1. **A P2b-era stored snapshot has no `logo`/`photos` keys** — it must still parse (as `null`/`[]`), not be treated as missing and silently re-baselined over unreviewed changes. (Task 4 test `parses a snapshot from before media`.)
2. **Several uploads race the 10-photo limit** — at most 10 photos exist afterwards. (Task 2 test `never exceeds 10 photos under concurrent uploads`.)
3. **An admin deletes a photo from a published listing** — the listing must not appear under Changed because of the admin's own action. (Task 4 test `admin delete does not flag the listing`.)
4. **A transparent PNG logo** — the 256 variant is opaque with white where the logo was transparent, not black. (Task 2 test `flattens a transparent logo onto white`.)
5. **Reorder with an id from another listing** — 400, order unchanged. (Task 3 test `400s an order containing another listing's photo`.)

---

### Task 1: Dependencies, schema, storage drivers

**Files:**

- Modify: `pnpm-workspace.yaml` (catalog), `apps/api/package.json` (deps `multer`, `sharp`, `@aws-sdk/client-s3`; dev `@types/multer`)
- Modify: `packages/db/prisma/schema.prisma`; migration `media_assets` (hand-append the partial unique index)
- Modify: `apps/api/src/config/index.ts`, `apps/api/.env.example`, `apps/api/vitest.config.ts` (test env), `.gitignore` (`apps/api/.media/`)
- Create: `apps/api/src/lib/storage.ts`, `apps/api/src/lib/storage.test.ts`, `apps/api/src/lib/storage.s3.test.ts`, `apps/api/src/lib/media.ts`
- Modify: `apps/api/src/server.ts` (static `/media` for `fs`)

**Interfaces:**

- Produces (schema): `enum MediaPurpose { LOGO PHOTO }`; `MediaAsset` gains `purpose MediaPurpose @default(PHOTO)`, `storageKey String @unique`, `width Int`, `height Int`, `createdAt DateTime @default(now())`; `url` removed. Migration SQL addition:
  ```sql
  CREATE UNIQUE INDEX "MediaAsset_one_logo_per_listing" ON "MediaAsset" ("listingId") WHERE "purpose" = 'LOGO';
  ```
- Produces (config): `STORAGE_DRIVER: z.enum(['fs','s3']).default('fs')`, `MEDIA_FS_ROOT` default `'.media'`, `MEDIA_PUBLIC_BASE_URL: z.url()` default `'http://localhost:4000/media'`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION` (default `'auto'`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` — refine: all S3 vars required when driver is `s3`. Exposed as `config.storage = { driver, fsRoot, publicBaseUrl, s3?: {...} }`.
- Produces (`lib/storage.ts`): `putObject(key: string, body: Buffer, contentType: string): Promise<void>`, `deleteObjects(keys: string[]): Promise<void>`, `publicUrl(key: string): string`. `fs` writes `<fsRoot>/<key>` (mkdir -p). Throws on failure; callers decide.
- Produces (`lib/media.ts`): `type MediaPurpose = 'LOGO' | 'PHOTO'`; `variantKeys(storageKey: string, purpose: MediaPurpose): string[]`; `toMediaAsset(row: MediaRow): MediaAsset` where `MediaRow = { id; purpose; storageKey; alt: string | null; width: number; height: number; sortOrder: number }` (photo: `url` = 1600, `thumbUrl` = 640; logo: `url` = 256, `thumbUrl` null).
- Produces (`server.ts`): when `config.storage.driver === 'fs'`, `app.use('/media', express.static(config.storage.fsRoot, { immutable: true, maxAge: '1y', fallthrough: false }))` before the API routers.

- [ ] **Step 1:** Add the catalog pins and package deps; `pnpm install`; `pnpm approve-builds` is not needed (sharp is already allowed). Expected: lockfile updates, `pnpm --filter @one/api typecheck` passes.
- [ ] **Step 2: Failing tests** in `storage.test.ts` (fs driver, `MEDIA_FS_ROOT` = temp dir set in `vitest.config.ts` `test.env`, plus `MEDIA_PUBLIC_BASE_URL=http://localhost:4000/media`):
  - `putObject writes the bytes under the key` — read back with `fs.readFile`.
  - `deleteObjects removes every key and ignores a missing one`.
  - `publicUrl joins the base URL and the key` → `'http://localhost:4000/media/listings/l1/abc-640.webp'`.
  - `variantKeys gives two webp keys for a photo and one for a logo`.
  - In a route test (`apps/api/src/lib/storage.test.ts` via `testApp()`): `serves a stored object at /media with an immutable cache header`.
    `storage.s3.test.ts`: `describe.skipIf(!process.env.S3_TEST_ENDPOINT)` — put, read back via `GetObjectCommand`, delete. Print the skip reason with `console.info` once.
- [ ] **Step 3:** Run `pnpm --filter @one/api test -- storage` → FAIL (module missing).
- [ ] **Step 4:** Implement schema + migration (migrate dev and test DBs; `db:generate`; build `@one/db`), config, `storage.ts`, `media.ts`, the static route. Update `institutes.repository` and `institutes.service` so nothing reads `MediaAsset.url` (temporarily map public `media` to `[]`; Task 5 replaces the contract).
- [ ] **Step 5:** Run → PASS; `pnpm verify` → green.
- [ ] **Step 6: Commit** `feat(api): media schema and storage drivers`

---

### Task 2: Image pipeline and upload endpoint (BR-019, BR-020)

**Files:**

- Create: `packages/shared/src/media.ts` (export from index), `packages/shared/src/contracts/media.ts` (export from contracts index)
- Modify: `packages/shared/src/errors.ts` (`'MEDIA_INVALID'`, `'MEDIA_LIMIT_REACHED'`), `packages/shared/src/contracts/partner.ts`
- Modify: `apps/api/src/lib/errors.ts`
- Create: `apps/api/src/middleware/upload.ts`
- Create: `apps/api/src/modules/media/media.images.ts`, `media.repository.ts`, `media.service.ts`, `media.partner.routes.ts`, `media.partner.routes.test.ts`, `media.images.test.ts`
- Create: `apps/api/test/helpers/images.ts`
- Modify: `apps/api/src/modules/listings/listings.service.ts` (edit helper), `apps/api/src/modules/institutes/institutes.service.ts` (partner detail `media`), `apps/api/src/server.ts`, `packages/shared/scripts/gen-openapi.ts`

**Interfaces:**

- Produces (shared `media.ts`): `MEDIA_LIMITS` (Global Constraints), `MEDIA_PURPOSES = ['LOGO', 'PHOTO'] as const`, `mediaPurposeSchema`.
- Produces (shared `contracts/media.ts`): `mediaAsset = z.object({ id, purpose: mediaPurposeSchema, url, thumbUrl: z.string().nullable(), alt: z.string().nullable(), width: int, height: int, sortOrder: int })`; `uploadMediaFields = z.object({ purpose: mediaPurposeSchema, alt: z.string().trim().max(120).optional() })`; `mediaIdParam = z.object({ assetId: z.string().min(1) })`. `partnerListingDetail` gains `media: z.array(mediaAsset)`.
- Produces (`lib/errors.ts`): `class MediaInvalidError extends AppError` — `('MEDIA_INVALID', 400, message, { reason })`, `reason: 'NOT_AN_IMAGE' | 'TOO_LARGE' | 'TOO_MANY_PIXELS'`.
- Produces (`middleware/upload.ts`): `uploadSingleImage` — `multer({ storage: multer.memoryStorage(), limits: { fileSize: MEDIA_LIMITS.maxBytes, files: 1, fields: 5 } }).single('file')`, wrapped so `LIMIT_FILE_SIZE` → `MediaInvalidError('TOO_LARGE')`, other multer errors → `BadRequestError`, and a missing file → `BadRequestError('A file is required')`.
- Produces (`media.images.ts`): `processImage(input: Buffer, purpose: MediaPurpose): Promise<{ variants: { key suffix: string; body: Buffer }[]; width: number; height: number }>` — `sharp(input, { limitInputPixels: MEDIA_LIMITS.maxPixels, failOn: 'error' })`; read `metadata()` first and accept only `format` in `jpeg | png | webp` (else `NOT_AN_IMAGE`); a sharp pixel-limit error → `TOO_MANY_PIXELS`; `.rotate()`; photos `resize({ width, withoutEnlargement: true }).webp({ quality: 80 })` per size; logo `resize(256, 256, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).webp({ quality: 85 })`. `width`/`height` are the 1600 (or 256) variant's.
- Produces (`listings.service.ts`): `applyPartnerEdit<T>(listingId: string, write: () => Promise<T | false>): Promise<T>` — `ensureReviewBaseline` → `write()` (false → `ConflictError('LISTING_UNDER_REVIEW', …)`) → `recordPartnerEdit(listingId, before)` → `revalidatePublicPages()` if the listing is PUBLISHED. Media writes use it; `institutes.updateForOrg` is left as it is.
- Produces (`media.repository.ts`): `listByListing(listingId): Promise<MediaRow[]>` (logo first, then photos by `sortOrder`); `insertGuarded(row: { listingId; purpose; storageKey; alt; width; height }): Promise<MediaRow | false | 'LIMIT'>` — in one transaction: the listing guard (Global Constraints), then for PHOTO count photos and return `'LIMIT'` at 10 (the guard's row lock serialises concurrent uploads), for LOGO delete any existing logo row (returning its key for the caller to delete objects), then insert with `sortOrder = max + 1`. Return shape may carry `replacedKey?: string`.
- Produces (`media.service.ts`): `uploadForOrg(listingId: string, organizationId: string, input: { buffer: Buffer; purpose: MediaPurpose; alt?: string }): Promise<MediaAsset>` — ownership via `listings.service.assertOrgOwnsListing`; `processImage`; `putObject` each variant (failure → `UpstreamUnavailableError`, nothing inserted); `applyPartnerEdit` around `insertGuarded`; on `false`/`'LIMIT'`/insert error delete the written objects best-effort; on logo replace delete the old objects best-effort. `listForListing(listingId: string): Promise<MediaAsset[]>`.
- Route: `POST /api/v1/partner/listings/:listingId/media` — `requireAuth, requireOrg, uploadSingleImage, validate({ params: listingIdParam, body: uploadMediaFields })` → 201. Router `partnerMediaRouter` mounted at `/api/v1/partner`.

- [ ] **Step 1: Test helpers** — `apps/api/test/helpers/images.ts`: `solidImage({ width, height, format: 'jpeg' | 'png' | 'webp', alpha?: boolean }): Promise<Buffer>`; `jpegWithExifGps({ width, height, orientation: 6 }): Promise<Buffer>` (sharp `.withMetadata({ orientation })` and `.withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '18/1 31/1 0/1' } })`; assert in the helper's own first test that the fixture really carries `exif`).
- [ ] **Step 2: Failing tests** — `media.images.test.ts`:
  - `rotates by EXIF orientation and strips all metadata` — 40×20 JPEG, orientation 6 → 1600 variant metadata `{ format: 'webp', width: 20, height: 40 }`, `exif` undefined.
  - `never upscales` — 300×200 → 640 variant width 300.
  - `writes 640 and 1600 variants for a large photo` — 3000×2000 → widths 640 and 1600.
  - `flattens a transparent logo onto white` — transparent 100×50 PNG → 256×256, `hasAlpha` false, pixel (0,0) is (255,255,255).
  - `rejects SVG, text and random bytes as NOT_AN_IMAGE` (`<svg xmlns=…>` buffer, `'hello'`, 1 KB of random bytes).
  - `rejects 7000×7000 as TOO_MANY_PIXELS` (solid PNG; small in bytes).

  `media.partner.routes.test.ts` (attach with supertest `.attach('file', buffer, 'x.jpg').field('purpose', 'PHOTO')`):
  - `uploads a photo, stores both variants, returns absolute URLs` — 201; files exist under the temp root; `url` ends `-1600.webp`.
  - `accepts a PNG named .jpg` (content decides) and `400s an SVG named .jpg with MEDIA_INVALID NOT_AN_IMAGE and writes nothing` (temp root has no new files).
  - `400s 8 MB + 1 byte as TOO_LARGE`.
  - `409s the 11th photo with MEDIA_LIMIT_REACHED`.
  - `never exceeds 10 photos under concurrent uploads` — 9 existing, `Promise.all` of 3 → exactly one 201; count is 10.
  - `replaces the logo and deletes the old logo's object`.
  - `403s another organisation's listing`; `400s a missing file`; `400s alt over 120 characters`.
  - `409s LISTING_UNDER_REVIEW for an upload to a listing in review and writes nothing`.
  - `returns media in the partner listing detail, logo first`.

- [ ] **Step 3:** Run `pnpm --filter @one/api test -- media` → FAIL.
- [ ] **Step 4:** Implement the shared module and contracts (build `@one/shared`), errors, middleware, images, repository, service, route, mount, partner detail `media`. Register the path in `gen-openapi.ts` (request body as `multipart/form-data` with `file: string format binary`, `purpose`, `alt`); regenerate.
- [ ] **Step 5:** Run → PASS; `pnpm verify` → green.
- [ ] **Step 6: Commit** `feat(api): photo and logo upload with server-side re-encoding (BR-019, BR-020)`

---

### Task 3: Captions, order and delete

**Files:**

- Modify: `packages/shared/src/contracts/media.ts`, `media.repository.ts`, `media.service.ts`, `media.partner.routes.ts`, `media.partner.routes.test.ts`, `gen-openapi.ts`
- Modify: `apps/api/src/server.ts` (CORS `access-control-allow-methods` adds `PUT,DELETE` for consistency)

**Interfaces:**

- Produces (shared): `updateMediaBody = z.object({ alt: z.string().trim().max(120).nullable() })`; `reorderMediaBody = z.object({ assetIds: z.array(z.string().min(1)).min(1).max(10) })`.
- Produces (repository): `findById(id): Promise<(MediaRow & { listingId: string }) | null>`; `updateAltGuarded(id, listingId, alt): Promise<MediaRow | false>`; `reorderGuarded(listingId, assetIds): Promise<MediaRow[] | false | 'MISMATCH'>` — `'MISMATCH'` unless `assetIds` is exactly the listing's photo ids (no duplicates, none missing, none foreign); sets `sortOrder` to the index; `deleteGuarded(id, listingId): Promise<{ storageKey; purpose } | false>`.
- Produces (service): `updateAltForOrg(assetId, organizationId, alt: string | null): Promise<MediaAsset>`; `reorderForOrg(listingId, organizationId, assetIds: string[]): Promise<MediaAsset[]>` (`'MISMATCH'` → `BadRequestError`); `deleteForOrg(assetId, organizationId): Promise<void>` (row first, then `deleteObjects` best-effort with `logger.warn`). All through `applyPartnerEdit`; an unknown asset is 404, another organisation's 403 (via the asset's `listingId`).
- Routes: `PATCH /api/v1/partner/media/:assetId`, `PUT /api/v1/partner/listings/:listingId/media/order`, `DELETE /api/v1/partner/media/:assetId` (204).

- [ ] **Step 1: Failing tests**: `saves and clears alt text`; `reorders photos`; `400s an order missing a photo`; `400s an order repeating a photo`; `400s an order containing another listing's photo` (order unchanged afterwards); `deletes a photo and its objects (204)`; `still deletes the row when object deletion fails` (point the photo's `storageKey` at a key whose file was already removed); `404s an unknown asset`; `403s another organisation's asset`; `409s every write while in review` (`it.each` over PATCH, PUT, DELETE).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; register paths; regenerate. **Step 4:** Run → PASS; `pnpm verify` → green.
- [ ] **Step 5: Commit** `feat(api): media captions, order and delete`

---

### Task 4: Moderation — watched media, admin view and admin delete (BR-018 amended)

**Files:**

- Modify: `packages/shared/src/watched.ts`, `watched.test.ts`, `packages/shared/src/contracts/admin.ts`
- Modify: `apps/api/src/modules/listings/listings.repository.ts`, `listings.service.ts`
- Create: `apps/api/src/modules/media/media.admin.routes.ts`; Modify `media.service.ts`, `media.repository.ts`, `apps/api/src/server.ts`
- Test: `listings.admin.routes.test.ts`, `media.partner.routes.test.ts`, new `media.admin.routes.test.ts`

**Interfaces:**

- Produces (shared `watched.ts`): `WATCHED_LISTING_FIELDS` appends `'logo'`, `'photos'`; labels `logo: 'Logo'`, `photos: 'Photos'`. `watchedSnapshotSchema` gives `logo` `.default(null)` and `photos` `.default([])` so older snapshots parse. `diffSnapshot` keeps `photos` **in order** (only `photos` is order-sensitive; other arrays stay sets).
- Produces (shared `admin.ts`): `adminListingDetail` gains `media: z.array(mediaAsset)`.
- Produces (listings): `WATCHED_SELECT` gains `media: { select: { id: true, purpose: true }, orderBy: { sortOrder: 'asc' } }`; `snapshotOf` fills `logo` (the LOGO id or null) and `photos` (PHOTO ids in order). `MODERATION_DETAIL_SELECT` media select includes `storageKey, alt, width, height, sortOrder` and maps through `lib/media.ts toMediaAsset`. New `forgetInSnapshot(listingId: string, assetId: string): Promise<void>` — removes the id from a stored snapshot's `logo`/`photos`, so an admin's deletion is not a partner change.
- Produces (media): `deleteAsAdmin(listingId: string, assetId: string): Promise<{ publicCacheCleared: boolean }>` — no lock (any status), `forgetInSnapshot`, delete row, delete objects best-effort, revalidate if PUBLISHED (else `false`). Route `DELETE /api/v1/admin/listings/:listingId/media/:assetId` on `adminMediaRouter` (`requireAuth, requireAdmin`), mounted at `/api/v1/admin/listings` after `adminListingsRouter`. Response schema `adminMediaDeleteResponse = z.object({ publicCacheCleared: z.boolean() })`.

- [ ] **Step 1: Failing tests**
  - `watched.test.ts`: `treats photo order as a change`; `reports an added logo`; `parses a snapshot from before media` (an object with only the 11 P2b fields parses to `logo: null, photos: []`).
  - `media.partner.routes.test.ts`: `flags a published listing when a photo is added` (admin detail `changes` contains `{ field: 'photos', before: [], after: [id] }`); `does not flag a never-published draft`; `flags a reorder`.
  - `media.admin.routes.test.ts`: `403s a non-admin`; `deletes a photo in any status` (`it.each` DRAFT, PENDING_REVIEW, PUBLISHED, SUSPENDED); `admin delete does not flag the listing` (published listing with a reviewed snapshot including the photo → after delete, `changedSinceReviewAt` null and `changes` empty); `404s an asset of another listing`.
  - `listings.admin.routes.test.ts`: `admin detail includes media with URLs`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; build shared; register path; regenerate. **Step 4:** Run → PASS; `pnpm verify` → green.
- [ ] **Step 5: Commit** `feat(api): moderate media like text and let admins remove one photo`

---

### Task 5: Public contracts

**Files:**

- Modify: `packages/shared/src/contracts/institutes.ts`, `packages/shared/src/contracts/compare.ts`
- Modify: `media.service.ts`, `media.repository.ts`, `apps/api/src/modules/institutes/institutes.service.ts`, `institutes.repository.ts`, `institutes.compare.service.ts`
- Test: `institutes.routes.test.ts`, `institutes.landing.routes.test.ts`, `institutes.compare.routes.test.ts`

**Interfaces:**

- Produces (shared): `instituteSummary` gains `logoUrl: z.string().nullable()`; `instituteDetail` drops `media`, gains `logo: z.object({ url, alt: nullable }).nullable()` and `photos: z.array(z.object({ url, thumbUrl, alt: nullable, width: int, height: int }))`; `compareColumn.institute` gains `logoUrl`.
- Produces (media): `publicMediaFor(listingId: string): Promise<{ logo: PublicLogo | null; photos: PublicPhoto[] }>`; `logoUrlsFor(listingIds: string[]): Promise<Map<string, string>>` (one query).
- `institutes.service`: `toSummary(row, fees, logoUrl: string | null)`; `summariesForFilters` and `getPublishedBySlug` call `logoUrlsFor` / `publicMediaFor`; drop `media` from `InstituteRow`. Compare service fills `logoUrl` the same way. These services are only reached for PUBLISHED listings, so suspended media cannot leak.

- [ ] **Step 1: Failing tests**: `detail returns the logo and ordered photos with absolute URLs`; `detail returns logo null and photos [] for a listing without media`; `search cards carry logoUrl`; `landing cards carry logoUrl`; `compare columns carry logoUrl`; `a suspended listing's photos appear in no public response` (detail 404, absent from search).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; update openapi. **Step 4:** Run → PASS. `pnpm verify` will fail in `apps/web` where the old `media` field is read — fix only the type errors here (remove the `media` read), rendering comes in Task 6. Then green.
- [ ] **Step 5: Commit** `feat(api): public logo and photos`

---

### Task 6: Public web — logos, photo strip, JSON-LD, e2e

**Files:**

- Create: `apps/web/src/app/InstituteLogo.tsx`, `apps/web/src/app/institutes/[slug]/PhotoStrip.tsx`
- Modify: `apps/web/src/app/institutes/page.tsx`, `apps/web/src/app/[landing]/page.tsx`, `apps/web/src/app/compare/CompareTable.tsx`, `apps/web/src/app/institutes/[slug]/page.tsx`
- Modify: `e2e/package.json` (dev `sharp: catalog:`), `e2e/playwright.config.ts` (API env `MEDIA_FS_ROOT` = a temp dir, `MEDIA_PUBLIC_BASE_URL=http://localhost:4100/media`)
- Create: `e2e/tests/media.spec.ts`

**Interfaces:**

- `InstituteLogo({ url, size }: { url: string | null; size: 48 | 96 }): JSX.Element | null` — `<img src={url} width={size} height={size} alt="" loading="lazy" decoding="async" className="shrink-0 rounded-md border border-gray-200 bg-white object-contain">` (decorative: the name sits beside it). Null when `url` is null.
- `PhotoStrip({ photos, name }: { photos: InstituteDetail['photos']; name: string })` — null when empty; `<ul>` snap-scrolling row (`flex snap-x snap-mandatory overflow-x-auto gap-2`, `lg:grid lg:grid-cols-3 lg:overflow-visible`); each `<a href={photo.url}>` wrapping `<img src={photo.thumbUrl} srcSet={`${photo.thumbUrl} 640w, ${photo.url} 1600w`} sizes="(min-width: 1024px) 33vw, 85vw" width={photo.width} height={photo.height} alt={photo.alt ?? `${name} photo ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'}>`.
- JSON-LD gains `logo: institute.logo?.url` and `image: institute.photos.map((p) => p.url)` when present.

- [ ] **Step 1: Failing e2e** `media.spec.ts` (arrange a published listing via `@one/db`; build a 1200×800 JPEG and a 200×200 PNG with sharp; upload both through `POST /api/v1/partner/listings/:id/media` with `x-test-auth` and Playwright `multipart`):
  - `the detail page shows the photo strip with explicit dimensions` — `img[srcset]` visible, `width`/`height` attributes equal the asset's.
  - `the search card shows the logo` — on `/institutes`, an `img` inside the card whose `src` ends `-256.webp`, and the image request returns 200.
  - `the detail page JSON-LD carries logo and image`.
- [ ] **Step 2:** `pnpm e2e` → the new spec FAILS. **Step 3:** Implement components and page changes. **Step 4:** `pnpm e2e` → all pass; `pnpm verify` → green.
- [ ] **Step 5: Commit** `feat(web): logos on cards and a photo strip on the detail page`

---

### Task 7: Partner Photos section and admin media view

**Files:**

- Modify: `apps/partner/next.config.ts` (server action body limit `9mb` — confirm the exact option name in `node_modules/next/dist/docs` for 16.4 before writing it)
- Modify: `apps/partner/src/lib/api.ts` — `partnerApiSend` accepts `'PUT' | 'DELETE'` and treats 204 as `undefined`; new `partnerApiUpload<T>(path: string, form: FormData, schema: ZodType<T>): Promise<T>`; `partnerErrorMessage` adds `MEDIA_INVALID` by `details.reason` (`NOT_AN_IMAGE` "That file isn't a photo we can use.", `TOO_LARGE` "That photo is over 8 MB.", `TOO_MANY_PIXELS` "That photo is too large to process.") and `MEDIA_LIMIT_REACHED` "You already have 10 photos. Delete one to add another."; `UPSTREAM_UNAVAILABLE` on uploads "We couldn't save that photo. Please try again."
- Create: `apps/partner/src/lib/resize.ts` — `downscaleToJpeg(file: File, maxEdge = 2048, quality = 0.85): Promise<Blob>` (`createImageBitmap` + `OffscreenCanvas`, falling back to a `<canvas>` element).
- Create: `apps/partner/src/app/dashboard/[listingId]/PhotosSection.tsx` (client), `media-actions.ts` (server actions `uploadMediaAction`, `updateAltAction`, `moveMediaAction(direction: 'up' | 'down')`, `deleteMediaAction`)
- Modify: `apps/partner/src/app/dashboard/[listingId]/page.tsx` (section between Verification details and Batches)
- Modify: `apps/partner/src/app/admin/review/[listingId]/page.tsx`, `ChangesList.tsx`; Create `AdminMediaGrid.tsx`; Modify `actions.ts` (`deleteMediaAsAdminAction`)

**Interfaces:**

- `PhotosSection({ listingId, media, locked }: { listingId: string; media: MediaAsset[]; locked: boolean })` — spec §9 exactly: logo preview 96 px with Add/Replace/Remove; photo grid (`grid-cols-2 sm:grid-cols-3`) of `thumbUrl`, **Cover** label on the first, Move up/Move down, Delete (confirm "Delete this photo?"), alt input saved on blur; **Add photos** with `multiple` uploads one file at a time showing "Uploading N of M…" and a per-file error line; read-only (no controls) when `locked`. Intro copy verbatim from spec §9.
- `ChangesList` renders `logo`/`photos` changes as thumbnails looked up by id in the detail's `media` (an id no longer present renders "Removed photo"); a `photos` change whose before/after hold the same ids renders "Photo order changed".
- `AdminMediaGrid({ listingId, media })` — thumbnails with a **Delete** button each (confirm "Delete this photo? The institute will see it gone."), shown on the admin detail page in every status.

- [ ] **Step 1:** Implement; `pnpm --filter @one/partner typecheck && pnpm --filter @one/partner lint` → clean.
- [ ] **Step 2:** `pnpm verify` → green (includes the partner production build).
- [ ] **Step 3:** Start the partner app; confirm the pages compile and serve. Record that the signed-in flows were not walked if no Clerk session is available.
- [ ] **Step 4: Commit** `feat(partner): photos section and admin media view`

---

### Task 8: Documentation and close-out

**Files:**

- Create: `docs/flows/media.md`, `docs/decisions/0019-media-through-the-api.md`
- Modify: `docs/flows/listing-lifecycle.md`, `docs/domain/business-rules.md`, `docs/decisions/0009-pinned-dependency-versions.md`, `docs/runbooks/local-setup.md`, `docs/README.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`

- [ ] **Step 1:** `media.md` (pipeline, drivers, moderation hooks, code anchors, `Last verified against commit:` HEAD). Lifecycle: media under BR-017/BR-018 and admin media delete. Business rules: BR-018 amended (`logo`, ordered `photos`), **BR-019** (server-side re-encode, metadata stripped, type decided by decoding), **BR-020** (one logo, ten photos; concurrent uploads serialised). ADR 0019 (spec §5–6; rejected: presigned direct upload, keeping originals, `next/image`). ADR 0009: the four new pins. Runbook: storage env vars, `.media/`, MinIO one-liner for `S3_TEST_ENDPOINT`. `apps/web/CLAUDE.md`: plain `<img>` with API-provided variants, why. `apps/api/CLAUDE.md`: media writes go through `applyPartnerEdit`; multer only in middleware.
- [ ] **Step 2:** `pnpm exec tsx scripts/check-docs-freshness.ts` → all current (re-stamp any flow whose anchors moved); `pnpm verify` → green; `pnpm e2e` → green.
- [ ] **Step 3: Commit** `docs(p2c): media flow, BR-019–020, ADR 0019`
