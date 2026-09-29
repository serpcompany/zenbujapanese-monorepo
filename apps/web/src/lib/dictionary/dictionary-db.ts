import { and, asc, eq, getTableColumns, gte, lt, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '@/db/dictionary-schema'
import { examplesPerPage } from './detail/examples'
import type {
  ExampleSentenceTokenRow,
  KanjiListWordRow,
  KanjiRows,
  WordExampleRows,
  WordRows
} from './detail/rows'

// Reads the detail core's rows from the dictionary database (DICTIONARY_DB, issue 464): one
// batch, so one round trip, per page. Pages read it through data.ts; the import's conformance
// gate (detail/conformance.test.ts) reads its local copy through the same functions.

const {
  elementGlyphs,
  exampleSentences,
  kanji,
  kanjiElements,
  kanjiStrokes,
  wordExampleCounts,
  wordExamples,
  wordSitemaps,
  words
} = schema

/** A word page's rows, and what its links need: which kanji have pages, and each related word's slug. */
export interface DictionaryWord {
  rows: WordRows
  /** The slug its page lives under (`words.slug`). */
  slug: string
  /** The slug of each related word's page, by `ent_seq`. */
  relatedSlugs: Map<number, string>
  /** The characters in its written forms that have a kanji page. */
  kanjiPages: Set<string>
  /** The slug of each word its first examples link to, by `ent_seq`. */
  exampleSlugs: Map<number, string>
}

/** Some of a word's examples, and the slug of each word they link to. */
export interface DictionaryExamples {
  rows: WordExampleRows[]
  slugs: Map<number, string>
}

/** A kanji page's rows, and what its links need. */
export interface DictionaryKanji {
  rows: KanjiRows
  indexable: boolean
  /** The slug of each of its words' pages, by `ent_seq`. */
  wordSlugs: Map<number, string>
  /** Its components and element glyphs that have a kanji page. */
  kanjiPages: Set<string>
}

export function dictionaryDatabase(db: D1Database) {
  const orm = drizzle(db, { schema })

  /** A word's examples from `from`, in order, with each sentence. */
  // Both tables have a tokens_json column. D1 returns rows keyed by column name, so selecting
  // both under the same name drops one and shifts every later column: the page's tokens are
  // selected under their own name.
  const { tokens: _, ...exampleColumns } = getTableColumns(wordExamples)
  const examples = (entSeq: number, from: number, limit: number) =>
    orm
      .select({
        example: {
          ...exampleColumns,
          tokens: sql<string | null>`${wordExamples.tokens}`.as('page_tokens_json')
        },
        sentence: exampleSentences
      })
      .from(wordExamples)
      .innerJoin(exampleSentences, eq(exampleSentences.id, wordExamples.sentenceId))
      .where(
        and(
          eq(wordExamples.entSeq, entSeq),
          gte(wordExamples.position, from),
          lt(wordExamples.position, from + limit)
        )
      )
      .orderBy(asc(wordExamples.position))

  /** The rows as the detail core reads them, with the page's tokens parsed. */
  const exampleRows = (rows: Awaited<ReturnType<typeof examples>>): WordExampleRows[] =>
    rows.map(({ example, sentence }) => ({
      sentence,
      example: {
        ...example,
        tokens:
          example.tokens === null ? null : (JSON.parse(example.tokens) as ExampleSentenceTokenRow[])
      }
    }))

  /** The slugs of the words those examples link to (a word with one entry has a page link). */
  const exampleSlugs = (entSeq: number, from: number, limit: number) =>
    orm
      .select({ entSeq: words.entSeq, slug: words.slug })
      .from(words)
      .where(sql`${words.entSeq} IN (
        SELECT json_extract(l.value, '$.entSeqs[0]')
        FROM word_examples w, json_each(w.links_json) l
        WHERE w.ent_seq = ${entSeq} AND w.position >= ${from} AND w.position < ${from + limit}
          AND json_array_length(l.value, '$.entSeqs') = 1
      )`)

  return {
    async word(entSeq: number): Promise<DictionaryWord | null> {
      const [[word], glosses, related, firstExamples, [exampleCount], slugs] = await orm.batch([
        orm.select().from(words).where(eq(words.entSeq, entSeq)),
        // The kanji in the headword and written forms: each form split into characters (SQLite's
        // substr counts code points), looked up by primary key.
        orm
          .select({
            character: kanji.character,
            meanings: kanji.meanings,
            readings: kanji.readings
          })
          .from(kanji)
          .where(sql`${kanji.character} IN (
            WITH RECURSIVE forms(rest) AS (
              SELECT headword FROM words WHERE ent_seq = ${entSeq}
              UNION ALL
              SELECT json_extract(f.value, '$.value')
              FROM words w, json_each(w.written_forms_json) f WHERE w.ent_seq = ${entSeq}
            ), characters(value, rest) AS (
              SELECT substr(rest, 1, 1), substr(rest, 2) FROM forms WHERE rest <> ''
              UNION ALL
              SELECT substr(rest, 1, 1), substr(rest, 2) FROM characters WHERE rest <> ''
            )
            SELECT value FROM characters
          )`),
        orm
          .select({ entSeq: words.entSeq, slug: words.slug })
          .from(words)
          .where(sql`${words.entSeq} IN (
            SELECT json_extract(r.value, '$.targetEntSeq')
            FROM words w, json_each(w.relationships_json) r WHERE w.ent_seq = ${entSeq}
          )`),
        examples(entSeq, 0, examplesPerPage),
        orm.select().from(wordExampleCounts).where(eq(wordExampleCounts.entSeq, entSeq)),
        exampleSlugs(entSeq, 0, examplesPerPage)
      ])
      if (!word) return null
      return {
        rows: {
          entry: word,
          frequency: word.frequency,
          kanji: glosses,
          examples: exampleRows(firstExamples),
          exampleCount: exampleCount
            ? {
                listed: exampleCount.listed,
                count: exampleCount.count,
                truncated: exampleCount.truncated
              }
            : null
        },
        slug: word.slug,
        relatedSlugs: new Map(related.map(row => [row.entSeq, row.slug])),
        kanjiPages: new Set(glosses.map(gloss => gloss.character)),
        exampleSlugs: new Map(slugs.map(row => [row.entSeq, row.slug]))
      }
    },

    /**
     * `limit` of a word's examples from position `from`, as the page loads more; null for an
     * unknown word.
     */
    async examples(
      entSeq: number,
      from: number,
      limit: number
    ): Promise<DictionaryExamples | null> {
      const [[word], rows, slugs] = await orm.batch([
        orm.select({ entSeq: words.entSeq }).from(words).where(eq(words.entSeq, entSeq)),
        examples(entSeq, from, limit),
        exampleSlugs(entSeq, from, limit)
      ])
      if (!word) return null
      return { rows: exampleRows(rows), slugs: new Map(slugs.map(row => [row.entSeq, row.slug])) }
    },

    async kanji(character: string): Promise<DictionaryKanji | null> {
      const [[row], [structure], elements, listed, pages, [strokes]] = await orm.batch([
        orm.select().from(kanji).where(eq(kanji.character, character)),
        orm.select().from(kanjiElements).where(eq(kanjiElements.character, character)),
        orm
          .select()
          .from(elementGlyphs)
          .where(sql`${elementGlyphs.glyph} IN (
            SELECT g.value FROM kanji_elements e, json_each(e.element_glyphs_json) g
            WHERE e.character = ${character}
          )`),
        orm
          .select({
            id: words.id,
            entSeq: words.entSeq,
            slug: words.slug,
            headword: words.headword,
            reading: words.reading,
            summary: words.summary
          })
          .from(words)
          .where(sql`${words.entSeq} IN (
            SELECT w.value FROM kanji k, json_each(k.word_ent_seqs_json) w
            WHERE k.character = ${character}
          )`),
        orm
          .select({ character: kanji.character })
          .from(kanji)
          .where(sql`${kanji.character} IN (
            SELECT c.value FROM kanji k, json_each(k.components_json) c
            WHERE k.character = ${character}
            UNION
            SELECT g.value FROM kanji_elements e, json_each(e.element_glyphs_json) g
            WHERE e.character = ${character}
          )`),
        orm.select().from(kanjiStrokes).where(eq(kanjiStrokes.character, character))
      ])
      if (!row) return null
      const byEntSeq = new Map(listed.map(word => [word.entSeq, word]))
      const ordered = row.wordEntSeqs.flatMap(entSeq => byEntSeq.get(entSeq) ?? [])
      if (ordered.length !== row.wordEntSeqs.length) {
        throw new Error(`The dictionary database is missing words for the kanji ${character}`)
      }
      return {
        rows: {
          kanji: row,
          structure: structure ?? null,
          elements,
          words: ordered.map(({ slug: _, ...word }): KanjiListWordRow => word),
          strokes: strokes ?? null
        },
        indexable: row.indexable,
        wordSlugs: new Map(listed.map(word => [word.entSeq, word.slug])),
        kanjiPages: new Set(pages.map(page => page.character))
      }
    },

    /** The word sitemaps the import precomputed, by number. */
    async wordSitemaps(): Promise<{ number: number; firstEntSeq: number; lastEntSeq: number }[]> {
      return orm
        .select({
          number: wordSitemaps.number,
          firstEntSeq: wordSitemaps.firstEntSeq,
          lastEntSeq: wordSitemaps.lastEntSeq
        })
        .from(wordSitemaps)
        .orderBy(asc(wordSitemaps.number))
    },

    /**
     * Up to `limit` words of a sitemap's range after `after`, in `ent_seq` order, for writing it
     * a page at a time: each query reads only its rows, by primary key.
     */
    async sitemapWords(
      range: { firstEntSeq: number; lastEntSeq: number },
      after: number,
      limit: number
    ): Promise<{ entSeq: number; slug: string }[]> {
      return orm
        .select({ entSeq: words.entSeq, slug: words.slug })
        .from(words)
        .where(
          and(
            gte(words.entSeq, Math.max(range.firstEntSeq, after + 1)),
            sql`${words.entSeq} <= ${range.lastEntSeq}`
          )
        )
        .orderBy(asc(words.entSeq))
        .limit(limit)
    },

    /** Every kanji whose page search engines may index, in character order. */
    async indexableKanji(): Promise<string[]> {
      const rows = await orm
        .select({ character: kanji.character })
        .from(kanji)
        .where(eq(kanji.indexable, true))
        .orderBy(asc(kanji.character))
      return rows.map(row => row.character)
    },

    /** The kanji a search for one character shows as a card, if it has a page. */
    async kanjiCard(character: string): Promise<{ character: string; meanings: string[] } | null> {
      const [card] = await orm
        .select({ character: kanji.character, meanings: kanji.meanings })
        .from(kanji)
        .where(eq(kanji.character, character))
      return card ?? null
    }
  }
}
