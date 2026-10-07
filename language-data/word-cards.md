# Word cards

A word card is one dictionary word as the Zenbu app shows it, for an app that doesn't bundle the
language data, such as Tomodachi (#563). An app ships an export of cards for the words its own
content teaches (#569), and a signed-in app can fetch cards for more words from the dictionary
service (#571). Both come from the same language data and the same shared core
(`packages/dictionary-core/src/cards/`) as the app and the website, so a card agrees with them.

The format is `zenbu.word-cards.v1`. It is versioned like a release file
([`README.md`](README.md), Changing what's in a release): adding a field keeps `v1`, and removing,
renaming, or changing the meaning of one makes `v2`. A client reads `format` first and refuses a
version it doesn't know.

## Making an export

```sh
pnpm --filter zenbujapanese-dictionary-api word-cards <word list> <output folder>
```

after `git lfs pull` and `pnpm install` at the repository root. The word list has one word to a
line: a Language Reference ID (32 hex characters), or a headword and its reading separated by a
tab. Blank lines are skipped. The command writes `word-cards.json` and a `notices/` folder to the
output folder, and prints each line it couldn't read, and each word it couldn't resolve or found
more than one entry for.

A headword and reading resolve to the entry that has the headword as a written form (or, for a
word written in kana, a reading form) and the reading as a reading form. When more than one entry
does, the ones whose own headword and reading are exactly those win. If more than one still does,
the word is ambiguous: name it by one of its candidates' IDs instead.

## An export

| Field | What it holds |
| --- | --- |
| `format` | `zenbu.word-cards.v1`. |
| `languageData` | `release` (the language-data release, `language-data/release.json`), `file` (`LanguageReferenceData.sqlite3`), and its `sha256`. A card is true of that data; a client that sees another refetches. |
| `sources` | Each source the cards hold data from: `name`, what it `supplies`, its `license` and `url`, and its `notice`, a file name in `notices/` and in the language-data release. Ship the notices with the cards. |
| `cards` | One card for each word that resolved, in the list's order, each once. |
| `ambiguous` | Each word with more than one entry: the `query` and its `candidates` (`languageReferenceID`, `entSeq`, `headword`, `reading`, `summary`). |
| `unresolved` | Each word with no entry: the `query` as the list named it. |

The sources are JMdict and KANJIDIC2 (EDRDG), UniDic, the JLPT vocabulary lists, TUBELEX,
Wikipedia Word Frequency Clean, and Jiten. Tatoeba isn't one: a card holds no example sentences.

## A card

| Field | What it holds |
| --- | --- |
| `languageReferenceID` | The entry's Language Reference ID, lowercase hex: what a card, a list, and a known word are keyed by ([`CONTEXT.md`](../CONTEXT.md)). |
| `entSeq` | Its JMdict entry number. |
| `headword`, `reading` | As the app's Word Detail shows them. |
| `furigana` | The headword split into `base` text, each with its `reading` when it has kanji, and `kanjiReadings`, the reading of each kanji, when the kanji's own readings split it exactly one way. |
| `pitch` | `null`, or `downstep` (0 for flat), `moraCount`, `morae` (in katakana), `levels` (`H` or `L` for each mora), `particle` (the level of a particle after it), `estimated` (true when UniDic doesn't list the word and the pitch is estimated from its two parts), and the `source`. |
| `partOfSpeech` | The part of speech as Word Detail writes it, such as `Ichidan verb (transitive)`. |
| `meanings` | Each sense in order: its `meaning`, `notes`, and `partsOfSpeech` (identifiers such as `ichidanVerb`). |
| `jlpt` | `null`, or the JLPT chip: `source` (`JLPT`), `value` (`N5`), `level` (5), `tier`, and `spokenTier` (`null`). The levels are estimates from Jonathan Waller's lists. |
| `frequency` | A chip for each of the eight ranked lists, in this order: YouTube, Wikipedia, TV & Movies, Anime, Manga, Novels, Visual Novels, and Games. Each has its `list` (the browse pages' slug), `rank` (`null` when the list doesn't rank the word), and the chip as the app writes it: `source`, `value` (`1,234`, or `No rank`), `tier` (`veryCommon`, `common`, `moderate`, `uncommon`, `rare`, or `null`), and `spokenTier`, the tier in words for a screen reader. |

The app shows only the chips of the dictionaries a learner turns on, JLPT and YouTube by
default; a client picks its own the same way.

## How it's checked

- `packages/dictionary-core/src/cards/card.test.ts`: the card for each fixture word the
  word-detail suite records holds what the suite records (headword, reading, furigana, pitch, part
  of speech, meanings, and the JLPT and YouTube chips), and the eight ranked chips' order.
- `apps/dictionary-api/src/conformance/word-cards.test.ts`, on the app's data: the same for every
  word the suite records, each ranked chip against its list, resolving, and the export's notices.
