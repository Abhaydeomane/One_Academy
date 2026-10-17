/// Sits OUTSIDE the card's <Link> — a checkbox inside an anchor navigates
/// instead of toggling — and associates with the compare form by id, because
/// the results page already contains a search form and nesting forms is
/// invalid HTML.
///
/// `name="slug"` is load-bearing: repeated `slug` params are exactly what a
/// checkbox group emits, so selection needs no JavaScript.
export function CompareCheckbox({ slug, name }: { slug: string; name: string }) {
  return (
    <label className="tap-target absolute right-1 top-1 inline-flex items-center justify-center p-2">
      <span className="sr-only">Add {name} to comparison</span>
      <input
        type="checkbox"
        name="slug"
        value={slug}
        form="compare"
        className="h-5 w-5 rounded border-gray-400 accent-brand-600"
      />
    </label>
  )
}
