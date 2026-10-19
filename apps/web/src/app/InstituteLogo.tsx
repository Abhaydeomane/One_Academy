/// An institute's logo, or nothing. Plain <img>: the API already serves sized
/// WebP variants, and next/image would need a storage domain that does not
/// exist until hosting is chosen (ADR 0019). Decorative — the name sits beside it.
export function InstituteLogo({ url, size }: { url: string | null; size: 48 | 96 }) {
  if (!url) return null
  return (
    <img
      src={url}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      decoding="async"
      className="shrink-0 rounded-md border border-gray-200 bg-white object-contain"
    />
  )
}
