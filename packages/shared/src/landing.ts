import type { Mode } from './contracts/institutes.js'

/// The one unambiguous delimiter in a landing URL. Both exam and city slugs
/// may contain hyphens, so nothing else can reliably split them.
export const LANDING_INFIX = '-coaching-in-'

export const LANDING_MODE_PREFIXES = ['online', 'offline', 'hybrid'] as const

/// Below this many published listings a landing page renders but is not
/// indexed, and stays out of the sitemap. One constant, because the page's
/// robots directive and the sitemap's contents must never disagree.
export const LANDING_MIN_INDEXABLE = 3

export type LandingCandidate = {
  examSlug: string
  citySlug: string
  mode?: Mode
}

/// Lower-case kebab case, with no leading, trailing or doubled hyphens.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/// Syntactic parse only — it does not know which exams or cities exist.
///
/// Returns every reading of the path, most specific first. "online-jee" is
/// probably mode ONLINE plus exam "jee", but it could be an exam literally
/// slugged "online-jee", and only the database can say which. The caller
/// resolves the candidates in order and takes the first that exists.
///
/// Returns an empty array when the path is not a landing URL at all.
export function parseLandingPath(path: string): LandingCandidate[] {
  const slug = path.startsWith('/') ? path.slice(1) : path
  const parts = slug.split(LANDING_INFIX)

  // Exactly one infix. Zero means this is not a landing path; two or more is
  // malformed rather than ambiguous.
  if (parts.length !== 2) return []

  const [left, citySlug] = parts
  if (!left || !citySlug) return []
  if (!SLUG.test(left) || !SLUG.test(citySlug)) return []

  const candidates: LandingCandidate[] = []

  for (const prefix of LANDING_MODE_PREFIXES) {
    if (!left.startsWith(`${prefix}-`)) continue
    const rest = left.slice(prefix.length + 1)
    if (rest && SLUG.test(rest)) {
      candidates.push({
        examSlug: rest,
        citySlug,
        mode: prefix.toUpperCase() as Mode,
      })
    }
  }

  candidates.push({ examSlug: left, citySlug })
  return candidates
}

export function buildLandingPath(parts: {
  examSlug: string
  citySlug: string
  mode?: Mode | null
}): string {
  const prefix = parts.mode ? `${parts.mode.toLowerCase()}-` : ''
  return `/${prefix}${parts.examSlug}${LANDING_INFIX}${parts.citySlug}`
}
