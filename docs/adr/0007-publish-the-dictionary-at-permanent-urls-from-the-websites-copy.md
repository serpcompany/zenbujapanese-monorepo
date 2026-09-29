---
status: accepted
---

# Publish the dictionary at permanent URLs from the website's own copy

zenbujapanese.com publishes one public page per dictionary word, per kanji, and per search. Its
URLs are permanent, so they are keyed on an ID that never changes, and the website serves them
from its own copy of the shared language-data artifact.

## Word URLs end in the JMdict entry number

A word page is `/dictionary/<slug>-<ent_seq>/`, for example `/dictionary/要る-1546640/`. The
number is JMdict's `ent_seq`, not the Language Reference ID. It keeps homographs such as 要る,
入る, and 射る (all いる) apart, it is 7 digits against the Language Reference ID's 32, and it
matches jpdb, Takoboto, and Tangorin. EDRDG never reuses an `ent_seq`, and the Language Reference ID is a hash
of it, so both are equally permanent. The cost is that public URLs expose JMdict's key, which
`import_jmdict.py` otherwise keeps out of Zenbu's identifiers. A word from any other source
would need its own URL form. Learner data keeps using Language Reference IDs (ADR 0006).

The slug is only for reading. It is the headword as the app displays it, NFC-normalized, with
`/ ? # % \` and whitespace replaced by `-`, falling back to the reading if nothing is left. It
is percent-encoded UTF-8 in canonical URLs and sitemaps. The artifact precomputes it, so the
app's share links and the website build the same URL. A request with a stale or missing slug
(`/dictionary/1546640/`) redirects (308) to the current one. An `ent_seq` that a published
artifact once held returns 410, or 308 when a replacement is recorded. Any other unknown number
returns 404.

The headword is always Japanese; the direction of a lookup lives in search, as in the app. A
URL prefix names the site locale, the language the reader picks for the site, and English has
none. Meanings are in the locale's language when JMdict has them, otherwise in English, so
`/es/dictionary/` explains words in Spanish and `/ja/dictionary/` is a Japanese-English
dictionary for Japanese speakers. Every locale uses the same numbers, linked by hreflang. The
URL carries no language pair: a dictionary of words in another language, such as English words
explained in Japanese, needs other data and gets its own section or site.

## Kanji URLs are the character

A kanji page is `/dictionary/kanji/<character>/`, for example `/dictionary/kanji/生/`. The
character is the kanji's permanent ID, as it is in the app, which saves a kanji as itself. The
path is the exact code point and is never Unicode-normalized: 75 KANJIDIC2 characters are
compatibility ideographs that NFC would turn into a different kanji. A kanji with no meanings or
readings is `noindex`.

## Search pages are indexed

A search is `/dictionary/search/<normalized query>/`, in Japanese, kana, romaji, or English.
`?q=` and non-normalized forms redirect (308) to it. A page with results is indexable and
self-canonical, including an exact match, which stays a results page like the app's. A page
without results is `noindex`. Search sitemaps list a query set that the artifact precomputes,
not every possible query.

## Amendment (#511): element and conjugation pages

The website also publishes a page per kanji element and per conjugation screen, as the app opens
each as its own screen. Their URLs follow the rules above.

**Element URLs are the glyph.** An element of kanji, such as 氵 or 女 as part of other kanji, is
`/dictionary/elements/<glyph>/`, for example `/dictionary/elements/氵/`. The app opens an element
on its own, not as part of a kanji, so the URL names no kanji. The glyph is the element's
permanent ID, as the character is a kanji's: the exact code point, never Unicode-normalized, so
the compatibility ideograph 海 (U+FA45) and 海 (U+6D77) are two elements with two pages. A glyph
that was never an element returns 404. An element that a published artifact had and a later one
removes returns 410, as a retired word does; no release records removed elements yet, so until
one does, such an element answers 404. An element page with meanings or linked on-readings is
indexable, as a kanji page with meanings or readings is.

**Conjugation URLs are under the word.** A word's conjugation table is
`/dictionary/<slug>-<ent_seq>/conjugations/`, and each form is
`/dictionary/<slug>-<ent_seq>/conjugations/<register>/<kind>/`, with the register (`plain` or
`polite`) and the kind as the app names them (`past`, `te-form`). They are keyed on the word's
`ent_seq`, so a stale or missing slug redirects (308) to the canonical URL, as a word's does, and
a retired word's conjugation pages go with it. A form spelled as another in the same table names
that one as canonical rather than duplicating it.

**Reserved segments.** A word's segment always ends in `-<ent_seq>`, so the dictionary's own
segments can never collide with a word: `/dictionary/kanji/`, `/dictionary/elements/`,
`/dictionary/search/`, and `/dictionary/examples/` are reserved for kanji, element, search, and
example pages, and a new kind of page takes a new reserved segment of its own.

## The website publishes; it is not a lookup service

ADR 0006 says no client sends dictionary lookups to a server. The apps still don't. The website
is a publisher: its server reads its own D1 copy of the artifact to render pages, and no app
queries it. That D1 database holds only what one pinned artifact version reproduces, plus a
record of which version is loaded, and the website never writes to it at runtime. Accounts and
learner data live in the backend and are reached only through its `/v1` API.

The discussion is in [issue 461](https://github.com/serpcompany/zenbujapanese-monorepo/issues/461).
This decision refines [ADR 0006](0006-share-language-data-as-a-versioned-artifact.md).
