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
app's share links and the website build the same URL. ([ADR 0009](0009-serve-the-websites-dictionary-from-a-service-running-the-shared-core.md)
has the shared core compute it instead, with the same result.) A request with a stale or missing slug
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
not every possible query. (Under ADR 0009 nothing is precomputed for the website; the query set is
still to be chosen.)

## The website publishes; it is not a lookup service

ADR 0006 says no client sends dictionary lookups to a server. The apps still don't. The website
is a publisher: its server reads its own D1 copy of the artifact to render pages, and no app
queries it. That D1 database holds only what one pinned artifact version reproduces, plus a
record of which version is loaded, and the website never writes to it at runtime.
[ADR 0009](0009-serve-the-websites-dictionary-from-a-service-running-the-shared-core.md)
replaces the D1 copy with a service that reads one pinned artifact version itself; the
website is still a publisher that no app queries. Accounts and
learner data live in the backend and are reached only through its `/v1` API.

The discussion is in [issue 461](https://github.com/serpcompany/zenbujapanese-monorepo/issues/461).
This decision refines [ADR 0006](0006-share-language-data-as-a-versioned-artifact.md).
