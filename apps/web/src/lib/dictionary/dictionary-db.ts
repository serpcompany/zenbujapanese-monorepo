import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '@/db/dictionary-schema'
import type { KanjiListWordRow, KanjiRows, WordRows } from './detail/rows'

// Reads the detail core's rows from the dictionary database (DICTIONARY_DB, issue 464): one
// batch, so one round trip, per page. Pages read it through data.ts; the import's conformance
// gate (detail/conformance.test.ts) reads its local copy through the same functions.

const { elementGlyphs, kanji, kanjiElements, words } = schema

/** A word page's rows, and what its links need: which kanji have pages, and each related word's slug. */
export interface DictionaryWord {
  rows: WordRows
  /** The slug its page lives under (`words.slug`). */
  slug: string
  /** The slug of each related word's page, by `ent_seq`. */
  relatedSlugs: Map<number, string>
  /** The characters in its written forms that have a kanji page. */
  kanjiPages: Set<string>
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
  return {
    async word(entSeq: number): Promise<DictionaryWord | null> {
      const [[word], glosses, related] = await orm.batch([
        orm.select().from(words).where(eq(words.entSeq, entSeq)),
        // The kanji in the headword and written forms: each form split into characters (SQLite's
        // substr counts code points), looked up by primary key.
        orm
          .select({ character: kanji.character, meanings: kanji.meanings })
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
          )`)
      ])
      if (!word) return null
      return {
        rows: { entry: word, frequency: word.frequency, kanji: glosses, examples: [] },
        slug: word.slug,
        relatedSlugs: new Map(related.map(row => [row.entSeq, row.slug])),
        kanjiPages: new Set(glosses.map(gloss => gloss.character))
      }
    },

    async kanji(character: string): Promise<DictionaryKanji | null> {
      const [[row], [structure], elements, listed, pages] = await orm.batch([
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
          )`)
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
          words: ordered.map(({ slug: _, ...word }): KanjiListWordRow => word)
        },
        indexable: row.indexable,
        wordSlugs: new Map(listed.map(word => [word.entSeq, word.slug])),
        kanjiPages: new Set(pages.map(page => page.character))
      }
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
