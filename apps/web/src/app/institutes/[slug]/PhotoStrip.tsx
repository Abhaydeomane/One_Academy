import type { InstituteDetail } from '@one/shared'

/// Swipeable on a phone, a 3-up grid from lg:. Width and height come from the
/// asset, so the page reserves space and does not jump as photos arrive.
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
              sizes="(min-width: 1024px) 33vw, 85vw"
              width={photo.width}
              height={photo.height}
              alt={photo.alt ?? `${name} photo ${index + 1}`}
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
              className="h-auto w-full"
            />
          </a>
        </li>
      ))}
    </ul>
  )
}
