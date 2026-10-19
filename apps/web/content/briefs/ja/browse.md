# Keyword brief: the browse pages

The Japanese versions of the pages under `/ja/dictionary/browse/`: the kana charts, the words by
first kana, the category lists and their indexes, the frequency lists, the JLPT vocabulary, and the
kanji lists. They are programmatic pages, so there is one brief per template. Unlike the dictionary
itself, these lists have real Japanese demand of their own: parents and pupils look for a ひらがな表
or the kanji of a school year, writers look for 「〜から始まる言葉」, and learners who read Japanese
look for JLPT単語 and 頻出語. Each Japanese title and H1 is built on the phrase those searchers type,
usually ending in 一覧, the word Japanese list pages use. The brand comes from the site's title
template (`… | Zenbu Japanese`).

The terms are the agreed ones in [`../../terms/ja.md`](../../terms/ja.md): 五十音表 for the kana
charts, 頻出語リスト for the frequency lists, JLPT単語, 品詞, and 漢字. Where a list or category is
also a label on a word page (a part of speech such as 五段動詞, a usage note such as 尊敬語, a
school grade such as 小学4年, a list such as アニメ), its Japanese name is the word page's, from
`coreText` in `src/lib/i18n/core-text.ts`, so the two pages agree. The other names (dialects,
subjects, most usage labels) are in `src/lib/dictionary/browse/category-names-ja.ts`, and every
string is in the `browse` and `categoryIntros` namespaces. Meanings stay JMdict's English, and
licence names stay in English.

There is no Japanese keyword tool here, so no volume is measured or estimated (see
[`README.md`](README.md)). The keywords follow SERP's International SEO guide, common Japanese
search phrasing, and the titles of the pages that already answer these searches, read with a web
search that runs from the US, so not a Japan results page. Those titles agree with the choices
below: the school-kanji site
[eleschool-compass](https://eleschool-compass.com/contents/kanji/kanji-grade4.php) titles its
grade pages 小学4年生で習う漢字; Japanese kana-chart apps call the chart a 五十音表 with
ひらがな・カタカナ; the literature on 擬音語・擬態語 calls the two together オノマトペ; school
grammar's twelve parts of speech name the adjectives 形容詞 and 形容動詞, as the word page does;
and 「〜から始まる言葉」 is searched for しりとり, where answers are written in kana. Measure each
keyword in a Japan database, and read the `gl=jp&hl=ja` results, before the native review.

## Browse home, `/ja/dictionary/browse/`

| Role | Keyword | Volume | Why |
| --- | --- | --- | --- |
| Primary | 日本語 単語 一覧 | Not measured | What the page is: every word, by list |
| Secondary | 五十音 単語 一覧, 和英辞典 一覧 | Not measured | The ways in it offers |

| Field | Text |
| --- | --- |
| Title and H1 | 日本語の単語を一覧から探す |
| Meta description | 和英辞典に載っているすべての単語と漢字を、五十音、漢字リスト、使用頻度、品詞や分野から探せます。 |

The breadcrumb names the page 一覧から探す, which every browse page's trail starts from.

## Kana charts, `/ja/dictionary/browse/kana/`

| Role | Keyword | Volume | Why |
| --- | --- | --- | --- |
| Primary | 五十音表 | Not measured | The agreed term, and what the page shows |
| Secondary | ひらがな表, カタカナ表, 五十音表 ローマ字 | Not measured | The charts, with romaji |

| Field | Text |
| --- | --- |
| Title and H1 | ひらがな・カタカナの五十音表 |
| Meta description | ローマ字つきのひらがな表・カタカナ表です。かなを押すと、その字で始まる日本語の言葉をすべて見られます。 |

The English intro explains that Japanese has two kana scripts; the Japanese one doesn't explain
Japanese to a Japanese reader, and says instead what the chart does.

## Hiragana and katakana, `/ja/dictionary/browse/hiragana/` and `/katakana/`

| Role | Keyword | Volume | Why |
| --- | --- | --- | --- |
| Primary (hiragana) | ひらがな 言葉 一覧 | Not measured | Every word, by its first kana |
| Primary (katakana) | カタカナ語 一覧 | Not measured | How a list of katakana words is named |
| Secondary | あ行 言葉, 五十音順 単語 | Not measured | The chart by first kana |

| Field | Hiragana | Katakana |
| --- | --- | --- |
| Title | ひらがなから探す言葉一覧 | カタカナ語一覧 |
| H1 | ひらがなから探す言葉一覧（あ〜ん） | カタカナ語一覧（ア〜ン） |
| Meta description | 日本語の言葉{count}語を、読みの最初のかなから探せます。 | the same |

## Words by first kana, `/ja/dictionary/browse/hiragana/{kana}/`

One page per kana (い) and per two-kana group (いる), with later pages of a group at
`…/{page}/`. The same template serves katakana (`/katakana/イ/`).

| Role | Keyword | Volume | Why |
| --- | --- | --- | --- |
| Primary | {kana}から始まる言葉 | Not measured | The phrase writers and quiz players search: いから始まる言葉 |
| Secondary | {kana}で始まる言葉 一覧, {kana}から始まる単語 | Not measured | The same search, phrased otherwise |

| Field | Text |
| --- | --- |
| Title and H1 | 「{kana}」から始まる言葉一覧 |
| Title, later pages | 「{kana}」から始まる言葉一覧（{page}ページ目） |
| Meta description | 読みが「{kana}」で始まる日本語の言葉{count}語を、英語の意味つきで紹介します。 |

The quotation marks keep a one-kana keyword readable (「い」から始まる); search engines match it
without them.

## A category list, `/ja/dictionary/browse/{category}/`

One page per JMdict label, most used first, with a kana-order list at `…/kana-order/` (not
indexed) and later pages at `…/{page}/`. The H1 is the title; the meta description is the page's
intro: how many words JMdict marks, in what order, then a sentence or two on what the category is,
written in Japanese for each one.

| Kind | Primary keyword | Title and H1 | Example |
| --- | --- | --- | --- |
| Part of speech | {name} 一覧 | {name}一覧 | 五段動詞一覧, 形容詞一覧, 助数詞一覧 |
| Usage label | {name} 一覧 | {name}一覧 | 四字熟語一覧, ことわざ一覧, ネットスラング一覧 |
| Dialect | {name} 一覧 | {name}一覧 | 関西弁一覧, 津軽弁一覧 |
| Subject | {name}用語 一覧 | {name}用語一覧 | 医学用語一覧, 野球用語一覧, 料理用語一覧 |
| Common words | よく使う 日本語 単語 | よく使われる日本語の単語一覧 | |

Some lists read better with their own title, as the English ones have: 擬音語・擬態語（オノマトペ）一覧
(for 擬音語 一覧 and オノマトペ 一覧), 「の」がつく名詞一覧, 使われなくなった言葉（廃語）一覧, ふつうかなで
書く言葉一覧, and ブランド名・商品名一覧 for trademarks. Secondary keywords are the category's other
names: 形容動詞 for な形容詞, い形容詞 for 形容詞, サ変動詞 for する動詞, 擬態語 for onomatopoeia.

| Field | Text |
| --- | --- |
| Title, kana order | {heading}・五十音順 |
| Title, later pages | {heading}（{page}ページ目） |
| Meta description | JMdictで品詞が{name}とされている言葉{count}語です。1番目の意味がこの品詞の言葉を先に、YouTubeでよく使われる順に並べています。{intro} |

Usage labels and dialects say JMdictで{name}とされている言葉, and subjects JMdictで{name}の用語と
されている言葉, in the same sentence.

## The category indexes

| Page | Primary keyword | Title | H1 |
| --- | --- | --- | --- |
| `/ja/dictionary/browse/parts-of-speech/` | 品詞 一覧 | 品詞一覧：品詞別に日本語の単語を探す | 品詞一覧 |
| `/ja/dictionary/browse/usage/` | 敬語 俗語 方言 一覧 | 用法・方言別の単語一覧：敬語・俗語・方言など | 用法・方言別の単語一覧 |
| `/ja/dictionary/browse/subjects/` | 専門用語 一覧 | 分野別の用語一覧：医学・法律・スポーツなど | 分野別の用語一覧 |

| Page | Meta description |
| --- | --- |
| Parts of speech | 名詞・動詞・形容詞・助詞など、JMdictの分類による品詞ごとに、日本語の単語とその数をまとめています。 |
| Usage and dialects | 敬語や俗語、文体、方言など、JMdictがつけた用法のラベルごとに日本語の単語をまとめています。 |
| Subjects | 医学・法律・スポーツなど、JMdictが示す使われる分野ごとに日本語の用語をまとめています。 |

The subjects are listed in 五十音順 of their Japanese names, as the English page lists them
alphabetically.

## Frequency lists, `/ja/dictionary/browse/frequency-dictionaries/`

| Role | Keyword | Volume | Why |
| --- | --- | --- | --- |
| Primary | 日本語 頻出語 | Not measured | The agreed term for the lists |
| Secondary | 日本語 単語 頻度 ランキング, アニメ 頻出 単語 | Not measured | What each list ranks |

| Field | Text |
| --- | --- |
| Title and H1 | 日本語の頻出語リスト |
| Meta description | JLPT単語リストと、YouTube・Wikipedia・テレビ・アニメ・マンガ・小説・ビジュアルノベル・ゲームでよく使われる順に並べた日本語の単語ランキングです。 |

## A frequency band, `/ja/dictionary/browse/frequency-dictionaries/{list}/{first}-{last}/`

One page per thousand ranks of each list. {name} is the list's name as the word page's chips
write it (YouTube, テレビ・映画, アニメ, マンガ, 小説, ビジュアルノベル, ゲーム, Wikipedia), and {range}
is 1〜1,000位.

| Role | Keyword | Volume | Why |
| --- | --- | --- | --- |
| Primary | {name} よく使う 日本語 | Not measured | アニメでよく使う日本語, the learner's search |
| Secondary | {name} 頻出単語 ランキング | Not measured | The ranking itself |

| Field | Text |
| --- | --- |
| Title | {name}でよく使われる日本語ランキング（{range}） |
| H1 | {name}でよく使われる日本語ランキング |
| Meta description | {list's sentence}{range}を表示しています。 |

Each list's sentence says what it counts, such as Jitenの頻度リストをもとに、アニメに出てくる頻度の高い
順に単語を並べています。 The band links read 〜1000, 〜2000 … 〜1万 in Japanese, short enough for
the phone's five columns.

## JLPT vocabulary, `/ja/dictionary/browse/frequency-dictionaries/jlpt/n{level}/`

| Role | Keyword | Volume | Why |
| --- | --- | --- | --- |
| Primary | JLPT N{level} 単語 一覧 | Not measured | How learners search a level's words |
| Secondary | 日本語能力試験 N{level} 単語, N{level} 語彙 リスト | Not measured | The exam's Japanese name, and 語彙 |

| Field | Text |
| --- | --- |
| Title and H1 | JLPT N{level}の単語一覧 |
| Title, later pages | JLPT N{level}の単語一覧（{page}ページ目） |
| Meta description | Jonathan WallerがJLPT N{level}とした単語{count}語を、五十音順に並べています。Jonathan Wallerによる非公式のJLPT単語リストです。JLPTは2010年以降、公式の単語リストを公表していないため、レベルは学習の目安です。 |

The description says the lists are unofficial, as the English one does, since a searcher may
expect the exam's own list.

## Kanji lists, `/ja/dictionary/browse/kanji/`

| Role | Keyword | Volume | Why |
| --- | --- | --- | --- |
| Primary | 常用漢字 一覧 | Not measured | Most of the page is the jōyō kanji |
| Secondary | 学年別 漢字 一覧, 人名用漢字 一覧, 画数 漢字 | Not measured | Its sections |

| Field | Text |
| --- | --- |
| Title | 常用漢字・人名用漢字一覧：学年別・JLPTレベル別・画数別 |
| H1 | 漢字一覧 |
| Meta description | 常用漢字を学年別・画数別に、名前に使える人名用漢字と、JLPTレベル別の漢字もまとめた一覧です。どの漢字も読み方・書き順・使われる言葉がわかります。 |

## A kanji list, `/ja/dictionary/browse/kanji/{list}/`

The title and H1 are the same; the meta description is the page's intro. Lists with fewer than
ten kanji are not indexed, in Japanese as in English.

| List | Primary keyword | Title and H1 |
| --- | --- | --- |
| A school year, `grade-{n}` | 小学{n}年生で習う漢字 一覧 | 小学{n}年生で習う漢字一覧 |
| Secondary school, `secondary-school` | 中学 漢字 一覧 | 中学校以降に習う常用漢字一覧 |
| Names, `jinmeiyo` | 人名用漢字 一覧 | 人名用漢字一覧 |
| A stroke count, `strokes-{n}` | {n}画 漢字 一覧 | {n}画の常用漢字一覧 |
| A JLPT level, `jlpt-n{level}` | JLPT N{level} 漢字 一覧 | JLPT N{level}の漢字一覧 |

| List | Meta description |
| --- | --- |
| A school year | 小学{n}年生で習う漢字{count}字を、よく使われる順に並べています。漢字を押すと、読み方・書き順・その漢字を使うすべての言葉がわかる検索ページを開きます。 |
| A JLPT level | Jonathan WallerがJLPT N{level}とした漢字{count}字を、よく使われる順に並べています。JLPTは2010年以降、漢字のリストを公表していないため、これらのレベルは目安です。{the same last sentence} |

The other lists follow the school year's sentence. The chips and tabs name the lists as the kanji
page's grade chip does (小学4年, 中学校以降, 人名用漢字, 3画).

## The HTML sitemap, `/ja/sitemap/`

Its title, H1, and description are in [`company-and-legal.md`](company-and-legal.md). Its
dictionary half lists the browse pages by the names above.

## For the native review

- 一覧から探す as the browse pages' breadcrumb and 日本語の単語を一覧から探す as their home's title.
- The category names that aren't word-page labels: 改まった言葉・文語 (formal), おどけた言葉
  (jocular), くだけた言葉 (familiar), 古風な言葉 (dated), マンガ・アニメのスラング, 関東の方言,
  長野の方言, ブラジル日系人の日本語, and the subjects' names, such as 音響・映像 and 株式.
- The labels that come from the word page and read oddly as a list's name: 表現 (expressions),
  名詞（の） (no-adjectives), 古い用法 (obsolete), 通常はかな書き (usually written in kana). The
  word page's translation and this page's change together.
- 中学校以降 for the secondary-school list, from the word page's grade chip, where 中学校 is shorter.
- The frequency tiers (とてもよく使われる, よく使われる, ときどき使われる, あまり使われない), which
  follow the word page's chips, and the band labels 〜1000 … 〜1万.
- Whether the category intros' examples should keep their English glosses, which the Japanese
  intros drop.
