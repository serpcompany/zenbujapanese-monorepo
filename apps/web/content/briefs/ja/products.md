# Keyword brief: the products catalog and the iPhone app's page

Two pages: the catalog, `/ja/products/`, and the iPhone app's page,
`/ja/products/zenbu-japanese-app/`. Both are written for a Japanese reader. The app is a
Japanese-English dictionary (和英辞典) that works offline, with a camera reader, handwriting, and a
conversation translator. Its own screens are in English, so the app's page says so in its lead
and the catalog's app card says so in its description. The kana, kanji, and frequency lists in
the catalog also serve people learning Japanese who read Japanese.

Volumes are not measured: no keyword database was used (see [`README.md`](README.md)).

## The catalog, `/ja/products/`

The catalog is a hub. It leads to the app's page and to the free tools, so it targets the free
tools as a group and leaves the app's keywords to the app's page and the homepage.

### Keywords

| Role | Keyword | Volume | Why |
| --- | --- | --- | --- |
| Primary | 日本語 無料ツール | Not measured | The catalog's free tools, named the way a searcher looks for a set of them |
| Secondary | 和英辞典 無料 | Not measured | The web dictionary is the first free tool |
| Secondary | 五十音表 | Not measured | The kana charts, by the term list's name |
| Secondary | 漢字リスト 学年別 | Not measured | The kanji lists, by school grade |
| Secondary | 頻出語リスト | Not measured | The frequency lists, by the term list's name |
| Secondary | 和英辞典 アプリ iPhone | Not measured | The app's card; the app's page and the homepage carry this keyword |

### Fields

| Field | Text |
| --- | --- |
| Title | 製品一覧 (the site's template adds ` \| Zenbu Japanese`) |
| H1 | 製品一覧 |
| Lead | 日本語を読む・書く・話すためのアプリと無料ツール。どれもひとつの辞書から生まれました。 |
| Meta description | Zenbu JapaneseのiPhone向け和英辞典アプリと、ブラウザで使える無料の日本語ツール。和英辞典、五十音表、漢字リスト、頻出語リストを、ひとつの辞書から。 |

The title and H1 are the page's name, as the English page's are (Products), because the header
menu, the footer, the sitemap page, and the app page's breadcrumb all link to it by that name.
The meta description carries the primary keyword's parts (無料, 日本語, ツール) and names each
free tool with the term list's words.

### Sections

- **Filters.** すべて, アプリ, 拡張機能, 無料ツール, 学習ガイド, 講座, the same names as the header's
  Products menu. Each filter's heading and line are written for a Japanese reader.
- **Search.** 製品を検索 searches the Japanese titles, descriptions, and type names, so 漢字 or
  翻訳 finds the cards a Japanese reader expects. The English pages search the English text.
- **Cards.** Titles use the term list (五十音表, 漢字リスト, 頻出語リスト); the website's dictionary is
  Zenbu Japanese 和英辞典. Badges read 無料 and 近日公開.

## The iPhone app's page, `/ja/products/zenbu-japanese-app/`

The homepage already targets 和英辞典 アプリ for a reader who doesn't know the app. This page is
where a reader who has heard of Zenbu Japanese, or who searches for one of the app's features,
decides to get it, so it targets the brand with iPhone and the feature words.

### Keywords

| Role | Keyword | Volume | Why |
| --- | --- | --- | --- |
| Primary | Zenbu Japanese アプリ | Not measured | A reader who has heard of the app looks it up by name |
| Secondary | 和英辞典 アプリ iPhone | Not measured | What the app is, with the platform |
| Secondary | オフライン 辞書アプリ | Not measured | The dictionary always works offline |
| Secondary | 会話 翻訳アプリ オフライン | Not measured | Translate: two people, one iPhone, after a one-time download |
| Secondary | 写真 日本語 読み取り | Not measured | Image Search reads Japanese from a photo |
| Secondary | 漢字 手書き 辞書 | Not measured | Handwriting finds a kanji the reader can't type |

### Fields

| Field | Text |
| --- | --- |
| Title | iPhone版 Zenbu Japanese：オフラインで使える和英辞典・翻訳アプリ |
| H1 | Zenbu Japanese |
| Line under the H1 | iPhone向けの和英辞典・翻訳アプリ |
| Meta description | オフラインで使えるiPhone向けの和英辞典アプリ。写真の日本語を読み取る画像検索、漢字の手書き入力、日本語と英語の会話のリアルタイム翻訳、字幕と連動するYouTube再生に対応。 |

The title leads with the app's Japanese name, as the menus write it, and carries 和英辞典,
オフライン, and 翻訳アプリ, as the English title carries Japanese Dictionary & Translator. The H1 is
the app's name, as on the English page, and the line under it carries what the app is. The meta
description names each feature with the searchers' words (写真, 漢字, 手書き, 会話, 翻訳).

### Sections

- **Hero.** The lead says what the app does in four clauses and ends with アプリの画面は英語表示です,
  since the screenshots below are English. アプリを入手 and デモを見る are the buttons.
- **Feature demo.** 検索, 画像検索, 手書き入力, 活用, 翻訳, the term list's names for the app's parts.
- **Screenshots.** アプリの画面, with a caption under each screenshot.
- **What's inside.** 主な機能。タブは4つ、辞書はひとつ。 and eight points.
- **Questions.** よくある質問: offline use, the frequency lists, and the web dictionary.
- **More from Zenbu.** Zenbuのほかの製品, linking to the Japanese catalog.
- **Facts.** 対応機種, 動作環境 (iOS {version}以降), バージョン, from Apple's lookup.

## For the native review

- Whether the app's page and the homepage split their keywords well, or whether this page should
  take 和英辞典 アプリ and the homepage the brand.
- Whether the catalog's title should carry a keyword (for example アプリと無料ツール一覧) rather than
  the page's name.
- The website's dictionary is Zenbu Japanese 和英辞典 on its card, but the header's Products menu
  writes Zenbu Japanese 辞書. Choose one for both.
- 学習ガイド for Reference guides, 講座 for Courses, and 近日公開 for Coming soon.
- The carousels announce each slide as 7件中1件目, with カルーセル and スライド as the role names.
  Check that a screen reader reads them naturally.
