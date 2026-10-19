# One Academy — P2c: Media upload (logo and photos)

Date: 2026-10-19
Status: Approved
Phase: P2c
Depends on: P2b (moderation tooling: edit lock, change review, cache revalidation)

---

## 1. Context

Every listing on One Academy is text. A student comparing three coaching centres on a phone
sees three identical grey cards, and an institute has no way to show its classrooms,
results board or even its logo. Photos are the single biggest trust signal a discovery
page can carry, and they are what a student screenshots and forwards.

Half of this already exists: `MediaAsset` is in the schema (P0 shared core, ADR 0004) and
the public detail contract returns `media: [{ url, alt }]`. Nothing writes it and the web
app never renders it.

The owner asked to skip the design questions, so every decision below is the spec
author's call, made from the repo and P2b. Each is marked **(call)** where a different
answer would change what gets built; §15 lists them for the owner to check.

| Slice   | Scope                                     | Status    |
| ------- | ----------------------------------------- | --------- |
| P2a     | Self-registration and verification        | Done      |
| P2b     | Moderation tooling                        | Done      |
| **P2c** | Media upload: logo and photos (this doc)  | This spec |
| P2d     | Lead inbox, lead actions, new-lead alerts | Later     |
| P2e     | Partner analytics                         | Later     |

## 2. Goals

1. A partner can add a logo and up to 10 photos from a phone, on a slow mobile connection,
   in under a minute.
2. Students see the logo on search and landing cards and a swipeable photo strip on the
   detail page, without the page getting slower or jumping as images load.
3. Nothing a partner uploads reaches students without passing through the same moderation
   as text (P2b): reviewed before first publication, flagged for review after.
4. The owner can remove one bad photo without suspending the whole listing.
5. Storage can move between providers without a data migration, because hosting is still
   undecided.

## 3. Non-goals

- Video and brochures (`MediaKind.VIDEO`, `BROCHURE` stay unused).
- Image editing — cropping, rotation, filters. The upload is used as taken (orientation is
  corrected from EXIF before EXIF is removed).
- Captions as rich text; `alt` is one optional line.
- A public photo lightbox. Tapping a photo opens the large image URL; a lightbox can come
  later without contract changes.
- Media on batches, reviews or organisations.
- Automatic image moderation (nudity/logo detection). The owner reviews, as for text.
- Cleaning up orphaned objects in storage. Deletion is best-effort (§6).

### Anti-goals

- A phone photo's GPS location published with it.
- A file that is not really an image (an SVG with script, an HTML file renamed `.jpg`)
  ever stored or served.
- A detail page that loads a 6 MB photo on a 4G connection.
- Photos changing on a live listing without the owner being able to see what changed.

## 4. Data model

`MediaAsset` changes (no rows exist in any environment yet, so `url` is replaced rather
than migrated):

| Column       | Type             | Meaning                                                              |
| ------------ | ---------------- | -------------------------------------------------------------------- |
| `purpose`    | `MediaPurpose`   | New enum `LOGO` \| `PHOTO`, default `PHOTO`.                         |
| `storageKey` | `String` @unique | Base key of the stored variants, e.g. `listings/<listingId>/<cuid>`. |
| `width`      | `Int`            | Width of the large variant, for layout without shift.                |
| `height`     | `Int`            | Height of the large variant.                                         |
| `createdAt`  | `DateTime`       | Default now.                                                         |
| ~~`url`~~    | removed          | Public URLs are built at read time from `MEDIA_PUBLIC_BASE_URL`.     |

`kind` stays `IMAGE`. A partial unique index (raw SQL in the migration) allows at most one
`LOGO` per listing. **(call)** Storing the key rather than the URL is what makes goal 5
true: changing provider or CDN is an environment variable, not an `UPDATE`.

Limits, exported from `@one/shared` as `MEDIA_LIMITS`: 1 logo, 10 photos, 8 MB per input
file, 40 megapixels per input image, `alt` ≤ 120 characters.

## 5. Image pipeline

**(call)** Uploads go **through the API**, not straight to the bucket with a presigned
URL. The API must decode every file anyway — to reject non-images, correct orientation,
strip EXIF and resize — so a presigned flow would still pull each file back through the
API, adding a round trip, bucket CORS and an "uploaded but never confirmed" state. At 8 MB
per file and 11 files per listing, the API carrying the bytes is fine.

1. **Partner app, in the browser:** the file input accepts `image/jpeg, image/png,
image/webp`. Before upload the client draws the image to a canvas, scales the long edge
   to at most 2048 px and re-encodes as JPEG (quality 0.85). This is a data saver for
   Indian mobile networks, and it also converts iPhone HEIC, which Safari can decode but
   the server's image library cannot. **(call)** The server never trusts this step.
2. **Partner app server action** forwards the file to the API as `multipart/form-data`.
   `serverActions.bodySizeLimit` in `apps/partner/next.config.ts` is raised to `9mb`.
3. **API** (`multer` with an in-memory store and a 8 MB limit, then `sharp`):
   - Decode with `sharp(buffer, { limitInputPixels: 40_000_000 })`. Anything that does not
     decode as JPEG, PNG or WebP is `400 MEDIA_INVALID` — this is the real type check;
     the filename and declared content type are ignored.
   - `.rotate()` to apply EXIF orientation, then drop all metadata (sharp's default),
     which removes GPS, camera serials and timestamps.
   - Write variants as WebP: photos at **640 px** and **1600 px** wide (never upscaled);
     logos at **256 × 256** fitted inside a white square (`fit: 'contain'`). **(call)**
   - Store under `<storageKey>-640.webp`, `-1600.webp` (photos) or `-256.webp` (logo),
     with `Cache-Control: public, max-age=31536000, immutable` — keys are never reused.
4. **Insert** the `MediaAsset` row after the objects are written. If the insert fails, the
   objects are deleted best-effort.

## 6. Storage

`apps/api/src/lib/storage.ts` is the only module that talks to storage, as
`lib/clerk.ts` is for Clerk. It exposes `putObject(key, body, contentType)`,
`deleteObjects(keys)` and `publicUrl(key)`, with two drivers chosen by `STORAGE_DRIVER`:

- **`s3`** — `@aws-sdk/client-s3` against any S3-compatible endpoint (`S3_ENDPOINT`,
  `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`). Works with AWS S3,
  Cloudflare R2 and MinIO. Production picks the provider with hosting. **(call)**
- **`fs`** — writes under `MEDIA_FS_ROOT` (default `apps/api/.media/`), and the API serves
  that directory at `/media/*` with the same cache header. The default for local
  development and for the test suites, so neither needs a bucket. It is real code, not a
  mock: the integration tests exercise the whole pipeline end to end.

`publicUrl(key)` is `MEDIA_PUBLIC_BASE_URL + '/' + key`. Locally that is
`http://localhost:4000/media`; in production a CDN or the bucket's public domain.

Deletion removes the row first, then the objects best-effort (logged on failure). A stray
object costs storage, never correctness, because nothing references it.

## 7. Moderation

P2b's rules apply to media unchanged:

- **Before first publication**, the admin review page shows the logo and photos, and
  approving publishes them with everything else.
- **BR-017 (edit lock):** uploading, deleting, reordering or re-captioning media on a
  listing in review is `409 LISTING_UNDER_REVIEW`.
- **BR-018 (live, then flagged):** on an ever-published listing, media changes go live
  and flag the listing. The watched snapshot gains two fields, `logo` (asset id or null)
  and `photos` (ordered asset ids). **(call)** Unlike exams, photo **order** is watched —
  the first photo is the cover students see. The admin's change list shows added and
  removed images as thumbnails (it looks the ids up in the detail response's `media`),
  and a reorder as "Photo order changed".
- **New: the admin can delete one photo or the logo** from any listing
  (`DELETE /api/v1/admin/listings/:listingId/media/:assetId`), for the case where one
  photo is the problem and the rest of the listing is fine. **(call)** It is recorded
  nowhere except the change itself; the partner sees the photo gone.
- Every media change on a PUBLISHED listing calls `revalidatePublicPages()` (ADR 0018).

## 8. API surface

All bodies are Zod schemas in `packages/shared/src/contracts/`, every path registered in
`gen-openapi.ts`. Media lives in a new `media` module (`apps/api/src/modules/media/`,
resource-grouped per `apps/api/CLAUDE.md`), reached from other modules through
`media.service` only (R4).

### Partner (`requireAuth`, `requireOrg`)

| Method and path                                       | Behaviour                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/partner/listings/:listingId/media`      | Multipart: `file`, `purpose` (`LOGO`\|`PHOTO`), optional `alt`. 201 with the asset. A second `LOGO` **replaces** the first. 409 `MEDIA_LIMIT_REACHED` at 10 photos. |
| `PATCH /api/v1/partner/media/:assetId`                | Body `{ alt }`.                                                                                                                                                     |
| `PUT /api/v1/partner/listings/:listingId/media/order` | Body `{ assetIds }` — every photo id of the listing exactly once, else 400.                                                                                         |
| `DELETE /api/v1/partner/media/:assetId`               | 204.                                                                                                                                                                |
| `GET` partner listing detail                          | Adds `media: [{ id, purpose, url, thumbUrl, alt, width, height, sortOrder }]`.                                                                                      |

Ownership through `listings.service.assertOrgOwnsListing`; another organisation's asset
is 403, an unknown one 404. Multer's size error maps to `400 MEDIA_INVALID` with
`details.reason: 'TOO_LARGE'`; undecodable input to `details.reason: 'NOT_AN_IMAGE'`;
over 40 MP to `'TOO_MANY_PIXELS'`.

### Admin (`requireAuth`, `requireAdmin`)

| Method and path                                           | Behaviour                                          |
| --------------------------------------------------------- | -------------------------------------------------- |
| `GET /api/v1/admin/listings/:listingId`                   | Adds `media` (same shape as partner).              |
| `DELETE /api/v1/admin/listings/:listingId/media/:assetId` | 200 `{ publicCacheCleared }`. Works in any status. |

### Public

`instituteDetail.media` is replaced by `logo: { url, alt } | null` and
`photos: [{ url, thumbUrl, alt, width, height }]` (in order). `instituteSummary` gains
`logoUrl: string | null` for cards; the search and landing services fetch logos for the
page's listing ids through `media.service` in one query, not by touching the raw search
SQL.

New error codes: `MEDIA_INVALID`, `MEDIA_LIMIT_REACHED`.

## 9. Partner screens

`/dashboard/<id>` gains a **Photos** section between verification details and batches.
Mobile first, one column.

- **Logo:** a 96 px square preview (or a dashed placeholder) with **Add logo** /
  **Replace logo** and **Remove**.
- **Photos:** a 2-column grid of 640 px thumbnails (3 columns from `sm:`), each with
  **Move up/Move down** buttons (no drag — unreliable with a thumb) **(call)**, **Delete**
  (confirms), and an alt text field saved on blur. The first photo is labelled **Cover**.
- **Add photos** opens the file picker with `multiple`; files upload one at a time with a
  per-file progress line ("Uploading 2 of 4…") and a per-file error that names the reason
  ("That file isn't a photo we can use", "Over 8 MB", "You already have 10 photos").
- While the listing is in review the section is read-only, as the details form is.
- Copy under the heading: "Photos of your classrooms, results and faculty help students
  choose. Don't upload photos of students without permission."

## 10. Public screens

- **Cards** (search, landing, comparison columns): a 48 px logo at the start of the title
  row when present; nothing (no placeholder) when absent.
- **Detail page:** logo beside the name; under the header a horizontal snap-scrolling
  strip of photos, each shown at the 640 variant with `srcset` offering 1600 for wide
  screens, explicit `width`/`height` from the asset (no layout shift), `loading="lazy"`
  except the first, and `alt` falling back to "<Institute name> photo N". Tapping opens the
  1600 image. From `lg:` the strip becomes a 3-up grid.
- **JSON-LD:** `logo` and `image` (photo URLs) on the `EducationalOrganization`.
- Plain `<img>`, not `next/image`. **(call)** The API already produces sized WebP variants,
  and `next/image` would need `remotePatterns` tied to a storage domain that does not exist
  until hosting is chosen.

## 11. Failure modes

| Condition                                    | API response                                   | What the user sees                                       |
| -------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| File is not a decodable JPEG/PNG/WebP        | 400 `MEDIA_INVALID`, `reason: NOT_AN_IMAGE`    | "That file isn't a photo we can use."                    |
| File over 8 MB (after client resize)         | 400 `MEDIA_INVALID`, `reason: TOO_LARGE`       | "That photo is over 8 MB."                               |
| Image over 40 megapixels                     | 400 `MEDIA_INVALID`, `reason: TOO_MANY_PIXELS` | "That photo is too large to process."                    |
| 11th photo                                   | 409 `MEDIA_LIMIT_REACHED`                      | "You already have 10 photos. Delete one to add another." |
| Any media change while in review             | 409 `LISTING_UNDER_REVIEW`                     | Section is read-only; message if raced                   |
| Order body missing or repeating a photo id   | 400 `VALIDATION_FAILED`                        | Unreachable from the UI; page reloads                    |
| Another organisation's asset                 | 403 `FORBIDDEN`                                | "You do not have permission to change this listing."     |
| Storage write fails                          | 503 `UPSTREAM_UNAVAILABLE`, nothing inserted   | "We couldn't save that photo. Please try again."         |
| Revalidation fails after a live media change | Request succeeds                               | Change visible within 5 minutes                          |

## 12. Testing

**Unit** — the BR-018 diff with `logo` and `photos`: added, removed, reordered, unchanged.

**API integration** (real Postgres, `STORAGE_DRIVER=fs` into a temp directory per run,
real `sharp`; fixtures are small generated images, not checked-in binaries):

- A JPEG with an EXIF GPS block and orientation 6 uploads; the stored 1600 variant is WebP,
  rotated (width/height swapped), and **has no EXIF** (`sharp(...).metadata()` reports no
  `exif`).
- A PNG renamed `.jpg`, a `.jpg` that is really an SVG, and random bytes: the PNG is
  accepted (content decides), the SVG and random bytes are `MEDIA_INVALID NOT_AN_IMAGE`,
  and nothing is written to storage.
- 8 MB + 1 byte is `TOO_LARGE`; a 7000 × 7000 image is `TOO_MANY_PIXELS`.
- The 11th photo is 409; a second logo replaces the first and deletes its objects.
- Order: valid permutation saved; missing or duplicate id 400.
- BR-017: every media endpoint 409s in review. BR-018: a photo upload on a published
  listing flags it and the admin detail shows the change; on a never-published draft it
  does not.
- Admin delete removes the row and objects and returns `publicCacheCleared`.
- Public detail returns `logo` and ordered `photos` with absolute URLs; cards carry
  `logoUrl`; a suspended listing's media never appears in public responses.

**s3 driver** — one integration test against MinIO, run when `S3_TEST_ENDPOINT` is set
(the local runbook starts MinIO in Docker); skipped otherwise, and the skip is printed.

**End to end** — upload through the API with `x-test-auth`, then the public detail page
shows the photo strip with explicit dimensions and the card shows the logo.

**Manual** — the partner flow on a real phone, including an iPhone HEIC photo and a
large Android photo over mobile data, recorded in the work item.

## 13. Documentation

- New flow `docs/flows/media.md`: upload pipeline, storage drivers, moderation hooks.
- `listing-lifecycle.md`: media under BR-017/BR-018; admin media delete.
- Business rules: **BR-019** — uploads are re-encoded server-side, metadata stripped,
  content-type decided by decoding; **BR-020** — at most one logo and ten photos per
  listing. Amend BR-018 for `logo` and `photos`.
- **ADR 0019** — uploads through the API with server-side re-encoding, storage key not
  URL, two storage drivers; rejected: presigned direct upload, `next/image`.
- **ADR 0009** — the new pinned dependencies (`multer`, `sharp`, `@aws-sdk/client-s3`).
- Runbook: storage environment variables; MinIO for the optional s3 test.
- Regenerate `docs/api/openapi.json`.

## 14. Build order

Each step ends with `pnpm verify` green.

1. Schema and migration; `lib/storage.ts` with both drivers; `/media/*` static route for
   `fs`.
2. Upload pipeline and partner media endpoints, with integration tests.
3. Moderation hooks: lock, watched `logo`/`photos`, admin delete, revalidation.
4. Public contracts: detail `logo`/`photos`, card `logoUrl`.
5. Web: cards, detail strip, JSON-LD; e2e.
6. Partner Photos section with client-side resize; admin review/changes thumbnails.
7. Docs, ADRs, manual phone walkthrough.

## 15. Calls for the owner to check

1. **One logo and up to 10 photos** per listing; no video or brochures yet.
2. **Photo changes on a live listing go live immediately** and show under **Changed**,
   like text edits (P2b). The alternative is holding new photos until approved.
3. **You can delete a single photo** from any listing without suspending it.
4. **Storage provider is undecided:** the code works with S3, R2 or MinIO; locally files
   go to disk. Choosing hosting picks the provider.
5. **Photos are re-encoded to WebP** at 640 and 1600 px; originals are not kept.
6. **Reordering uses up/down buttons**, not drag-and-drop.
