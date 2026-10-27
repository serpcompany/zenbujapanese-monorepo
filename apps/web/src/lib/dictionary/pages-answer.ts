import {
  maximumPagesAsked,
  type PagesAsked,
  type PagesResponse,
  pagesAsked
} from '@zenbu/dictionary-core/artifact/pages'
import { fixtureKanjiRows, fixtureWordRows } from '@zenbu/dictionary-core/fixtures'
import { log } from '@/lib/log'
import { dictionaryService } from './data'
import { storedWordPath } from './page-example'
import { kanjiSearchPath, wordSlug } from './urls'

export interface PagePaths {
  words: Record<string, string>
  kanji: Record<string, string>
}

const pagesCacheSeconds = 3_600

const unindexed = { 'X-Robots-Tag': 'noindex' }

function fixturePages(asked: PagesAsked): PagesResponse {
  const words = fixtureWordRows
    .map(rows => rows.entry)
    .filter(entry => asked.words.includes(entry.id))
    .map(entry => ({
      languageReferenceID: entry.id,
      entSeq: entry.entSeq,
      slug: wordSlug(entry.headword, entry.reading)
    }))
  const held = new Set(fixtureKanjiRows.map(rows => rows.kanji.character))
  return { words, kanji: asked.kanji.filter(character => held.has(character)) }
}

async function readPages(asked: PagesAsked): Promise<PagesResponse> {
  const api = await dictionaryService()
  return api ? (await api.pages(asked)).data : fixturePages(asked)
}

const refused = (status: number, error: string) =>
  Response.json({ error }, { status, headers: unindexed })

export async function pagesAnswer(query: URLSearchParams): Promise<Response> {
  const asked = pagesAsked(query.get('words') ?? undefined, query.get('kanji') ?? undefined)
  if (!asked) {
    return refused(
      400,
      `words and kanji must name one at least, and at most ${maximumPagesAsked} of each`
    )
  }
  try {
    const found = await readPages(asked)
    const paths: PagePaths = {
      words: Object.fromEntries(
        found.words.map(word => [word.languageReferenceID, storedWordPath(word.slug, word.entSeq)])
      ),
      kanji: Object.fromEntries(
        found.kanji.map(character => [character, kanjiSearchPath(character)])
      )
    }
    return Response.json(paths, {
      headers: { ...unindexed, 'Cache-Control': `public, max-age=${pagesCacheSeconds}` }
    })
  } catch (error) {
    log('warn', 'pages_unavailable', {
      errorName: error instanceof Error ? error.name : typeof error,
      words: asked.words.length,
      kanji: asked.kanji.length
    })
    return refused(502, 'The dictionary service didn’t answer')
  }
}
