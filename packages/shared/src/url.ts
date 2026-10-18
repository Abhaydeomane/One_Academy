/// Returns the URL only when it is http(s); null otherwise. Use before rendering
/// a stored website as a link — z.url() alone accepts javascript: and data:.
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:' ? value : null
  } catch {
    return null
  }
}
