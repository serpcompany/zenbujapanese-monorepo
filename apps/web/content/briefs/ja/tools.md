# Keyword brief: the tools index and the converters

The Japanese versions of `/ja/tools/` and its six converters, `/ja/tools/{converter}/`. Unlike the
dictionary, these pages have real demand from Japanese speakers who aren't learning anything: a
form that rejects 半角 characters, a フリガナ field that wants katakana, a name to write in
romaji, a computer with no Japanese input. Each Japanese page is written for that searcher, not as
a page about learning Japanese, and says plainly what the converter does and doesn't do. Every
string is in the `tools` namespace. The brand comes from the site's title template
(`… | Zenbu Japanese`).

The terms are the agreed ones in [`../../terms/ja.md`](../../terms/ja.md): 和英辞典 for the
dictionary (ADR 0007), かな, ひらがな, カタカナ, 五十音表, 頻出語リスト, and 漢字. Hepburn is ヘボン式,
and the other spellings the romaji converter accepts (si, tu, hu) are 訓令式, as Japanese schools
and IMEs name them. Half-width and full-width are 半角 and 全角, and letters and numbers 英数字,
the words Japanese forms and software use.

No volume is measured or estimated (see [`README.md`](README.md)). The keywords follow SERP's
International SEO guide (the market's phrasing, carried by the title, H1, and description) and how
Japanese searchers phrase a converter: the two scripts or widths and 変換, in the order of the
conversion (ひらがな カタカナ 変換, 半角 全角 変換), often with ツール or 無料. The pages that already
answer these searches agree, read with a web search that runs from the US, so not a Japan results
page: LUFTTOOLS names its tools 半角→全角変換 and 全角→半角変換 under テキスト・表記変換ツール; a
Chrome extension is called 全角半角変換ツール; an App Store app is テキスト変換ツール(大/小 全/半
かな/カナ); and a paid romaji service advertises パスポート規格（外務省ヘボン式）, which shows that
searchers for ローマ字 変換 often want a passport spelling. Measure each keyword in a Japan
database, and read the `gl=jp&hl=ja` results, before the native review.

## The tools index, `/ja/tools/`

| Role | Keyword | Volume | Why |
| --- | --- | --- | --- |
| Primary | ひらがな カタカナ ローマ字 変換 | Not measured | The scripts the converters change, as searched together |
| Secondary | 変換ツール 無料, 日本語 変換ツール | Not measured | A set of converters, free |
| Secondary | 半角 全角 変換 | Not measured | The width converters |

| Field | Text |
| --- | --- |
| Title and H1 | ひらがな・カタカナ・ローマ字・半角全角の変換ツール |
| Lead | ひらがな・カタカナ・ローマ字の変換、半角と全角の変換に加えて、五十音表や漢字リスト、和英辞典もそろえました。どれもブラウザで無料で使え、インストールは不要です。 |
| Meta description | ひらがなとカタカナ、ローマ字とかな、半角と全角を相互に変換できる無料ツールと、五十音表や漢字リストをまとめました。ブラウザですぐに使えます。 |

The English title, Online tools for learning Japanese, is written for learners; the Japanese one
names what the converters change, since that is what a Japanese searcher types. The converters'
breadcrumb names it ツール, the header's and footer's name for the section. Its sections are 変換ツール and
和英辞典と資料; the reference cards are 和英辞典, ひらがな表, カタカナ表, 漢字リスト, 頻出語リスト, and
分類別の単語一覧 (the browse home).

## The converters, `/ja/tools/{converter}/`

One template. The H1, card title, and breadcrumb are `{from}を{to}に変換`, and the title is
`{name}する無料ツール`. Each puts the searcher's two words in the conversion's order, followed by
変換, and reads as a sentence: ひらがなをカタカナに変換. The link under each converter to the other
direction reads the same way (カタカナをひらがなに変換). The from and to words are also the two
boxes' labels, so they stay short.

| Converter | From | To | Primary keyword | Secondary keywords |
| --- | --- | --- | --- | --- |
| `hiragana-to-katakana` | ひらがな | カタカナ | ひらがな カタカナ 変換 | ひらがなをカタカナに, フリガナ カタカナ 変換 |
| `katakana-to-hiragana` | カタカナ | ひらがな | カタカナ ひらがな 変換 | カタカナをひらがなに, ふりがな ひらがな 変換 |
| `romaji-to-kana` | ローマ字 | ひらがな・カタカナ | ローマ字 ひらがな 変換 | ローマ字 カタカナ 変換, ローマ字かな変換 |
| `kana-to-romaji` | ひらがな・カタカナ | ローマ字 | ひらがな ローマ字 変換 | カタカナ ローマ字 変換, ヘボン式 ローマ字 変換 |
| `half-width-to-full-width` | 半角 | 全角 | 半角 全角 変換 | 半角カナ 全角 変換, 英数字 全角 変換 |
| `full-width-to-half-width` | 全角 | 半角 | 全角 半角 変換 | 全角カナ 半角 変換, 半角カタカナ 変換 |

The romaji pages write かな out as ひらがな・カタカナ, because ひらがな is the word searchers type
(ローマ字 ひらがな 変換), and the converters write and read both. Volume is not measured for any
keyword in the table.

### Titles and H1s

| Converter | H1 | Title |
| --- | --- | --- |
| `hiragana-to-katakana` | ひらがなをカタカナに変換 | ひらがなをカタカナに変換する無料ツール |
| `katakana-to-hiragana` | カタカナをひらがなに変換 | カタカナをひらがなに変換する無料ツール |
| `romaji-to-kana` | ローマ字をひらがな・カタカナに変換 | ローマ字をひらがな・カタカナに変換する無料ツール |
| `kana-to-romaji` | ひらがな・カタカナをローマ字に変換 | ひらがな・カタカナをローマ字に変換する無料ツール |
| `half-width-to-full-width` | 半角を全角に変換 | 半角を全角に変換する無料ツール |
| `full-width-to-half-width` | 全角を半角に変換 | 全角を半角に変換する無料ツール |

### Meta descriptions

| Converter | Meta description |
| --- | --- |
| `hiragana-to-katakana` | 入力したひらがなを、その場でカタカナに変換します。漢字や英数字、句読点はそのままなので、文章ごと貼り付けても使えます。ブラウザで無料です。 |
| `katakana-to-hiragana` | 入力したカタカナを、その場でひらがなに変換します。漢字や英数字、句読点はそのままなので、文章ごと貼り付けても使えます。ブラウザで無料です。 |
| `romaji-to-kana` | ローマ字で打つと、その場でひらがなやカタカナに変換します。日本語入力のないパソコンでも使え、ヘボン式と訓令式のどちらのつづりにも対応しています。ブラウザで無料です。 |
| `kana-to-romaji` | ひらがなやカタカナを、ヘボン式のローマ字に変換します。長音はかなのとおりにつづるので、とうきょうはtoukyouになります。ブラウザで無料です。 |
| `half-width-to-full-width` | 半角カタカナや半角英数字を、全角に変換します。氏名や住所など、全角での入力が必要なフォームに便利です。ブラウザで無料です。 |
| `full-width-to-half-width` | 全角のカタカナや英数字を、半角に変換します。半角文字しか使えないシステムへの入力に便利です。ブラウザで無料です。 |

Each description says what goes in, what comes out, what stays as it is, and that it is free in
the browser, as the English ones do. Kana to Romaji's says how long vowels are spelled, because a
searcher who wants a passport spelling (TOKYO) would otherwise expect it; the romaji pages' third
question says the same, and so becomes part of the FAQ structured data.

### Sections

- **The converter.** どちらの欄にも入力できます, with 変換先 (ひらがな, カタカナ) on Romaji to Kana and
  変換する文字 (カタカナ, 英数字, 記号・スペース) on the width pages; 入力例 for the Try examples.
- **How it works.** 変換のしくみ. The English second paragraphs explain katakana and hiragana to a
  learner; the Japanese ones say when a Japanese reader converts instead (外来語をまとめてカタカナに,
  フリガナ欄, ふりがな欄). Every example is one the converter produces.
- **Reference.** 入力のコツ on Romaji to Kana and つづりのルール on Kana to Romaji (項目, 入力のしかた or
  つづり方, 例); 変換される文字 on the width pages (文字の種類, 半角, 全角).
- **Conversion chart.** 変換表, in the tabs 基本, 拗音, and 外来語, with the groups 五十音, 濁音・半濁音,
  小さいかな, 拗音, and 外来語の音 (外来語のカタカナ on the width pages). 五十音 and 濁音・半濁音 are the
  kana chart's own names, from the `browse` namespace. The link to the kana charts reads
  よく使う言葉つきの五十音表.
- **Questions.** よくある質問, three per pair, rewritten for a Japanese reader (カタカナに変換するのは
  どんなときですか？ in place of When is katakana used?).
- **Related tools and the app.** ほかの変換ツール and すべてのツール; the app card's button is 和英辞典.

## For the native review

- The template `{from}を{to}に変換` for the H1, and `{name}する無料ツール` for the title, in place of
  the header menu's ひらがな→カタカナ変換 style, which a screen reader reads with the arrow's name.
- ひらがな・カタカナ in place of かな on the romaji pages, which makes those names and box labels
  longer.
- The index's title, which names the converters and leaves out the charts and the dictionary.
- The chart's group names, especially 外来語 and 外来語の音 for the katakana-only sounds (ヴァ, ティ,
  ウィ), and 小さいかな in place of 小書き文字 or 捨て仮名.
- The romaji questions' mention of passports (パスポートのように長音を省いたTOKYOにはなりません), and the
  description's mention of 訓令式.
- Table cells written as short phrases without です・ます (次の子音を重ねる, そのまま残る), and the
  を row's note oと打つと「お」, which replaces the English note "the particle".
