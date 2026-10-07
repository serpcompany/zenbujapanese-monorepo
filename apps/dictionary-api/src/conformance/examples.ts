import type { ArtifactDatabase } from '@zenbu/dictionary-core/artifact/database'
import type {
  ExampleLinkRow,
  ExampleSentenceRow,
  ExampleSentenceTokenRow
} from '@zenbu/dictionary-core/detail/rows'

interface ShownRow {
  sentence: ExampleSentenceRow
  example: {
    highlights: number[]
    links: ExampleLinkRow[]
    tokens?: ExampleSentenceTokenRow[] | null
  }
}

interface RecordedToken {
  surface: string
  entry?: string
  candidates?: string[]
}

export function languageReferenceIds(db: ArtifactDatabase, entSeqs: number[]): Map<number, string> {
  if (entSeqs.length === 0) return new Map()
  const rows = db.all<{ ent_seq: number; id: string }>(
    `SELECT source_record_id AS ent_seq, lower(hex(id)) AS id FROM entries
     WHERE source_identity = 'edrdg.jmdict' AND source_record_id IN (${entSeqs.map(() => '?')})`,
    entSeqs
  )
  return new Map(rows.map(row => [row.ent_seq, row.id]))
}

type Mark = 'pageWord' | 'highlighted' | 'queryMatch'

export function shownAsRecorded(db: ArtifactDatabase, rows: readonly ShownRow[], mark: Mark) {
  const ids = languageReferenceIds(db, [
    ...new Set(rows.flatMap(({ example }) => example.links.flatMap(link => link.entSeqs)))
  ])
  const id = (number: number) => ids.get(number) ?? `missing ${number}`
  return rows.map(({ sentence, example }) => {
    const links = new Map(example.links.map(link => [link.token, link.entSeqs]))
    const highlights = new Set(example.highlights)
    return {
      id: `esp1_${sentence.pairId}`,
      japanese: sentence.japanese,
      english: sentence.english,
      tokens: (example.tokens ?? sentence.tokens).map(
        (token, index): RecordedToken & { [marked in Mark]?: true } => {
          const entSeqs = links.get(index) ?? []
          return {
            surface: token.text,
            ...(entSeqs.length === 1 ? { entry: id(entSeqs[0]) } : {}),
            ...(entSeqs.length > 1 ? { candidates: entSeqs.map(id) } : {}),
            ...(highlights.has(index) ? { [mark]: true } : {})
          }
        }
      )
    }
  })
}
