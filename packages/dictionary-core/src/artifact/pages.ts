import { isLanguageReferenceId } from '../cards/word-list'
import { wordSlug } from '../detail/slug'
import { type ArtifactDatabase, listedIds } from './database'
import { jmdictSource } from './words'

export const maximumPagesAsked = 100

interface WordPage {
  languageReferenceID: string
  entSeq: number
  slug: string
}

export interface PagesResponse {
  words: WordPage[]
  kanji: string[]
}

export interface PagesAsked {
  words: string[]
  kanji: string[]
}

const isKanjiAsked = (character: string) => Array.from(character).length === 1 && character !== ','

export function pagesAsked(
  words: string | undefined,
  kanji: string | undefined
): PagesAsked | null {
  const listed = (value: string | undefined) => [
    ...new Set((value ?? '').split(',').filter(Boolean))
  ]
  const asked = { words: listed(words?.toLowerCase()), kanji: listed(kanji) }
  const sizes = [asked.words.length, asked.kanji.length]
  if (sizes.every(size => size === 0) || sizes.some(size => size > maximumPagesAsked)) return null
  if (!asked.words.every(isLanguageReferenceId) || !asked.kanji.every(isKanjiAsked)) return null
  return asked
}

export function readPages(
  db: ArtifactDatabase,
  hasKanji: (character: string) => boolean,
  asked: PagesAsked
): PagesResponse {
  const rows =
    asked.words.length === 0
      ? []
      : db.all<{ id: string; ent_seq: number; headword: string; reading: string }>(
          `SELECT lower(hex(id)) AS id, source_record_id AS ent_seq, headword, reading
           FROM entries WHERE source_identity = ? AND id IN (${listedIds})`,
          [jmdictSource, JSON.stringify(asked.words)]
        )
  return {
    words: rows.map(row => ({
      languageReferenceID: row.id,
      entSeq: row.ent_seq,
      slug: wordSlug(row.headword, row.reading)
    })),
    kanji: asked.kanji.filter(hasKanji)
  }
}
