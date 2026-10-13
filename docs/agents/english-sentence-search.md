# English sentence search

An English sentence that no entry means as a whole lists a Japanese word for each of its words, as
**Discovered Words** in the sentence's order (#401). This is how the shared core
([`dictionary-core.md`](dictionary-core.md), Search) chooses each word's entry. The website and
the app both show the core's answer ([website](../../apps/web/docs/product/dictionary.md),
[app](../../apps/ios/docs/product/dictionary.md)), so a rule changed here changes both, and the
answers the app recorded.

| File | Holds |
| --- | --- |
| `packages/dictionary-core/src/search/english-sentence.ts` | `englishSentenceCandidates`: the entries each word brings, by the rules below |
| `packages/dictionary-core/src/search/english-function-words.ts` | The words that list nothing, and the words that list a fixed entry |
| `packages/dictionary-core/src/examples/english-irregular-forms.ts` | The irregular verb forms, plurals, and comparatives, each under its base form |
| `packages/dictionary-core/src/examples/english-inflection.ts` | `irregularBaseFormsOf` and `baseFormsOf`: a word's base forms, and which of a base's entries are the word's |
| `packages/dictionary-core/src/results/results.ts` | `discoveredWords`: of the entries a word brings, the one listed |

## A sentence

A query is read as a sentence only when its own search finds nothing. `ice cream` is searched as
itself, and so is every single word, which these rules never touch: `is` alone still finds だ,
です, and the rest, and `saw` alone finds 鋸.

Its words are runs of letters and digits, with an apostrophe or hyphen kept inside
(`englishSentenceWords`), each once. The first 24 are looked up, until 12 have entries. The
sentence lists them when two or more of its words are known: a word with entries, one of the six
that list nothing, or a past or `-ing` form that rule 5 leaves with none. So `the zebra` lists 縞馬
alone and `it snowed` それ alone, while `the xyzzy` lists nothing.

## Which entries a word brings

The first rule that fits the word decides.

1. **Nothing**, for `a`, `an`, `the`, `of`, `to`, and `will`. The owner decided on 2026-10-12
   that a word with no Japanese counterpart lists nothing, and named the first four; `to` and
   `will` are the same kind. Before, `the` listed その and `a` listed 優, the grade.
2. **One fixed entry**, for twelve words whose own results led with another word (`it` with ＩＴ,
   `am` with 振幅変調, `are` with アール, `can` with 宜しい, `never` with 豈, `not` with ず):

   | Words | Entry | JMdict entry number | Meaning on its row |
   | --- | --- | --- | --- |
   | `am`, `are` | です | 1628500 | be |
   | `is` | です | 1628500 | is |
   | `was`, `were` | だった | 2819970 | was, were |
   | `it` | それ | 1006970 | it |
   | `not` | ない | 2257550 | not |
   | `can` | 出来る (できる) | 1340450 | to be able to do |
   | `never` | 決して | 1254130 | (not) ever |
   | `do`, `does`, `did` | する | 1157170 | to do |

   The owner's decision of that day named です, それ, ない, and できる. `was`, `were`, `do`, and
   `does` keep the entry they listed; `did` takes する with them, and `never` takes 決して. The
   table names an entry by its JMdict entry number and the meaning to show, and the entry is
   found as any word's are (`rankedByStrongGloss` for that meaning), so its row is ranked and
   labelled as every other. A number the data no longer held would list nothing, so
   `sentence-search.test.ts` checks each one, with its headword, on the app's data.
3. **Its own entries and its base form's, weighed together**, for an irregular form
   (`english-irregular-forms.ts`):
   - A verb's form reads its base as a verb: the entries with a meaning `to <base>`. `ate` brings
     食べる. Every entry of the base would bring 軽い "light" for `lit`, 平均 "mean" for `meant`,
     and 涙 "tear" for `tore`.
   - A plural reads its base as a noun, by the entry's parts of speech: `wolves` brings 狼, not
     食らう "to wolf".
   - The two are weighed together because an irregular form is often another word too, which its
     own results lead with: `saw` 鋸, `went` いらした, `felt` フェルト, `won` ウォン, `feet` フィート.
     Frequency then lists 見る, 行く, 触る, 勝つ, and 足.
   - The table holds `being`, `doing`, and `having`, regular as they are, because their own
     entries are nouns (存在). It doesn't hold `am`, `is`, `are`, `was`, `were`, `does`, or `did`,
     which rule 2 takes first.
   - It leaves out a form that sentences more often mean as another word, where the base's entry
     would replace the right one: `left` (左; "to leave" lists 行く), `rose` (薔薇), `bit` (as in
     "a bit"), `wound` (怪我), `lay`, `drunk`, and `people` (人々; "person" lists 人). It also leaves
     out a form whose base lists a word that would mislead: `rode` (召す), `shone` (磨く), `laid`
     (生む), `dealt`, `bled`, and `bred`. Each lists what it did before: its own entry, or nothing.
4. **Its own entries**, for any other word that has some: the entries with a meaning that is the
   word, or "to" and the word, tied for the lead among its first 60, as its own search ranks them.
   `cats` lists キャッツ, the musical, not 猫.
5. **Its base forms' entries**, for a word with none of its own (`baseFormsOf`):
   - A plural or third person (`-s`, `-es`, `-ies`) brings every entry of its base: `rabbits` 兎,
     `eats` 食べる.
   - A past or `-ing` form brings every entry of a base, where some entry has that base as a verb
     (a meaning `to <base>`): `played` lists 遊ぶ. A base that is no verb isn't the word's, so
     `incoming` isn't "income", and `secreted` isn't "secret". No entry means "to secrete", so
     `secreted` lists nothing. The cost: a verb the dictionary holds only as a noun lists nothing,
     where it listed the noun: `snowing` (雪), `voted` (投票), and `interviewed` (面接). Such a
     word still counts as one of the sentence's words.
   - A comparative or superlative (`-er` or `-est`; and `better`, `best`, `worse`, `worst`)
     brings its base's adjectives: the entries JMdict marks as i-, na-, pre-noun, or
     taru-adjectives. `taller` lists 高い, and `wetter` びしょびしょ, not 濡らす "to wet". This stays
     a fallback for the irregular four: `best` keeps 最高 rather than weigh it against 良い.
   - Before `-ed`, `-ing`, `-er`, and `-est`, a base may have doubled its consonant (`stopped`,
     `bigger`), dropped an `e` (`making`, `nicer`), or turned `y` into `i` (`studied`,
     `heavier`). A base of one short vowel and one consonant always doubles, so `stared` isn't
     "star", `taped` isn't "tap", and `peter` isn't "pet". Example search's own check
     (`sameWordInAnyForm`, #428) still reads those as one word, as it reads no comparative.

## Which entry is listed

The results layer has the learner's frequency dictionaries, so it chooses. `discoveredWords`
orders a word's entries as a search's results are ordered (`orderedByFrequency`) and lists the
first. Entries no dictionary tells apart keep the order they came in, the word's own before its
base's. An entry two words lead with is listed once. Each row shows the meaning that matched:
"is" beside です, "to eat" beside 食べる for `ate`.

## What it still gets wrong

- A common word wins on a side meaning: `get` and `got` list 成る, `have` and `has` 含む, `found`
  作る ("to found"), and `fell` 降る. Choosing by sense needs data the core doesn't have.
- Contractions and possessives (`i'm`, `it's`, `tom's`), `his`, `their`, `would`, and `could`
  list nothing, and a name is read as words.

[`tech-debt.md`](../tech-debt.md) holds these. Over the English of the 232,774 example sentences
(28,000 different words, 1.7 million uses), measured on 2026-10-12: 84% of uses list a word, 12%
are the six that list nothing, and 4% list nothing.

## Check it

- `packages/dictionary-core/src/search/english-sentence.test.ts` (a sentence) and
  `packages/dictionary-core/src/search/english-sentence-words.test.ts` (each rule), on a small
  dictionary built in memory (`english-sentence.fixture.ts`).
- `packages/dictionary-core/src/examples/english-inflection.test.ts` and
  `packages/dictionary-core/src/examples/english-irregular-forms.test.ts`: the base forms and the
  tables.
- `apps/dictionary-api/src/conformance/sentence-search.test.ts`, on the app's data: each word that
  lists nothing, each fixed entry by number and headword, and words pinned for every rule (`ate`,
  `saw`, `taller`, `incoming`, `dogs`).
- The app records four English sentences in both search suites, which the service replays
  ([`dictionary-api.md`](dictionary-api.md), Check it), and
  `SearchUITests.testAnEnglishSentenceListsItsWordsAndOpensOne` drives one on the screen. A
  changed rule or table changes those answers: record the suites again on a Mac
  ([`ios.md`](ios.md#current-verification-boundary)).
