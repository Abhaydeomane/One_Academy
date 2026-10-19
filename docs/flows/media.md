# Flow: Media (logo and photos)

Last verified against commit: f596c439ed104ca3ac97717b277a613af74c6501

## Purpose

How a partner's logo and photos get from a phone to the public site: shrunk in the
browser, checked and re-encoded by the API, stored by key, moderated like text, and shown
on cards and detail pages. See ADR 0019 for why it is shaped this way.

## Actors and entry points

- Partner — the **Photos** section of `/dashboard/<listingId>`
- Global ADMIN — **Logo and photos** on `/admin/review/<listingId>`, and thumbnails in the
  **Changed** list
- Student — logos on search, landing and comparison cards; the photo strip on
  `/institutes/<slug>`

## Sequence

**Partner uploads a photo** (BR-019, BR-020)

```
apps/partner/src/app/dashboard/[listingId]/PhotosSection.tsx   file picker, one file at a time
  → apps/partner/src/lib/resize.ts                              downscaleToJpeg: ≤ 2048 px JPEG
  → apps/partner/src/app/dashboard/[listingId]/media-actions.ts uploadMediaAction
  → apps/partner/src/lib/api.ts                                 partnerApiUpload (multipart)
  → POST /api/v1/partner/listings/:listingId/media
  → apps/api/src/middleware/upload.ts                           uploadSingleImage: multer, 8 MB
  → apps/api/src/modules/media/media.partner.routes.ts
  → apps/api/src/modules/media/media.service.ts                 uploadForOrg
  → apps/api/src/modules/media/media.images.ts                  processImage: decode, rotate,
                                                                strip metadata, WebP variants
  → apps/api/src/lib/storage.ts                                 putObject per variant
  → apps/api/src/modules/listings/listings.service.ts           applyPartnerEdit
  → apps/api/src/modules/media/media.repository.ts              insertGuarded
```

The file's content decides what it is: anything sharp cannot decode as JPEG, PNG or WebP is
`MEDIA_INVALID NOT_AN_IMAGE`; over 40 megapixels is `TOO_MANY_PIXELS` (checked from the
header, before decoding). Photos become `-640.webp` and `-1600.webp`, logos `-256.webp`
on white; no metadata survives, so a phone's GPS position is never published. Files are
written first; the row is inserted in a transaction that takes the listing's row lock, so
concurrent uploads run one at a time and the tenth photo is the last. If the insert is
refused the files are deleted.

**Captions, order, delete**

`PATCH /api/v1/partner/media/:assetId`, `PUT /api/v1/partner/listings/:listingId/media/order`
(every photo exactly once) and `DELETE /api/v1/partner/media/:assetId` all go through
`applyPartnerEdit` and the same row lock. A delete removes the row, then the files
best-effort.

**Moderation** (BR-017, BR-018)

`applyPartnerEdit` applies P2b's rules to media: a listing in review refuses every media
write (`LISTING_UNDER_REVIEW`); on an ever-published listing the change goes live, and
because the watched snapshot includes `logo` and ordered `photos`, it appears under the
admin's **Changed** tab (`ChangesList` draws thumbnails); a live listing's public cache is
cleared.

**Admin removes one image**

```
apps/partner/src/app/admin/review/[listingId]/AdminMediaGrid.tsx
  → actions.ts                                         deleteMediaAsAdminAction
  → DELETE /api/v1/admin/listings/:listingId/media/:assetId
  → apps/api/src/modules/media/media.admin.routes.ts   requireAdmin
  → apps/api/src/modules/media/media.service.ts        deleteAsAdmin
  → apps/api/src/modules/listings/listings.service.ts  forgetRemovedMedia
```

Any status, no lock. The asset leaves the approved snapshot too, so the admin's own action
does not flag the listing; if it was the only unreviewed change, the flag clears.

**Public read**

`institutes.service` asks `media.service` for `publicMediaFor` (detail: `logo`, ordered
`photos` with dimensions) and `logoUrlsFor` (one query per page of cards); the comparison
service does the same. Only listings already resolved as PUBLISHED are read. The web app
renders plain `<img>`: `InstituteLogo` on cards, `PhotoStrip` on the detail page, plus
`logo` and `image` in the JSON-LD.

## Storage

`apps/api/src/lib/storage.ts` is the only module that touches stored files. `STORAGE_DRIVER`
picks `fs` (local development and tests; served by the API at `/media`) or `s3` (any
S3-compatible store). Rows hold `storageKey`; `publicUrl` prefixes
`MEDIA_PUBLIC_BASE_URL`, so changing provider or CDN is configuration.

## Business rules invoked

BR-009, BR-017, BR-018, BR-019, BR-020

## Failure modes

| Condition                            | API response                                   | What the partner sees                                    |
| ------------------------------------ | ---------------------------------------------- | -------------------------------------------------------- |
| Not a decodable JPEG/PNG/WebP        | 400 `MEDIA_INVALID`, `reason: NOT_AN_IMAGE`    | "That file isn't a photo we can use."                    |
| Over 8 MB after the browser's resize | 400 `MEDIA_INVALID`, `reason: TOO_LARGE`       | "That photo is over 8 MB."                               |
| Over 40 megapixels                   | 400 `MEDIA_INVALID`, `reason: TOO_MANY_PIXELS` | "That photo is too large to process."                    |
| Eleventh photo                       | 409 `MEDIA_LIMIT_REACHED`                      | "You already have 10 photos. Delete one to add another." |
| Any media change while in review     | 409 `LISTING_UNDER_REVIEW`                     | Section is read-only                                     |
| Storage write fails                  | 503 `UPSTREAM_UNAVAILABLE`, nothing inserted   | "We couldn't save that photo. Please try again."         |

## Related flows

`listing-lifecycle.md` — the review lock and change review media reuses.
