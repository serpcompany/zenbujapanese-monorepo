# Kanji to Furigana

`/tools/kanji-to-furigana/`, and `/ja/tools/kanji-to-furigana/` in Japanese, is the tools section's
seventh converter (#849): the learner pastes or types Japanese and gets it back with furigana over
its kanji, read by the dictionary service the way the app reads captions and example sentences. Its
title, description, canonical URL, indexing, sitemap entries, and links are the other converters'
([Tools pages](tools.md), Site-wide). How it's built is in
[`web-tools.md`](../../../../docs/agents/web-tools.md), Kanji to Furigana.

Abbreviations: Web paths are under `apps/web/`. **Furigana spec** is `e2e/furigana.spec.ts`, the
browser tests of this page at a desktop and a phone width. **Page test** is
`src/components/tools/furigana-page.test.tsx`, which renders the page to HTML, and **Converter
test** is `src/components/tools/furigana-converter.interaction.test.tsx`. **Route test** is
`src/lib/dictionary/furigana.test.ts`, and **Tool test** `src/lib/tools/furigana-tool.test.ts`.

## The page

**Layout.** As the other converters' pages are laid out: a breadcrumb (Tools, then Kanji to
Furigana); the name and a line; the converter; How it works, which says the text goes to Zenbu's
dictionary service; Questions, three of them, with their FAQ structured data; Related tools (Kana
to Romaji, Hiragana to Katakana, and Romaji to Kana) with All tools →; and the card for the app. It
has no other direction, reference table, or conversion chart. On `/tools/` it's the Converters
section's seventh card, whose sample shows 今日 with its furigana, きょう.

- Source: #849 (the same layout as the other converters, #579).
- Check: Page test, "has How it works, its three questions with their FAQ data, related tools,
  and no kana chart"; Tool test, "its sample and its card’s sample show the furigana the
  dictionary gives them"; Tools spec (`e2e/tools.spec.ts`), "lists the six converters and Kanji to
  Furigana, then the dictionary and reference pages, then the app" and "each card leads to its
  page, with no redirect".

**The converter.** A stock card: its header says Paste or type Japanese, and that the furigana
appear as you type. Its content is two parts, each a stock `Label` over its box: Japanese, a stock
`Textarea` with its count against the limit (27 of 200 characters) and Clear, which empties both
parts and puts the cursor in the box; and With furigana, the text with each reading over its kanji
as ruby, in the site's `furigana` utility, and its own Copy. The footer is Try, whose examples
(大人, 明日, 日本語を勉強しています。, お茶を飲みませんか？) fill the box. The page starts with a sample,
今日は大人一人と子供二人で、日本の映画を見に行きます。, and its furigana, in the page's HTML.

- Source: #849; the other converters' card (#579, #696).
- Check: Page test, "holds the sample with its furigana, so it reads before any script runs";
  Converter test, "starts with its sample and the sample’s furigana, without asking for them" and
  "a Try example fills the box and reads it, and Clear empties both"; Furigana spec, "a Try example
  fills the box and reads it, and Clear empties both".

**Readings come from the app's segmentation.** Once typing pauses for 300 ms, the page asks the
site for the text's furigana, and the site asks the dictionary service, which splits the text into
words as the app does and gives each its reading in hiragana. Each reading goes over its word's
kanji only, the kana after them bare: 今日 reads きょう, 大人 おとな, 日本 にほん, and 一人 ひとり,
never kanji by kanji, and in 食べます the furigana cover 食. A number and its counter read as the
one word the dictionary has for them, as the app reads them
([`dictionary-core.md`](../../../../docs/agents/dictionary-core.md), Examples): 一人 ひとり,
二人 ふたり, 十日 とおか, 二十日 はつか. Kana, letters, numbers, punctuation, spaces, and line breaks
stay as they are, and a word the dictionary can't read keeps its kanji without furigana. The text
is read in its composed form (Unicode NFC), and a text read once shows again at once.

- Source: #849, which asks for the service's segmentation, so a reading is never a guess per
  kanji; the dictionary service's segmentation
  ([`dictionary-api.md`](../../../../docs/agents/dictionary-api.md), Routes and Apps).
- Check: Furigana spec, "shows its sample with furigana, and reads what is typed by whole words, in
  context"; Converter test, "reads what is typed once typing pauses, and shows its furigana" and
  "shows a text it has read before at once, without asking again"; Route
  test, "answers the service’s segmentation as furigana over each word’s kanji, kept an hour and
  unindexed" and "asks for the text in its composed form"; Tool test, "reads words in context:
  今日 きょう, 大人 おとな, 一人 ひとり, 二人 ふたり, 日本 にほん, never kanji by kanji"; Page test,
  "holds the sample with its furigana, so it reads before any script runs" (一人 ひとり and 二人
  ふたり among them); the core's `packages/dictionary-core/src/cards/segmentation.test.ts` and
  `packages/dictionary-core/src/examples/linking.test.ts`, "a number and its counter"; the
  service's `apps/dictionary-api/src/conformance/app-routes.test.ts`, "the website’s segmentation,
  with the service token, answers the app route’s tokens, so 今日 reads きょう and 一人 ひとり", on
  the app's data.

**A stated limit.** A text is at most 200 characters, the dictionary service's limit, which the
count, the description, and a question state. Past it, the box is marked invalid, the result
empties, and the page says "That’s more than 200 characters. Shorten it to add furigana." without
asking for readings.

- Source: #849 (a stated limit, and going over it says so).
- Check: Furigana spec, "says when a text is over 200 characters, and marks the box"; Converter
  test, "says a text over the limit is too long, marks the box, and asks nothing"; Route test,
  "refuses … without asking the service"; Tool test, "in %s, it states the dictionary service’s
  limit".

**When the dictionary can't answer.** The page says "The dictionary didn’t answer, so there’s no
furigana yet. Your text is still here.", keeps the text, and offers Try again, which asks once
more.

- Source: #849 (the page says so and keeps the learner's text).
- Check: Furigana spec, "says so, keeps the text, and Try again reads it"; Converter test, "says
  when the dictionary doesn’t answer, keeps the text, and Try again reads it"; Route test, "answers
  502 when the service fails, and logs it without the text".

**Copy.** Copy puts the result on the clipboard twice: as ruby, which apps that show ruby draw over
the kanji, with each reading in brackets for those that don't (`<rp>`), and as plain text with each
reading in full-width brackets after its word, 今日（きょう）. Where the browser copies only text,
it copies the plain text. It says Copied.

- Source: #849 (a copy action).
- Check: Furigana spec, "Copy puts the furigana on the clipboard as ruby, and as plain text with
  each reading in brackets"; Converter test, "Copy puts the furigana on the clipboard as ruby, and
  as plain text with the readings in brackets" and "copies plain text where the browser can’t copy
  ruby"; Tool test, "copies as ruby, escaped, with a line break kept, and as plain text with each
  reading in brackets".

**The readings route.** `/tools/furigana.json?text=` answers the furigana as JSON, kept an hour,
`noindex`, and only in English, since a file has no language: `/ja/tools/furigana.json` is 404. A
blank text, or one past the limit, is 400; a failure of the dictionary service is 502, logged as
`furigana_unavailable` with the error's name and the text's length, never the text.

- Check: Furigana spec, "answers a text’s furigana as JSON, unindexed, in English only, and
  refuses a text past 200 characters"; Route test.

**In Japanese.** `/ja/tools/kanji-to-furigana/` reads in Japanese, from the box, its count
(27／200文字), the result, and the messages to How it works, the questions, and their FAQ data,
and every link it writes stays under `/ja/`.

- Source: the owner's decision on #847 (every page in Japanese).
- Check: Furigana spec, "in Japanese, its box, count, and result read in Japanese"; Converter test,
  "on a Japanese page, its box, count, and messages are in Japanese"; Page test, "a Japanese page
  is in Japanese, with its links under /ja/".

**Without a service.** Local development and the browser tests read the fixtures' segmentation of
the sample and the Try examples (`packages/dictionary-core/src/fixtures/segmentation.json`, which
the service exports from the app's data); any other text says the dictionary didn't answer.

- Check: Route test, "reads the fixtures without a service, and has nothing for a text they don’t
  hold"; Tool test, "every Try example is a text the fixtures read, so it converts without a
  service".
