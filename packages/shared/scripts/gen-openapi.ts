/* eslint-disable no-console */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { errorEnvelope } from '../src/errors.js'
import {
  adminListingQueueQuery,
  adminListingQueueResponse,
  adminListingSummary,
  batchListResponse,
  batchSummary,
  createBatchBody,
  createEnquiryBody,
  enquiryCreatedResponse,
  instituteDetail,
  instituteListResponse,
  listInstitutesQuery,
  partnerBatchSummary,
  partnerListingDetail,
  partnerListingListResponse,
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
  summary: 'Submit a draft listing for review',
  security: secured,
  request: { params: z.object({ listingId: z.string() }) },
  responses: {
    200: { description: 'Submitted', ...json(partnerListingDetail) },
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    409: CONFLICT,
  },
})

// --- Admin -----------------------------------------------------------------

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
  description: 'Only a global ADMIN may publish (BR-001).',
  security: secured,
  request: { params: z.object({ listingId: z.string() }) },
  responses: {
    200: { description: 'Published', ...json(adminListingSummary) },
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    404: NOT_FOUND,
    409: CONFLICT,
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
