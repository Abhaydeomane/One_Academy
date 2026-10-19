import { config } from '../config/index.js'
import { logger } from './logger.js'

export type RevalidateTarget = { url: string; secret: string }

const configured = (): RevalidateTarget | undefined =>
  config.webRevalidateUrl && config.revalidateSecret
    ? { url: config.webRevalidateUrl, secret: config.revalidateSecret }
    : undefined

/// Asks the web app to drop its cached public pages, so a suspension or
/// publication shows on the next request rather than after the 300-second
/// revalidate (REQ-002, ADR 0018). Call it after the write has committed.
///
/// Never throws: the write already happened, and the TTL is the backstop. The
/// result tells an admin whether the change is visible yet. Unconfigured (tests,
/// an API-only run) it does nothing and reports false.
export async function revalidatePublicPages(
  target: RevalidateTarget | undefined = configured(),
): Promise<boolean> {
  if (!target) return false
  try {
    const response = await fetch(target.url, {
      method: 'POST',
      headers: { 'x-revalidate-secret': target.secret },
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) logger.warn({ status: response.status }, 'public cache revalidation refused')
    return response.ok
  } catch (err) {
    logger.warn({ err }, 'public cache revalidation failed')
    return false
  }
}
