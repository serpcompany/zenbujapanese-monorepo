import {
  accentedPositions,
  type ExampleHighlight,
  type LinkedWordEntry,
  tokenSpans
} from '../artifact/word-examples'
import { type Attachment, attachment } from '../detail/romaji'
import { type RubySegment, rubySegments } from '../detail/ruby'
import { shortGloss } from '../detail/text'
import { displayReading, type LinkedToken } from '../examples/linking'
import { isFunctionWord } from '../examples/morphology'

type Accent = ExampleHighlight['accent']

interface EmbeddedWordEntry {
  id: string
  headword: string
  reading: string
  summary: string
  gloss: string | null
}

export interface EmbeddedToken {
  surface: string
  start: number
  end: number
  reading: string | null
  isFunctionWord: boolean
  entry: EmbeddedWordEntry | null
  candidates: EmbeddedWordEntry[]
  furigana: string | null
  ruby: RubySegment[] | null
  accent: Accent | null
  attaches: Attachment | null
}

function shown({ id, headword, reading, summary, meaning }: LinkedWordEntry): EmbeddedWordEntry {
  return { id, headword, reading, summary, gloss: meaning === null ? null : shortGloss(meaning) }
}

export function linkedWords(
  text: string,
  tokens: readonly LinkedToken[],
  analyzed: boolean,
  entries: ReadonlyMap<string, LinkedWordEntry>,
  highlight: ExampleHighlight
): EmbeddedToken[] {
  const accents = new Set(accentedPositions(text, tokens, highlight))
  return tokenSpans(tokens).map(({ start, end }, index): EmbeddedToken => {
    const token = tokens[index]
    const target = token.entry ? entries.get(token.entry.id) : undefined
    const furigana = target ? displayReading(token, target) : null
    return {
      surface: token.surface,
      start,
      end,
      reading: analyzed ? token.reading : null,
      isFunctionWord: isFunctionWord(token),
      entry: target ? shown(target) : null,
      candidates: token.entry
        ? []
        : token.candidates.flatMap(candidate => {
            const read = entries.get(candidate.id)
            return read ? [shown(read)] : []
          }),
      furigana,
      ruby: furigana === null ? null : rubySegments(token.surface, furigana),
      accent: accents.has(index) ? highlight.accent : null,
      attaches: attachment(token.surface)
    }
  })
}
