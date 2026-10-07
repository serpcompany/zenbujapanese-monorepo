import type {
  ExampleCountRow,
  ExampleSentenceRow,
  ExampleSentenceTokenRow,
  FormExampleRows,
  WordExampleRow,
  WordExampleRows
} from './rows'
import { type RubySegment, rubySegments } from './ruby'

export const examplesPerPage = 25

type ExampleLink = { entSeq: number } | { entSeqs: number[]; query: string }

export interface ExampleToken {
  text: string
  ruby: RubySegment[]
  link: ExampleLink | null
  isPageWord: boolean
}

interface TatoebaSentence {
  id: number
  contributor: string | null
  license: string
}

export interface Example {
  position: number
  pairId: string
  text: string
  tokens: ExampleToken[]
  translation: string
  japanese: TatoebaSentence
  english: TatoebaSentence
}

type ExampleRow = Pick<WordExampleRow, 'position' | 'highlights' | 'links'> & {
  tokens?: ExampleSentenceTokenRow[] | null
}

export function wordExample(rows: WordExampleRows): Example {
  return example(rows)
}

export function formExample(rows: FormExampleRows): Example {
  return example(rows)
}

function example({
  sentence,
  example
}: {
  sentence: ExampleSentenceRow
  example: ExampleRow
}): Example {
  const tokens = example.tokens ?? sentence.tokens
  const links = new Map(example.links.map(link => [link.token, link]))
  const highlights = new Set(example.highlights)
  return {
    position: example.position,
    pairId: sentence.pairId,
    text: sentence.japanese,
    tokens: tokens.map((token, index) => {
      const link = links.get(index)
      const entry = link?.entSeqs.length === 1 ? link.entSeqs[0] : null
      const reading = link?.reading ?? token.reading
      return {
        text: token.text,
        ruby:
          entry !== null && reading ? rubySegments(token.text, reading) : [{ text: token.text }],
        link: link
          ? entry !== null
            ? { entSeq: entry }
            : { entSeqs: link.entSeqs, query: token.dictionaryForm ?? token.text }
          : null,
        isPageWord: highlights.has(index)
      }
    }),
    translation: sentence.english,
    japanese: {
      id: sentence.japaneseTatoebaId,
      contributor: sentence.japaneseContributor,
      license: sentence.japaneseLicense
    },
    english: {
      id: sentence.englishTatoebaId,
      contributor: sentence.englishContributor,
      license: sentence.englishLicense
    }
  }
}

export function exampleCountText(
  count: Pick<ExampleCountRow, 'listed' | 'truncated'> | null
): string | null {
  if (!count || count.listed === 0) return null
  if (count.truncated) return `The first ${count.listed} of more than ${count.listed} examples`
  return count.listed === 1 ? '1 example' : `${count.listed} examples`
}

export const noExamplesMessage = 'No source-matched examples'

export const noFormExamplesMessage = 'No example sentences use this form yet.'

const licenseUrls: Record<string, string> = {
  'CC BY 2.0 FR': 'https://creativecommons.org/licenses/by/2.0/fr/',
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/'
}

export const licenseUrl = (license: string): string | null => licenseUrls[license] ?? null
