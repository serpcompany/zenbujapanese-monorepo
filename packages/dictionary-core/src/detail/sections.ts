export interface Section<Kind extends string> {
  kind: Kind
  title: string
}

export const glossSeparator = ' · '

export function sections<Kind extends string>(
  titles: Readonly<Record<Kind, string>>,
  shown: Readonly<Partial<Record<Kind, boolean>>>
): Section<Kind>[] {
  return (Object.keys(titles) as Kind[])
    .filter(kind => shown[kind] ?? true)
    .map(kind => ({ kind, title: titles[kind] }))
}

export const pronounceLabel = (reading: string) => `Pronounce ${reading}`
