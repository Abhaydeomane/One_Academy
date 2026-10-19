# ADR 0019 — Media goes through the API, is re-encoded, and is stored by key

Date: 2026-10-19
Status: Accepted

## Context

P2c lets partners add a logo and up to ten photos. Phone photos carry GPS positions and
camera serials, arrive in several formats (including iPhone HEIC), run to several
megabytes, and a file named `.jpg` can be anything. Hosting — and so the storage provider
and CDN — is still undecided.

## Decision

**Uploads go through the API as multipart, and the API re-encodes every one.**
`middleware/upload.ts` (multer, in memory, 8 MB) hands a buffer to `media.images.ts`, which
decodes it with sharp under a 40-megapixel limit, accepts only what decodes as JPEG, PNG or
WebP, applies EXIF orientation, and writes fixed WebP variants with no metadata — photos
at 640 and 1600 px wide, logos 256 × 256 on white (BR-019). Originals are not kept.

**The browser shrinks photos first.** The partner app redraws each file to at most 2048 px
JPEG before upload: a data saver on mobile networks, and the step that turns HEIC into
something the server can decode. The server trusts none of it.

**Rows store a key, not a URL.** `MediaAsset.storageKey` names the variants; public URLs
are `MEDIA_PUBLIC_BASE_URL + key`, built at read time. `lib/storage.ts` has two drivers:
`fs` for development and tests (served at `/media`), `s3` for any S3-compatible store.

**The web app uses plain `<img>`** with the API's variants, explicit dimensions and
`srcset`.

## Alternatives rejected

**Presigned direct upload to the bucket.** The API must decode every file anyway, so it
would still pull each one back, adding a round trip, bucket CORS and an
"uploaded but never confirmed" state. At 8 MB × 11 files per listing the API carrying the
bytes costs nothing that matters.

**Keeping originals.** Storage and a privacy liability (the metadata) for no current use;
the 1600 px variant covers every screen the site has.

**`next/image`.** Its optimiser needs `remotePatterns` for a storage domain that does not
exist until hosting is chosen, and would re-do resizing the API already did.

**Storing full URLs.** Moving provider or adding a CDN would become a data migration.

## Consequences

- The API process holds an upload in memory while processing; the 8 MB cap bounds it.
- sharp is a native dependency of the API (it already was of Next).
- `s3` is exercised by one test against an S3-compatible server when `S3_TEST_ENDPOINT` is
  set; the provider's own quirks stay untested until hosting is chosen.
- Deleting files is best-effort; a stray object costs storage, never correctness.
