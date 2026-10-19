import {
  COMPARE_MIN,
  parseBatchPins,
  type BatchSummary,
  type CompareQuery,
  type CompareResponse,
} from '@one/shared'
import { BadRequestError, NotFoundError } from '../../lib/errors.js'
import * as batches from '../batches/batches.service.js'
import * as listings from '../listings/listings.service.js'
import * as media from '../media/media.service.js'
import * as repo from './institutes.compare.repository.js'

type Resolved = { requested: string; canonicalSlug: string; listingId: string }

/// Resolves each requested slug, keeping the ones that survive and recording
/// why the others did not. A single stale slug in a shared four-way link must
/// not take the whole page down.
async function resolveSlugs(slugs: string[]) {
  const resolved: Resolved[] = []
  const dropped: CompareResponse['dropped'] = []

  for (const requested of slugs) {
    try {
      const hit = await listings.resolvePublishedSlug(requested)
      resolved.push({ requested, canonicalSlug: hit.canonicalSlug, listingId: hit.listingId })
    } catch (error) {
      // resolvePublishedSlug throws NotFoundError both for an unknown slug and
      // for one whose listing is not published; the distinction is not
      // recoverable from here, so report the honest union.
      if (error instanceof NotFoundError) {
        dropped.push({ slug: requested, reason: 'NOT_FOUND' })
        continue
      }
      throw error
    }
  }

  return { resolved, dropped }
}

/// The default pin is the cheapest upcoming batch, which is what
/// listUpcomingPublishedForListing already returns first. Fee is the dominant
/// axis in this market; revisit against behaviour, not argument.
function defaultPin(options: BatchSummary[]): BatchSummary | null {
  return options[0] ?? null
}

/// A pin that does not match any of this column's upcoming batches is either
/// rot or tampering, and they are handled differently.
///
/// Rot — the batch is gone, has started, or was unpublished — is the expected
/// fate of a shared link, so the column falls back to its default pin.
/// Tampering — a pin naming a *published batch of a different institute* —
/// cannot arise from this UI or from the passage of time, so it is rejected.
/// A draft batch elsewhere is treated as rot rather than confirmed, because
/// distinguishing it would leak the existence of unpublished content.
async function assertNotForeignBatch(batchId: string, listingId: string) {
  if (await batches.belongsToListing(batchId, listingId)) return
  if (await batches.findPublishedById(batchId)) {
    throw new BadRequestError('Pinned batch belongs to another institute')
  }
}

export async function compare(query: CompareQuery): Promise<CompareResponse> {
  const { pins, invalid } = parseBatchPins(query.batch)

  // An unparseable pin cannot come from the UI or from the passage of time, so
  // it is rejected rather than ignored.
  if (invalid.length > 0) {
    throw new BadRequestError('Malformed batch pin', { invalid })
  }

  const { resolved, dropped } = await resolveSlugs(query.slug)

  // Below two there is no comparison left to render, and no reason to query.
  if (resolved.length < COMPARE_MIN) {
    throw new NotFoundError('Not enough institutes left to compare')
  }

  const ids = resolved.map((hit) => hit.listingId)
  const [rows, logos] = await Promise.all([repo.findCompareRowsByIds(ids), media.logoUrlsFor(ids)])
  const byId = new Map(rows.map((row) => [row.id, row]))

  const columns: CompareResponse['columns'] = []

  for (const hit of resolved) {
    const row = byId.get(hit.listingId)
    // resolvePublishedSlug already asserted PUBLISHED, so a miss here means
    // the listing is not an INSTITUTE — BR-008's single-vertical rule.
    if (!row) {
      dropped.push({ slug: hit.requested, reason: 'UNPUBLISHED' })
      continue
    }

    const options = await batches.listUpcomingPublishedForListing(row.id)
    // A pin may be written against either the canonical or the requested slug:
    // a link shared before a rename carries the old one.
    const pin = pins.find((entry) => entry.slug === row.slug || entry.slug === hit.requested)
    const requestedBatch = pin ? options.find((batch) => batch.id === pin.batchId) : undefined

    if (pin && !requestedBatch) await assertNotForeignBatch(pin.batchId, row.id)

    columns.push({
      institute: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        city: row.city,
        locality: row.locality,
        establishedYear: row.instituteProfile?.establishedYear ?? null,
        facultyCount: row.instituteProfile?.facultyCount ?? null,
        batchCount: options.length,
        logoUrl: logos.get(row.id) ?? null,
      },
      pinned: requestedBatch ?? defaultPin(options),
      pinFellBack: Boolean(pin && !requestedBatch),
      batches: options,
    })
  }

  if (columns.length < COMPARE_MIN) {
    throw new NotFoundError('Not enough institutes left to compare')
  }

  return {
    columns,
    dropped,
    canonicalSlugs: columns.map((column) => column.institute.slug),
  }
}
