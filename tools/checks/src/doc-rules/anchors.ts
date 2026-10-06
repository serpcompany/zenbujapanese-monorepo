const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/

function withoutTags(text: string): string {
  let kept = ''
  let insideTag: string | null = null
  for (const character of text) {
    if (character === '<') {
      kept += insideTag ?? ''
      insideTag = ''
    } else if (character === '>') {
      insideTag = null
    } else if (insideTag === null) {
      kept += character
    } else {
      insideTag += character
    }
  }
  return kept + (insideTag ?? '')
}

export function headingSlug(text: string): string {
  return withoutTags(text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
    .replace(/ /g, '-')
}

export function headingAnchors(prose: string): Set<string> {
  const anchors = new Set<string>()
  const seen = new Map<string, number>()
  for (const line of prose.split('\n')) {
    for (const match of line.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) anchors.add(match[1])
    const found = line.match(heading)
    if (!found) continue
    const slug = headingSlug(found[1])
    const count = seen.get(slug) ?? 0
    seen.set(slug, count + 1)
    anchors.add(count ? `${slug}-${count}` : slug)
  }
  return anchors
}

export function anchorOf(target: string): string | null {
  const hash = target.indexOf('#')
  if (hash === -1) return null
  return decodeURIComponent(target.slice(hash + 1))
}
