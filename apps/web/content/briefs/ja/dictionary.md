# Keyword brief: the dictionary home, search results, and word pages

`/ja/dictionary/` is a Japanese-English dictionary (和英辞典) for Japanese speakers (ADR 0007): the
headwords are Japanese and the meanings are JMdict's English, so a reader comes to learn what a
Japanese word is in English, or types English to find the Japanese. One brief covers the home
page, and one each the two templates every search and word page share. The slugs stay the same in
every language, so the title, H1, and description carry the keyword.

## How these keywords were chosen

There is no Japanese keyword tool here, so no volume is measured and none is given (see
[`README.md`](README.md)). The keywords follow SERP's International SEO guide (one brief per
template, the local keyword in the title, H1, and description), common Japanese search phrasing,
and the titles of the pages that rank for that phrasing today, read from the results for
「見る 英語」「要る 意味 英語」「和英辞典 無料」 on 2026-10-15 (a US search, not `gl=jp&hl=ja`):

- **Weblio** (ejje.weblio.jp) titles a word page 「〇〇の英語・英訳」 and answers both directions
  as 英和辞典・和英辞典 under one brand.
- **DMM英会話** (eikaiwa.dmm.com, なんてuknow?) and English-learning blogs rank for 「見る 英語」
  with pages that compare the English words (see, look, watch), titled as questions or
  comparisons; their exact title formats weren't confirmed from the results.
- **英辞郎 on the WEB** (eow.alc.co.jp) ranks with its search pages; its title format wasn't
  confirmed from the results.
- The results for 「和英辞典 無料」 were mostly App Store dictionary apps, which name
  themselves 「英和辞典・和英辞典」 and lead with 無料 and オフライン.

Measure every keyword below in a Japan database, and read the results with `gl=jp&hl=ja`,
before the native review.

## The dictionary home, `/ja/dictionary/`

| Role | Keyword | Volume | Why |
| --- | --- | --- | --- |
| Primary | 英和辞典 | 14,000 (Ahrefs, difficulty 8) | The most searched name for an English–Japanese dictionary, which this one is in both directions (#886) |
| Primary | 和英辞典 | 3,900 (difficulty 5) | The term list's name for the website's dictionary, and how Japanese readers name a dictionary that explains Japanese in English |
| Secondary | 英語辞書 | 10,000 (difficulty 11) | The plain name, with 英語辞典 (5,200) and 辞書 英語 (5,000) |
| Secondary | 和英辞典 無料 | 450 (difficulty 0) | The web dictionary is free; app and site results lead with 無料 |
| Secondary | 日本語 英語 意味 調べる | Not measured | The task in the searcher's own words |
| Secondary | 漢字 英語 意味 | Not measured | Kanji details open from a one-kanji search |
| Secondary | ローマ字 検索 | Not measured | Search takes romaji as well as kana and kanji |

| Field | Text |
| --- | --- |
| Title | 英和辞典・和英辞典｜無料の英語辞書 (the layout adds ` \| Zenbu Japanese`) |
| H1 | 英和・和英辞典 |
| Lead | 日本語の単語や漢字の英語の意味を、読み方・アクセント・例文と一緒に調べられます。漢字・かな・ローマ字・英語のどれでも検索できます。 |
| Meta description | 英単語を日本語で、日本語を英語で引ける無料の英和辞典・和英辞典です。漢字・かな・ローマ字・英語のどれでも検索でき、漢字検索にも対応。読み方・アクセント・例文もすぐに確認でき、五十音や品詞、漢字一覧などからも言葉を探せます。 |

The title leads with both primary keywords, then 無料 and 英語辞書, as Ahrefs measured them on
2026-10-19 (#886). The lead and the description carry the secondary keywords: 英語の意味, 読み方,
アクセント, 例文, 漢字検索, and the four ways to search.

## Search results, `/ja/dictionary/search/<query>/`

A search page lists the Japanese words that match its query. What a Japanese searcher wants
depends on the query's script, so the title and description do too (`isASCII` in the core's
query rules, as the Example Sentences row already decides):

- **A Japanese query** (いる, 要): the reader wants the word's English. Primary keyword:
  「〈query〉 英語」, secondary 「〈query〉 意味 英語」 and 「〈query〉 読み方」.
- **An English query** (eat, to be needed): the reader wants the Japanese for an English word.
  Primary keyword: 「〈query〉 日本語」, secondary 「〈query〉 意味」.

| Field | Japanese query | English query |
| --- | --- | --- |
| Title | 〈query〉の英語・意味 | 「〈query〉」の意味・和訳：〈top word〉（〈reading〉）, with ・例文 when the page shows sentences |
| H1 | the title, under the search box | 「〈query〉」の意味と日本語訳 |
| Meta description | 「〈query〉」の英語の意味を、一致する〈n〉語の読み方と一緒に紹介します。 | 英語「〈query〉」の意味・和訳は「〈top word〉（〈reading〉）」。ほか〈n〉語の日本語訳も、読み方と英語の意味付きで紹介します。 |
| No matches | 「〈query〉」に一致する言葉は見つかりませんでした。 | the same |

An English query's title names its top word because 「〈word〉 意味」 is how these searches are typed
(3,700 a month over eight sample words, #886), as Weblio and ALC title the same pages. A romaji
query (iru) is a Japanese query. A long query is shortened, with …, to keep the title within 70.
A search page is indexed only when it lists a word or its kanji row has details, as in English.
The breadcrumb reads 検索：〈query〉, and the count above the results 「〈query〉」の検索結果：〈n〉語.

`/ja/dictionary/search/` (the empty search) is `noindex`: 和英辞典で検索, with
「日本語の単語や漢字を、漢字・かな・ローマ字・英語で検索できます。」

## Word pages, `/ja/dictionary/<slug>-<ent_seq>/`

The big opportunity. Japanese speakers look up a word's English by typing the word and 英語, or
the word, 意味, and 英語, and Weblio's 「〇〇の英語・英訳」 pages show that the results page answers
with a dictionary entry. The word page has what those searchers want: the English meanings, the
reading, the pitch accent, the conjugations, and Tatoeba's example sentences in both languages.

| Role | Keyword | Volume | Why |
| --- | --- | --- | --- |
| Primary | 〈word〉 英語 | Not measured | The most common phrasing for a word's English |
| Secondary | 〈word〉 意味 英語 | Not measured | The same question with 意味; the title holds both |
| Secondary | 〈word〉 英語 例文 | Not measured | The page lists up to 100 example sentences with their English |
| Secondary | 〈word〉 読み方 | Not measured | The reading is in the furigana and the pitch row |
| Secondary | 〈word〉 活用 | Not measured | Verbs and adjectives have a full conjugation table |

| Field | Text |
| --- | --- |
| Title, with examples | 〈headword〉（〈reading〉）の英語・意味・例文 |
| Title, without examples | 〈headword〉（〈reading〉）の英語・意味 |
| H1 | the headword with its furigana, named for the headword, as in English |
| Section that answers the query | 英語の意味, the first section, with JMdict's numbered meanings |
| Meta description | 「〈headword〉（〈reading〉）」は英語で「〈JMdict's summary〉」という意味です。品詞は〈part of speech〉。 |

For example 「要る（いる）の英語・意味・例文」, and 「要る（いる）」は英語で「to be needed, to be
necessary, …」という意味です。品詞は五段動詞（自動詞）。The reading is left out when the headword is
already kana (いるの英語・意味・例文), and 例文 only when the word has examples, so the title never
promises a section the page lacks. The description quotes JMdict's English summary as it is: it
is the answer the searcher wants, and it makes the snippet match the page.

The H1 stays the headword, as Weblio's pages and the app's word screen keep it: it is exactly what
the reader typed. The title and the first section, 英語の意味, carry 英語 and 意味 instead.

## On every page

- Interface text is Japanese; JMdict's meanings, KANJIDIC2's kanji meanings, and Tatoeba's English
  translations stay English, marked `lang="en"`.
- Part-of-speech and usage labels use school grammar's names: 五段動詞（自動詞）, 一段動詞, サ変動詞,
  カ変動詞, 形容詞, 形容動詞, 名詞, 副詞, 助詞, 通常はかな書き, 尊敬語, 謙譲語.
- Section names follow the term list: 英語の意味, 使用頻度, 活用, 漢字, 読み方, 例文, 書き順,
  アクセント.

## For the native review

- 「〈word〉 英語」 against 「〈word〉 英訳」 as the primary keyword; Weblio's titles use both.
- Whether the title should say 英訳 rather than 英語 (〇〇の英訳・意味・例文).
- An H1 such as 「要る」の英語 instead of the headword alone, against the furigana heading the
  app and the English page share.
- The grammar names for JMdict's tags: サ変動詞 for する verbs, カ変動詞 for 来る, 形容動詞 for
  na-adjectives, 補助語 for JMdict's "auxiliary", 断定の助動詞 for its copula, and 表現 for its
  expressions.
- The conjugation forms' names (現在・未来形, 条件形, 名詞修飾形) and explanations, written for a
  reader who knows school grammar.
- The pitch row's reading, 「アクセント：0型、2拍」, and the frequency rows' 「YouTubeの頻度順位：949位」.
