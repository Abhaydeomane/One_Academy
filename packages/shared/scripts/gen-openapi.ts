/* eslint-disable no-console */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { errorEnvelope } from '../src/errors.js'
import {
  adminListingDetail,
  adminListingQueueQuery,
  adminListingQueueResponse,
  adminDecisionResponse,
  adminListingSummary,
  batchListResponse,
  batchSummary,
  compareQuery,
  compareResponse,
  createBatchBody,
  createEnquiryBody,
  createListingBody,
  enquiryCreatedResponse,
  instituteDetail,
  instituteListResponse,
  landingIndexableResponse,
  landingPageResponse,
  landingQuery,
  listInstitutesQuery,
  partnerBatchSummary,
  partnerListingDetail,
  partnerListingListResponse,
  partnerReferenceResponse,
  markReviewedBody,
  mediaAsset,
  rejectListingBody,
  suspendListingBody,
  updateBatchBody,
  updateListingBody,
} from '../src/contracts/index.js'

// With Zod 4 the library reads schema names from Zod's own `.meta({ id })`, so
// `extendZodWithOpenApi` and its prototype patching are unnecessary. Naming
// happens here rather than in the contracts, keeping them free of OpenAPI
// concerns.
const named = <T extends z.ZodType>(id: string, schema: T): T => schema.meta({ id }) as T

const registry = new OpenAPIRegistry()

const ErrorEnvelope = named('ErrorEnvelope', errorEnvelope)

const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } })

const err = (description: string) => ({ description, ...json(ErrorEnvelope) })

const BAD_REQUEST = err('Validation failed')
const UNAUTHENTICATED = err('Authentication required')
const FORBIDDEN = err('Not permitted')
const NOT_FOUND = err('Not found')
const CONFLICT = err('Conflicting state or business rule violation')

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
})

const secured = [{ bearerAuth: [] }]

// --- Public ----------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/institutes',
  summary: 'List published institutes',
  request: { query: listInstitutesQuery },
  responses: {
    200: { description: 'Paginated institutes', ...json(instituteListResponse) },
    400: BAD_REQUEST,
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/institutes/{slug}',
  summary: 'Get a published institute by slug',
  description: 'Redirects with 301 when the slug has been superseded (BR-002).',
  request: { params: z.object({ slug: z.string() }) },
  responses: {
    200: { description: 'Institute detail', ...json(instituteDetail) },
    404: NOT_FOUND,
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/institutes/{slug}/batches',
  summary: 'List published batches for an institute',
  request: { params: z.object({ slug: z.string() }) },
  responses: {
    200: { description: 'Batches', ...json(batchListResponse) },
    404: NOT_FOUND,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/enquiries',
  summary: 'Create an enquiry',
  description: 'Rate limited to 10 per hour per IP.',
  request: { body: json(createEnquiryBody) },
  responses: {
    201: { description: 'Created', ...json(enquiryCreatedResponse) },
    400: BAD_REQUEST,
    404: NOT_FOUND,
    429: err('Rate limited'),
  },
})

// --- Partner (organisation-scoped) -----------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/partner/listings',
  summary: 'List listings owned by the active organisation',
  security: secured,
  responses: {
    200: { description: 'Listings', ...json(partnerListingListResponse) },
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/partner/listings',
  summary: 'Create a draft listing for the active organisation',
  description: 'Always DRAFT, always the session organisation (BR-011).',
  security: secured,
  request: { body: json(createListingBody) },
  responses: {
    201: { description: 'Created', ...json(partnerListingDetail) },
    400: BAD_REQUEST,
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    503: err('Clerk was unreachable while provisioning the organisation'),
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/partner/listings/{listingId}',
  summary: 'Get an owned listing with all of its batches',
  security: secured,
  request: { params: z.object({ listingId: z.string() }) },
  responses: {
    200: { description: 'Listing detail', ...json(partnerListingDetail) },
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    404: NOT_FOUND,
  },
})

registry.registerPath({
  method: 'patch',
  path: '/api/v1/partner/listings/{listingId}',
  summary: 'Update an owned listing',
  security: secured,
  request: { params: z.object({ listingId: z.string() }), body: json(updateListingBody) },
  responses: {
    200: { description: 'Updated', ...json(partnerListingDetail) },
    400: BAD_REQUEST,
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    409: CONFLICT,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/partner/listings/{listingId}/batches',
  summary: 'Create a batch on an owned listing',
  security: secured,
  request: { params: z.object({ listingId: z.string() }), body: json(createBatchBody) },
  responses: {
    201: { description: 'Created as a draft', ...json(batchSummary) },
    400: BAD_REQUEST,
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    409: CONFLICT,
  },
})

registry.registerPath({
  method: 'patch',
  path: '/api/v1/partner/batches/{batchId}',
  summary: 'Update a batch on an owned listing',
  description: 'Publishing enforces BR-003 (future start date) and BR-004 (parent published).',
  security: secured,
  request: { params: z.object({ batchId: z.string() }), body: json(updateBatchBody) },
  responses: {
    200: { description: 'Updated', ...json(partnerBatchSummary) },
    400: BAD_REQUEST,
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    409: CONFLICT,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/partner/listings/{listingId}/submit',
  summary: 'Submit a draft or suspended listing for review',
  security: secured,
  request: { params: z.object({ listingId: z.string() }) },
  responses: {
    200: { description: 'Submitted', ...json(partnerListingDetail) },
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    409: err(
      'INVALID_STATUS_TRANSITION (not a draft or suspended) or LISTING_INCOMPLETE (missing verification details)',
    ),
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/partner/listings/{listingId}/media',
  summary: 'Upload a logo or photo',
  description:
    'Multipart. The file is decoded and re-encoded server-side with all metadata removed (BR-019). A second LOGO replaces the first; at most 10 photos (BR-020).',
  security: secured,
  request: {
    params: z.object({ listingId: z.string() }),
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.string().meta({ format: 'binary' }),
            purpose: z.enum(['LOGO', 'PHOTO']),
            alt: z.string().max(120).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: 'Stored', ...json(mediaAsset) },
    400: err(
      'MEDIA_INVALID (details.reason NOT_AN_IMAGE | TOO_LARGE | TOO_MANY_PIXELS) or VALIDATION_FAILED',
    ),
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    404: NOT_FOUND,
    409: err('MEDIA_LIMIT_REACHED or LISTING_UNDER_REVIEW'),
    503: err('UPSTREAM_UNAVAILABLE (storage)'),
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/partner/listings/{listingId}/withdraw',
  summary: 'Take a listing out of review so it can be edited',
  description: 'Returns it to SUSPENDED if it was ever published, otherwise DRAFT (BR-017).',
  security: secured,
  request: { params: z.object({ listingId: z.string() }) },
  responses: {
    200: { description: 'Withdrawn', ...json(partnerListingDetail) },
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    409: err('INVALID_STATUS_TRANSITION (not in review)'),
  },
})

// --- Admin -----------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/partner/reference',
  summary: 'Cities and exam tags for the partner listing forms',
  security: secured,
  responses: {
    200: { description: 'Reference data', ...json(partnerReferenceResponse) },
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/listings',
  summary: 'List listings awaiting moderation',
  security: secured,
  request: { query: adminListingQueueQuery },
  responses: {
    200: { description: 'Moderation queue', ...json(adminListingQueueResponse) },
    400: BAD_REQUEST,
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/listings/{listingId}/publish',
  summary: 'Publish a listing',
  description:
    'Only a global ADMIN may publish (BR-001). Publishing verifies an unverified organisation (BR-013).',
  security: secured,
  request: { params: z.object({ listingId: z.string() }) },
  responses: {
    200: { description: 'Published', ...json(adminDecisionResponse) },
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    404: NOT_FOUND,
    409: CONFLICT,
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/listings/{listingId}',
  summary: 'One listing, with everything needed to review it',
  security: secured,
  request: { params: z.object({ listingId: z.string() }) },
  responses: {
    200: { description: 'Listing', ...json(adminListingDetail) },
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    404: NOT_FOUND,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/listings/{listingId}/reject',
  summary: 'Return a listing under review to DRAFT with a reason',
  description: 'Reason is 10–500 characters after trimming (BR-014).',
  security: secured,
  request: { params: z.object({ listingId: z.string() }), body: json(rejectListingBody) },
  responses: {
    200: { description: 'Rejected', ...json(adminListingSummary) },
    400: BAD_REQUEST,
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    404: NOT_FOUND,
    409: CONFLICT,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/listings/{listingId}/suspend',
  summary: 'Take a published listing off the site with a reason',
  description:
    'Only a PUBLISHED listing (BR-015). Reason is 10–500 characters after trimming and is shown to the institute.',
  security: secured,
  request: { params: z.object({ listingId: z.string() }), body: json(suspendListingBody) },
  responses: {
    200: { description: 'Suspended', ...json(adminDecisionResponse) },
    400: BAD_REQUEST,
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    404: NOT_FOUND,
    409: CONFLICT,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/listings/{listingId}/reinstate',
  summary: 'Lift a suspension and put the listing back on the site',
  description: 'Only a SUSPENDED listing (BR-016). Clears the suspension reason.',
  security: secured,
  request: { params: z.object({ listingId: z.string() }) },
  responses: {
    200: { description: 'Reinstated', ...json(adminDecisionResponse) },
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    404: NOT_FOUND,
    409: CONFLICT,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/listings/{listingId}/mark-reviewed',
  summary: "Accept a published listing's changes as the new approved baseline",
  description:
    'Body carries the changedSinceReviewAt the admin saw; REVIEW_STALE if the institute edited again since (BR-018).',
  security: secured,
  request: { params: z.object({ listingId: z.string() }), body: json(markReviewedBody) },
  responses: {
    200: { description: 'Marked reviewed', ...json(adminListingSummary) },
    400: BAD_REQUEST,
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    404: NOT_FOUND,
    409: err('INVALID_STATUS_TRANSITION (not published) or REVIEW_STALE (changed again)'),
  },
})

// --- Programmatic landing pages --------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/landing',
  summary: 'Resolve a programmatic landing page by its path',
  description:
    'Takes the raw path, e.g. /jee-coaching-in-pune, because only the database can decide ' +
    'whether "online-jee" is mode ONLINE plus exam "jee" or an exam slugged exactly that. ' +
    'Returns listings, the parent total that decides the canonical, set-wide fee stats and ' +
    'sibling links. 404 when the path is not a landing URL, when the exam or city is ' +
    'unknown, or when no listings match.',
  request: { query: landingQuery },
  responses: {
    200: { description: 'Landing page data', ...json(named('LandingPage', landingPageResponse)) },
    400: BAD_REQUEST,
    404: NOT_FOUND,
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/landing/indexable',
  summary: 'List landing paths eligible for indexing',
  description:
    'Only combinations at or above LANDING_MIN_INDEXABLE. Feeds the sitemap, which must ' +
    'never list a noindex URL.',
  responses: {
    200: {
      description: 'Indexable landing paths',
      ...json(named('LandingIndexable', landingIndexableResponse)),
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/compare',
  summary: 'Compare 2-4 published institutes',
  description:
    'Columns are institutes; each pins one upcoming published batch, defaulting to the ' +
    'cheapest. A stale slug is dropped and reported in `dropped` rather than failing the ' +
    'request, and a stale pin falls back to the default with `pinFellBack` set — both are ' +
    'the expected fate of a shared link. A pin naming another institute’s published ' +
    'batch is a 400, because it cannot arise from the UI or from the passage of time. ' +
    'Former slugs are resolved into `canonicalSlugs`; this route never answers 301, ' +
    'because fetch would consume it before the browser could act (BUG-001).',
  request: { query: compareQuery },
  responses: {
    200: { description: 'Comparison columns', ...json(named('Compare', compareResponse)) },
    400: BAD_REQUEST,
    404: NOT_FOUND,
  },
})

const document = new OpenApiGeneratorV31(registry.definitions).generateDocument({
  openapi: '3.1.0',
  info: {
    title: 'One Academy API',
    version: '1.0.0',
    description:
      'Generated from the Zod contracts in @one/shared. Do not hand-edit: run\n' +
      '`pnpm --filter @one/shared gen:openapi`. CI fails if this file is stale.',
  },
  servers: [{ url: 'http://localhost:4000' }],
})

const target = resolve(import.meta.dirname, '../../../docs/api/openapi.json')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`)
console.error(`wrote ${target}`)
