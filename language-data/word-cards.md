# Word cards

A word card is one dictionary word as the Zenbu app shows it, for an app that doesn't bundle the
language data, such as Tomodachi (#563). An app ships an export of cards for the words its own
content teaches (#569), and a signed-in app can fetch cards for more words from the dictionary
service (#571). Both come from the same language data and the same shared core
(`packages/dictionary-core/src/cards/`) as the app and the website, so a card agrees with them.

The format is `zenbu.word-cards.v1`. It is versioned like a release file
([`README.md`](README.md), Changing what's in a release): adding a field, or a chip for another
ranked list, keeps `v1`; removing, renaming, or changing the meaning of a field, or a new `tier`
value, makes `v2`. A client reads `format` first and refuses a version it doesn't know, ignores
fields it doesn't know, and finds a chip by its `list`, never by its position.

## Making an export

```sh
pnpm --filter zenbujapanese-dictionary-api word-cards <word list> <output folder>
```

after `git lfs pull` and `pnpm install` at the repository root; relative paths are from the
folder the command is run in. It reads the app's language data as the working tree has it, and
its release from `release.json`. The word list has one word to a line: a Language Reference ID (32 hex characters,
in either case), or a headword and its reading separated by a tab. Blank lines are skipped. The
command writes `word-cards.json` and a fresh `notices/` folder to the output folder, and prints
each line it couldn't read, and each word it couldn't resolve or found more than one entry for.
It exits 1 when there's any of those, so a build that bakes cards stops, and 0 when every word has
a card.

A headword and reading resolve to the entry that has the headword as a written or a reading form
and the reading as a reading form, both compared as the app's Search normalizes them (so
`ありがとう` finds 有難う, and `Tシャツ` finds Ｔシャツ). When more than one entry does, the ones
whose own headword and reading are exactly those win. If more than one still does, the word is
ambiguous: name it by one of its candidates' IDs instead. Entries the app shows as one word (the
same meanings, written the same way) count as one: the one with the lowest ID, which the app
keeps.

## An export

| Field | What it holds |
| --- | --- |
| `format` | `zenbu.word-cards.v1`. |
| `languageData` | `release` (the language-data release, `language-data/release.json`) and `files`: the SHA-256 of each file a card is read from, by name (`LanguageReferenceData.sqlite3`, `CompoundPitch.sqlite3`, `JLPTLevelPack.sqlite3`, `TUBELEXFrequencyPack.sqlite3`, `RankedLists.sqlite3`, `KanjiReferenceData.json`, and `KanjiElementReferenceData.json`). Key a cache on `format` and all of `languageData`: a published release never changes, but the files can change on `main` before `release.json` is bumped for them, and the files' SHA-256s catch that. |
| `license` | The cards adapt CC BY-SA 4.0 data (JMdict and KANJIDIC2, the JLPT vocabulary lists, and Jiten), so they are shared under CC BY-SA 4.0: its `name`, `url`, and a `statement` to show with them. |
| `sources` | Each source the cards hold data from: `name`, what it `supplies`, its `license` and `url`, and its `notice`, a file name in `notices/` and in the language-data release. Ship the notices with the cards. |
| `cards` | One card for each word that resolved, in the list's order, each once. |
| `ambiguous` | Each word with more than one entry, once: the `query` and its `candidates` (`languageReferenceID`, `entSeq`, `headword`, `reading`, `summary`). |
| `unresolved` | Each word with no entry, once, as the list named it: `{ "headword", "reading" }`, or `{ "languageReferenceID" }` in lowercase. |

The sources are JMdict and KANJIDIC2 (EDRDG), UniDic, the JLPT vocabulary lists, TUBELEX,
Wikipedia Word Frequency Clean, and Jiten. Tatoeba isn't one: a card holds no example sentences.

## A card

| Field | What it holds |
| --- | --- |
| `languageReferenceID` | The entry's Language Reference ID, lowercase hex: what a card, a list, and a known word are keyed by ([`CONTEXT.md`](../CONTEXT.md)). |
| `entSeq` | Its JMdict entry number. |
| `headword`, `reading` | As the app's Word Detail shows them. |
| `furigana` | The headword split into `base` text, each with its `reading` where Word Detail shows furigana over it, and `kanjiReadings`, the reading of each kanji, when the kanji's own readings split it exactly one way. |
| `pitch` | `null`, or `downstep` (0 for flat), `moraCount` (UniDic's, as the app reads it aloud), `morae` (the reading in katakana morae, as the graph draws them), `levels` (`H` or `L` for each of `morae`), `particle` (the level of a particle after it), `estimated` (true when UniDic doesn't list the word and the pitch is estimated from its two parts), and the `source`. |
| `partOfSpeech` | The part of speech as Word Detail writes it, such as `Ichidan verb (transitive)`. |
| `meanings` | Each sense in order: its `meaning`, `notes`, and `partsOfSpeech`, the app's identifiers for JMdict's part-of-speech codes, such as `ichidanVerb` and `transitive`; `packages/dictionary-core/src/detail/part-of-speech.ts` writes them as words. |
| `jlpt` | `null`, or the JLPT chip: `source` (`JLPT`), `value` (`N5`), `level` (5), `tier`, and `spokenTier` (`null`). The levels are estimates from Jonathan Waller's lists. |
| `frequency` | A chip for each of the eight ranked lists, in this order: YouTube, Wikipedia, TV & Movies, Anime, Manga, Novels, Visual Novels, and Games. Each has its `list` (the browse pages' slug), `rank` (`null` when the list doesn't rank the word), and the chip as the app writes it: `source`, `value` (`1,234`, or `No rank`), `tier` (`veryCommon`, `common`, `moderate`, `uncommon`, `rare`, or `null`), and `spokenTier`, the tier in words for a screen reader. |

The app shows only the chips of the dictionaries a learner turns on, JLPT and YouTube by
default; a client picks its own the same way.

## How it's checked

- `packages/dictionary-core/src/cards/card.test.ts`: the card for each fixture word the
  word-detail suite records holds what the suite records (headword, reading, furigana, pitch, part
  of speech, meanings, and the JLPT and YouTube chips), and the eight ranked chips' order.
- `apps/dictionary-api/src/conformance/word-cards.test.ts`, on the app's data: the same for every
  word the suite records, each ranked chip against its list, an estimated pitch, resolving (kana to
  kanji, normalized forms, repeats), the export's notices, and the command's files and exit codes.
