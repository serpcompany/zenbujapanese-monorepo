import { and, asc, eq, getTableColumns, gte, lt, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '@/db/dictionary-schema'
import { examplesPerPage } from './detail/examples'
import type {
  ExampleSentenceTokenRow,
  FormExampleRows,
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
  formExamples,
  kanji,
  kanjiElements,
  kanjiStrokes,
  wordConjugations,
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
  /** The first meaning of each of those words, for Word Meanings, by `ent_seq`. */
  exampleMeanings: Map<number, string>
}

/** Some of a word's examples, and the slug of each word they link to. */
export interface DictionaryExamples {
  rows: WordExampleRows[]
  slugs: Map<number, string>
  /** The first meaning of each word they link to, for Word Meanings. */
  meanings: Map<number, string>
}

/** What a word's conjugation screens read: its rows without examples, and its slug. */
export interface DictionaryConjugationWord {
  rows: WordRows
  slug: string
}

/** Some of a conjugated form's examples, how many it has, and the slug of each word they link to. */
export interface DictionaryFormExamples {
  rows: FormExampleRows[]
  listed: number
  slugs: Map<number, string>
}

/** A word with a conjugation table, and its form screens search engines may index. */
export interface ConjugationSitemapWord {
  entSeq: number
  slug: string
  indexedForms: string[]
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

/** Each linked word's first meaning, by `ent_seq`. */
const meaningsOf = (rows: { entSeq: number; meaning: string | null }[]) =>
  new Map(rows.flatMap(row => (row.meaning === null ? [] : [[row.entSeq, row.meaning] as const])))

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

  /**
   * The slugs of the words those examples link to (a word with one entry has a page link), and
   * each one's first meaning, which Word Meanings shortens under the word.
   */
  const exampleSlugs = (entSeq: number, from: number, limit: number) =>
    orm
      .select({
        entSeq: words.entSeq,
        slug: words.slug,
        meaning: sql<string | null>`json_extract(${words.senses}, '$[0].meaning')`
      })
      .from(words)
      .where(sql`${words.entSeq} IN (
        SELECT json_extract(l.value, '$.entSeqs[0]')
        FROM word_examples w, json_each(w.links_json) l
        WHERE w.ent_seq = ${entSeq} AND w.position >= ${from} AND w.position < ${from + limit}
          AND json_array_length(l.value, '$.entSeqs') = 1
      )`)

  /** A conjugated form's examples from `from`, in order, with each sentence. */
  const formExampleRows = (surface: string, from: number, limit: number) =>
    orm
      .select({ example: formExamples, sentence: exampleSentences })
      .from(formExamples)
      .innerJoin(exampleSentences, eq(exampleSentences.id, formExamples.sentenceId))
      .where(
        and(
          eq(formExamples.surface, surface),
          gte(formExamples.position, from),
          lt(formExamples.position, from + limit)
        )
      )
      .orderBy(asc(formExamples.position))

  /** The slugs of the words those examples link to, as for a word's examples. */
  const formExampleSlugs = (surface: string, from: number, limit: number) =>
    orm
      .select({ entSeq: words.entSeq, slug: words.slug })
      .from(words)
      .where(sql`${words.entSeq} IN (
        SELECT json_extract(l.value, '$.entSeqs[0]')
        FROM form_examples f, json_each(f.links_json) l
        WHERE f.surface = ${surface} AND f.position >= ${from} AND f.position < ${from + limit}
          AND json_array_length(l.value, '$.entSeqs') = 1
      )`)

  /** A word's row. */
  const wordRow = (entSeq: number) => orm.select().from(words).where(eq(words.entSeq, entSeq))

  /**
   * The kanji in the headword and written forms: each form split into characters (SQLite's
   * substr counts code points), looked up by primary key.
   */
  const wordKanji = (entSeq: number) =>
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
      )`)

  return {
    async word(entSeq: number): Promise<DictionaryWord | null> {
      const [[word], glosses, related, firstExamples, [exampleCount], slugs] = await orm.batch([
        wordRow(entSeq),
        wordKanji(entSeq),
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
        exampleSlugs: new Map(slugs.map(row => [row.entSeq, row.slug])),
        exampleMeanings: meaningsOf(slugs)
      }
    },

    /**
     * What a word's conjugation screens read: its row and its kanji (whose readings split the
     * forms' furigana), without examples; null for an unknown word.
     */
    async conjugationWord(entSeq: number): Promise<DictionaryConjugationWord | null> {
      const [[word], glosses] = await orm.batch([wordRow(entSeq), wordKanji(entSeq)])
      if (!word) return null
      return {
        rows: {
          entry: word,
          frequency: word.frequency,
          kanji: glosses,
          examples: [],
          exampleCount: null
        },
        slug: word.slug
      }
    },

    /**
     * `limit` of a conjugated form's examples from position `from`, by the form's spelling, with
     * how many it has in all (none for a form without examples).
     */
    async formExamples(
      surface: string,
      from: number,
      limit: number
    ): Promise<DictionaryFormExamples> {
      const [rows, [count], slugs] = await orm.batch([
        formExampleRows(surface, from, limit),
        orm
          .select({ listed: sql<number>`count(*)` })
          .from(formExamples)
          .where(eq(formExamples.surface, surface)),
        formExampleSlugs(surface, from, limit)
      ])
      return {
        rows,
        listed: count?.listed ?? 0,
        slugs: new Map(slugs.map(row => [row.entSeq, row.slug]))
      }
    },

    /** Every word with a conjugation table, in `ent_seq` order, for the conjugations sitemap. */
    async conjugationSitemap(): Promise<ConjugationSitemapWord[]> {
      return orm
        .select({
          entSeq: wordConjugations.entSeq,
          slug: words.slug,
          indexedForms: wordConjugations.indexedForms
        })
        .from(wordConjugations)
        .innerJoin(words, eq(words.entSeq, wordConjugations.entSeq))
        .orderBy(asc(wordConjugations.entSeq))
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
      return {
        rows: exampleRows(rows),
        slugs: new Map(slugs.map(row => [row.entSeq, row.slug])),
        meanings: meaningsOf(slugs)
      }
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

    /** The slug of each word's page, by `ent_seq`, for words a search's examples link to. */
    async wordSlugs(entSeqs: number[]): Promise<Map<number, string>> {
      if (entSeqs.length === 0) return new Map()
      // One JSON parameter: a page's examples can link more words than D1 binds parameters.
      const rows = await orm
        .select({ entSeq: words.entSeq, slug: words.slug })
        .from(words)
        .where(
          sql`${words.entSeq} IN (SELECT value FROM json_each(${JSON.stringify([...new Set(entSeqs)])}))`
        )
      return new Map(rows.map(row => [row.entSeq, row.slug]))
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
