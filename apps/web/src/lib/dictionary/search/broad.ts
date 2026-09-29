// Which searches are broad enough to precompute into `search_cache` (issues 464 and 522), for the
// import (scripts/release-d1/search/precompute.mts) and its gate (broad.test.ts). Never imported
// by the website.
import { DatabaseSync } from 'node:sqlite'
import type { SearchDatabase } from './search'

/** A search that reads more rows than this on D1 is precomputed; D1 runs one query at a time. */
export const rowsReadThreshold = 20_000

/**
 * FTS5's `ascii` tokenizer, which romaji_fts and gloss_fts (under `porter`) split with: a word is
 * a run of ASCII letters and digits and non-ASCII characters, folded to lowercase.
 */
const ftsWord = /[0-9A-Za-z\u0080-\u{10ffff}]+/gu

/**
 * Every prefix a wildcard search (`p*`) can have that starts a word FTS5 indexes: a romaji form's
 * or an English meaning's. Only ASCII letters and digits, since any other character makes `p` a
 * Japanese query or ends its word. Sorted shortest first.
 */
export async function wordPrefixes(db: SearchDatabase): Promise<string[]> {
  const prefixes = new Set<string>()
  const add = (text: string) => {
    for (const [word] of text.toLowerCase().matchAll(ftsWord)) {
      const ascii = /^[0-9a-z]+/.exec(word)?.[0] ?? ''
      for (let end = 1; end <= ascii.length; end++) prefixes.add(ascii.slice(0, end))
    }
  }
  for (const { form } of await db.all<{ form: string }>(
    'SELECT form FROM forms WHERE kind = 2',
    []
  )) {
    add(form)
  }
  for (const { text } of await db.all<{ text: string }>(
    'SELECT normalized_text AS text FROM gloss_atoms',
    []
  )) {
    add(text)
  }
  return [...prefixes].sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * What gloss_fts (`porter ascii`) matches `"p"*` against: FTS5 stems a prefix's term as it stems
 * a word, so `ties*` finds every meaning with a word starting with `ti`, more than `tie*` does.
 * Each prefix's stem, from SQLite's own FTS5.
 */
export function porterStems(terms: readonly string[]): Map<string, string> {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE VIRTUAL TABLE t USING fts5(x, tokenize = 'porter ascii');
      CREATE VIRTUAL TABLE v USING fts5vocab(t, instance);`)
    const insert = db.prepare('INSERT INTO t (rowid, x) VALUES (?, ?)')
    db.exec('BEGIN')
    for (const [index, term] of terms.entries()) insert.run(index + 1, term)
    db.exec('COMMIT')
    const stems = new Map<string, string>()
    for (const row of db.prepare('SELECT doc, term FROM v').iterate()) {
      const { doc, term } = row as { doc: number; term: string }
      stems.set(terms[doc - 1], term)
    }
    if (stems.size !== terms.length) throw new Error('FTS5 left a prefix without one stem')
    return stems
  } finally {
    db.close()
  }
}

export interface BroadPrefixes {
  /** The prefixes whose `p*` reads more than the threshold. */
  broad: string[]
  /** How many prefixes were searched, and their rows read. */
  searched: Map<string, number>
  /** How many were proven narrow without a search, by a narrow shorter prefix. */
  proven: number
}

/**
 * Finds every prefix `p` in `prefixes` whose wildcard search `p*` reads more than `threshold`
 * rows, searching as few as it can.
 *
 * A search for `p*` (or `^p*`) runs the same four statements whatever `p` is: the exact romaji
 * form (none contains `*`), then romaji_fts for `"p"*` and gloss_fts for `"p"*` (their `ascii`
 * tokenizers drop the `^`), each with the rows of its matches. No romaji deinflection applies to
 * a query ending in `*`, and it isn't Japanese. Each statement reads a fixed number of rows for
 * each match, so it reads no more rows when its matches are a subset. romaji_fts matches the forms
 * with a word starting with `p`, and gloss_fts the meanings with a word whose stem starts with
 * `stem(p)`. So when `q` is a shorter prefix of `p` and `stem(p)` starts with `stem(q)`, `p*`
 * matches a subset of what `q*` matches and reads no more rows. A prefix with such a `q` that reads at
 * most `threshold` rows needs no search: it is proven narrow, and can prove longer prefixes
 * narrow in turn. Every other prefix is searched. `^p*` matches exactly what `p*` does.
 *
 * `prefixes` must hold every prefix of each of its prefixes, shortest first, as wordPrefixes
 * returns them. `reads` returns the rows `p*` reads, or Infinity for one that it doesn't search
 * (such as one already in search_cache), which is then broad.
 */
export async function findBroadPrefixes(
  prefixes: readonly string[],
  stems: ReadonlyMap<string, string>,
  reads: (prefix: string) => Promise<number>,
  threshold = rowsReadThreshold
): Promise<BroadPrefixes> {
  const stem = (prefix: string) => {
    const found = stems.get(prefix)
    if (found === undefined) throw new Error(`No stem for ${prefix}`)
    return found
  }
  const done = new Set<string>()
  const narrow = new Set<string>()
  const broad: string[] = []
  const searched = new Map<string, number>()
  let proven = 0
  for (const prefix of prefixes) {
    const prefixStem = stem(prefix)
    let witness = false
    for (let end = prefix.length - 1; end > 0 && !witness; end--) {
      const shorter = prefix.slice(0, end)
      if (!done.has(shorter)) throw new Error(`${prefix} comes before its prefix ${shorter}`)
      witness = narrow.has(shorter) && prefixStem.startsWith(stem(shorter))
    }
    done.add(prefix)
    if (witness) {
      narrow.add(prefix)
      proven++
      continue
    }
    const rows = await reads(prefix)
    searched.set(prefix, rows)
    if (rows > threshold) broad.push(prefix)
    else narrow.add(prefix)
  }
  return { broad, searched, proven }
}
