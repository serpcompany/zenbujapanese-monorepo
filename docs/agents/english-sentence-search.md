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
| `packages/dictionary-core/src/search/english-word-entries.ts` | `entriesExamplesUse`: the entries example sentences use for a word, from the word index; `areAlwaysTogether` |
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
that list nothing, or a past or `-ing` form that rule 6 leaves with none. So `the zebra` lists 縞馬
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
3. **The entry its example sentences use**, when it means the word. The word index holds, for an
   English word, up to three entries the sentence pairs with that word use, the most used first
   (`english_word_entries`; [`apps/ios/Tools/README.md`](../../apps/ios/Tools/README.md) says how
   it is built). `entriesExamplesUse` reads them for the sentence's words and their base forms.
   The app and the service attach the index; with none, as in the core's own tests, rules 4 to 6
   decide.
   - **Its own entries in the index, in order.** The word lists the first whose meaning is the
     word or one of its base forms (`irregularBaseFormsOf` and `baseFormsOf`), as itself or after
     "to". `pen` lists ペン alone, where its own results bring 書く "to pen" too; `home` lists 家,
     not 家庭; `went` lists 行く "to go", `saw` 見る, and `studying` 勉強 "study".
   - **An entry that only keeps the word company is passed over.** `watching` has テレビ first,
     `drinking` 酒, `post` 郵便局 "post office", `hour` 一時間 "one hour", and `tony` 君. None
     means the word, and `drinking` goes on to its next entry, 飲む.
   - **Unless the two are always together.** An entry that doesn't mean the word still passes
     when `both² / (withWord × withEntry)`, from the index's counts, is at least 3/4
     (`areAlwaysTogether`). `station` lists 駅, glossed only "railway station, train station":
     569 of the word's 637 pairs, and of the entry's 580, have both (0.88). `hour` and 一時間
     come to 0.59. The row shows the entry's own summary. Twenty-one words pass this way, most of
     them parts of place names (`york`, `fuji`); the cost is `lung`, which lists 肺がん "lung
     cancer", as all 16 pairs with the word do.
   - **Then its base forms' entries in the index**, each read as the word reads its base. A
     verb's form (irregular, or in `-ed` or `-ing`) takes the first entry that means "to" and the
     base: `watching` lists 見る, not 時計, which `watch` lists first; `fell` 落ちる, not 秋
     "fall"; `has` and `had` 有る; `found` 見つける, not 作る "to found". `secreted` still isn't
     "secret", which no entry has as a verb. An irregular plural takes a noun, and a word in `-s`
     any entry that means its base or is always with it: `doors` lists ドア, not ドアーズ, and
     `stations` 駅. A comparative isn't taken to its base, so `best` keeps 最高 (rule 6).
   - A word of one letter isn't looked up: in the index `s`, `u`, `m`, and `p` are pieces of
     "U.S." and "p.m.".

   A word the index doesn't settle goes on to the rules below: `hour` lists 時, `post` 投稿, and
   `tony` nothing.
4. **Its own entries and its base form's, weighed together**, for an irregular form
   (`english-irregular-forms.ts`):
   - A verb's form reads its base as a verb: the entries with a meaning `to <base>`. `gave` brings
     下さる. Every entry of the base would bring 軽い "light" for `lit`, 平均 "mean" for `meant`,
     and 涙 "tear" for `tore`.
   - A plural reads its base as a noun, by the entry's parts of speech: `wolves` brings 狼, not
     食らう "to wolf".
   - The two are weighed together because an irregular form is often another word too, which its
     own results lead with: `saw` 鋸, `went` いらした, `felt` フェルト, `won` ウォン, `feet` フィート.
     Frequency then lists 見る, 行く, 触る, 勝つ, and 足. With the index, rule 3 has listed 見る,
     行く, 感じる, and 勝つ already, and フィート for `feet`, which the index holds for that word.
   - The table holds `being`, `doing`, and `having`, regular as they are, because their own
     entries are nouns (存在). It doesn't hold `am`, `is`, `are`, `was`, `were`, `does`, or `did`,
     which rule 2 takes first.
   - It leaves out a form that sentences more often mean as another word, where the base's entry
     would replace the right one: `left` (左; "to leave" lists 行く), `rose` (薔薇), `bit` (as in
     "a bit"), `wound` (怪我), `lay`, `drunk`, and `people` (人々; "person" lists 人). It also leaves
     out a form whose base lists a word that would mislead: `rode` (召す), `shone` (磨く), `laid`
     (生む), `dealt`, `bled`, and `bred`. Each lists what it did before: its own entry, or nothing.
5. **Its own entries**, for any other word that has some: the entries with a meaning that is the
   word, or "to" and the word, tied for the lead among its first 60, as its own search ranks them.
   `getting` lists 頂戴. Without the index `cats` lists キャッツ, the musical; with it, rule 3
   lists 猫.
6. **Its base forms' entries**, for a word with none of its own (`baseFormsOf`):
   - A plural or third person (`-s`, `-es`, `-ies`) brings every entry of its base: `rabbits` 兎,
     `eats` 食べる.
   - A past or `-ing` form brings every entry of a base, where some entry has that base as a verb
     (a meaning `to <base>`): `pushed` lists 押す. A base that is no verb isn't the word's, so
     `incoming` isn't "income", and `secreted` isn't "secret". No entry means "to secrete", so
     `secreted` lists nothing. The cost: a verb the dictionary holds only as a noun lists nothing,
     where it listed the noun: `snowed` (雪), `voted` (投票), and `interviewed` (面接). Such a
     word still counts as one of the sentence's words. `snowing` lists 雪 by rule 3: the index
     holds it for the word itself.
   - A comparative or superlative (`-er` or `-est`; and `better`, `best`, `worse`, `worst`)
     brings its base's adjectives: the entries JMdict marks as i-, na-, pre-noun, or
     taru-adjectives. `bigger` lists 大きい, and `wetter` びしょびしょ, not 濡らす "to wet". This stays
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
base's. A word rule 3 settled brings one entry, or one for each of its base forms. An entry two
words lead with is listed once. Each row shows the meaning that matched: "is" beside です, "to
eat" beside 食べる for `ate`.

## What it still gets wrong

- Where examples are split between two entries that mean a word, the one in a few more pairs is
  listed: `see` lists 会う (482 pairs to 見る's 370) and `play` 弾く (104 to 遊ぶ's 89), and their
  forms follow (`sees`, `played`).
- An entry the examples use is passed over when no meaning of it is the word, though it is the
  right one: `brother` lists 入満, not 兄 "older brother"; `my` 我が, not 私; `want` 要る, not
  たい; `his` and `their` nothing, not 彼 and 彼ら. Of the index's 772 first entries that don't
  mean their word, 447 pass as a base form's meaning, 21 as always together, and 304 don't pass.
- A word in `-s` that is no plural takes its base's entry: `shorts` lists 短い, `ruins` 破滅, and
  `odds` 変.
- A common word the index doesn't hold wins on a side meaning: `get` and `got` list 成る, `out`
  ＯＵＴ, and `getting` 頂戴. Choosing by sense needs data the core doesn't have.
- Contractions and possessives (`i'm`, `it's`, `tom's`), `would`, and `could` list nothing, and a
  name is read as words.

[`tech-debt.md`](../tech-debt.md) holds these. Over the English of the 232,774 example sentences
(28,000 different words, 1.7 million uses), measured on 2026-10-12: 84% of uses list a word, 12%
are the six that list nothing, and 4% list nothing.

## Check it

- `packages/dictionary-core/src/search/english-sentence.test.ts` (a sentence) and
  `packages/dictionary-core/src/search/english-sentence-words.test.ts` (rules 1, 2, and 4 to 6),
  on a small dictionary built in memory (`english-sentence.fixture.ts`), and
  `packages/dictionary-core/src/search/english-word-entries.test.ts` (rule 3), on one with a word
  index attached.
- `packages/dictionary-core/src/examples/english-inflection.test.ts` and
  `packages/dictionary-core/src/examples/english-irregular-forms.test.ts`: the base forms and the
  tables.
- `apps/dictionary-api/src/conformance/sentence-search.test.ts`, on the app's data: each word that
  lists nothing, each fixed entry by number and headword, and words pinned for every rule (`pen`,
  `watching`, `hour`, `station`, `ate`, `saw`, `incoming`, `dogs`).
  `apps/dictionary-api/src/conformance/english-word-entries.test.ts` checks the index's entries
  that rule 3 turns on (`drinking`, `station`, `hour`), and
  `apps/ios/Tools/tests/test_example_word_index_contract.py` its first entry for the words its
  own rules were tuned on.
- The app records four English sentences in both search suites, which the service replays
  ([`dictionary-api.md`](dictionary-api.md), Check it), and
  `SearchUITests.testAnEnglishSentenceListsItsWordsAndOpensOne` drives one on the screen. A
  changed rule or table changes those answers: record the suites again on a Mac
  ([`ios.md`](ios.md#current-verification-boundary)).
