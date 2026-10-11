import { compareStrings } from './query'

export interface RadicalFile {
  components: { id: string; glyph: string; strokeCount: number }[]
  characters: { value: string; components: string[] }[]
}

export interface RadicalPanel {
  candidates: string[]
  groups: {
    strokeCount: number
    label: string
    radicals: { id: string; glyph: string }[]
  }[]
}

const radicalSource = 'edrdg.kradfile'
const isText = (value: unknown): value is string => typeof value === 'string'

export function checkedRadicalFile(read: unknown): RadicalFile {
  const file = (read ?? {}) as Partial<RadicalFile> & { sourceIdentity?: unknown }
  if (file.sourceIdentity !== radicalSource) {
    throw new Error(
      `Refusing the language data: RadicalReferenceData.json's sourceIdentity is ${file.sourceIdentity}, not ${radicalSource}`
    )
  }
  const { components, characters } = file
  if (
    !Array.isArray(components) ||
    !Array.isArray(characters) ||
    !components.every(
      radical =>
        isText(radical?.id) && isText(radical?.glyph) && Number.isInteger(radical?.strokeCount)
    ) ||
    !characters.every(
      kanji =>
        isText(kanji?.value) && Array.isArray(kanji?.components) && kanji.components.every(isText)
    )
  ) {
    throw new Error(
      'Refusing the language data: RadicalReferenceData.json does not list radicals and the kanji that hold them as the core reads them'
    )
  }
  return { components, characters }
}

export class RadicalLookup {
  private readonly characters: RadicalFile['characters']

  constructor(private readonly file: RadicalFile) {
    this.characters = [...file.characters].sort(
      (left, right) =>
        left.components.length - right.components.length || compareStrings(left.value, right.value)
    )
  }

  panel(selected: readonly string[]): RadicalPanel {
    const chosen = [...new Set(selected)]
    const candidates =
      chosen.length === 0
        ? []
        : this.characters.filter(({ components }) => chosen.every(id => components.includes(id)))
    const available =
      candidates.length === 0 ? null : new Set(candidates.flatMap(({ components }) => components))
    const groups = new Map<number, { id: string; glyph: string }[]>()
    for (const { id, glyph, strokeCount } of this.file.components) {
      if (available && !available.has(id)) continue
      const group = groups.get(strokeCount) ?? []
      group.push({ id, glyph })
      groups.set(strokeCount, group)
    }
    return {
      candidates: candidates.map(({ value }) => value),
      groups: [...groups]
        .sort(([left], [right]) => left - right)
        .map(([strokeCount, radicals]) => ({
          strokeCount,
          label: strokeCount === 1 ? '1 Stroke' : `${strokeCount} Strokes`,
          radicals
        }))
    }
  }
}
