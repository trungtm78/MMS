// US-SS-02: Client-side search utilities — Vietnamese accent normalisation + acronym matching
// Used by SmartSelect for static/local option filtering (before API call debounce fires)

/**
 * US-SS-02 AC-2: Normalise Vietnamese text to ASCII lowercase.
 * Removes diacritics so "Nguyễn" matches "nguyen", "Đà Nẵng" matches "da nang".
 */
export function normalizeVi(text: string): string {
  return text
    .toLowerCase()
    // Composite characters → NFD, then strip combining marks
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Vietnamese specific: đ → d
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    // Collapse multiple spaces
    .trim()
}

/**
 * US-SS-02 AC-3: Generate acronym from first letters of each word.
 * "Nguyễn Văn An" → "nva", "Khu Phố 1" → "kp1"
 */
export function toAcronym(text: string): string {
  return normalizeVi(text)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
}

/**
 * US-SS-02 AC-1: Rank static options by relevance to a query.
 * Priority order:
 *   0 — exact match on id
 *   1 — label starts with query (normalised)
 *   2 — any word in label starts with query
 *   3 — label contains query anywhere
 *   4 — acronym starts with query
 *   null — no match (excluded)
 */
export function rankStaticOptions<T extends { id: string; label: string }>(
  options: T[],
  query: string,
): T[] {
  if (!query.trim()) return options

  const q = normalizeVi(query)
  const qAcro = q.replace(/\s/g, '')

  const scored: Array<{ item: T; rank: number }> = []

  for (const opt of options) {
    const norm = normalizeVi(opt.label)
    const acro = toAcronym(opt.label)

    let rank: number | null = null

    if (norm === q || opt.id === query) {
      rank = 0
    } else if (norm.startsWith(q)) {
      rank = 1
    } else if (norm.split(/\s+/).some((w) => w.startsWith(q))) {
      rank = 2
    } else if (norm.includes(q)) {
      rank = 3
    } else if (acro.startsWith(qAcro)) {
      rank = 4
    }

    if (rank !== null) {
      scored.push({ item: opt, rank })
    }
  }

  scored.sort((a, b) => a.rank - b.rank || a.item.label.localeCompare(b.item.label, 'vi'))
  return scored.map((s) => s.item)
}
