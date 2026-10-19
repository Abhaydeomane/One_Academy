import type { InstituteDetail } from '@one/shared'

/// Swipeable on a phone, a 3-up grid from lg:. Every photo sits in a fixed-height
/// frame (cropped with object-cover), so a portrait phone photo cannot push the
/// rest of the page a screen down, and nothing jumps as photos arrive.
///
/// `sizes` deliberately under-reports the phone width so phones take the 640
/// variant (spec §10) — a data saver on mobile networks; 1600 is for lg: up.
export function PhotoStrip({ photos, name }: { photos: InstituteDetail['photos']; name: string }) {
  if (photos.length === 0) return null
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
      {photos.map((photo, index) => (
        <li key={photo.url} className="w-[85%] shrink-0 snap-start lg:w-auto">
          <a href={photo.url} className="block overflow-hidden rounded-lg bg-gray-100">
            <img
              src={photo.thumbUrl}
              srcSet={`${photo.thumbUrl} 640w, ${photo.url} 1600w`}
              sizes="(min-width: 1024px) 33vw, 240px"
              width={photo.width}
              height={photo.height}
              alt={photo.alt ?? `${name} photo ${index + 1}`}
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
              className="h-56 w-full object-cover lg:h-64"
            />
          </a>
        </li>
      ))}
    </ul>
  )
}
