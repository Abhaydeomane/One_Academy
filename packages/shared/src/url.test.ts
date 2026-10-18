import { describe, expect, it } from 'vitest'
import { safeHttpUrl } from './url.js'

describe('safeHttpUrl', () => {
  it.each(['https://example.com', 'http://example.com/a?b=1'])('keeps %s', (url) => {
    expect(safeHttpUrl(url)).toBe(url)
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    'ftp://example.com',
    'nope',
    '',
    null,
    undefined,
  ])('rejects %s', (url) => {
    expect(safeHttpUrl(url)).toBeNull()
  })
})
