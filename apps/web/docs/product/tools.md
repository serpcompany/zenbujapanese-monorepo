# Tools pages

The tools index, `/tools/`, and six converters, each at `/tools/<name>/`: Hiragana to Katakana,
Katakana to Hiragana, Romaji to Kana, Kana to Romaji, Half-width to Full-width, and Full-width to
Half-width. They follow the owner's decisions on #579 (2026-10-09), the prototype linked there,
and the owner's later changes: both boxes of a converter are editable, in place of the swap
button, and the pages are built from stock shadcn components, as the owner's UI rules ask (#696). The copy is a first draft that #690 dials in.
Kanji to Furigana, which needs the dictionary service, is #691, and stays a placeholder until
then.

The converters run entirely in the browser: nothing typed is sent anywhere.

Abbreviations: Web paths are under `apps/web/`. **Tools spec** is `e2e/tools.spec.ts`, the browser
tests of these pages at a desktop and a phone width. **Page test** is
`src/components/tools/converter-page.test.tsx`, which renders each converter page to HTML, and
**Converter test** is `src/components/tools/converter.interaction.test.tsx`. The converters' logic
is in `src/lib/tools/`, each with its unit tests beside it. The copy is mostly in
`src/lib/tools/converters.ts` (names, leads, descriptions, cards, samples, and Try examples) and
`src/lib/tools/content.ts` (How it works, questions, typing tips, spelling rules, and the width
table); the rest is in the components that show it: the index's headings and app card
(`src/app/tools/page.tsx`), the privacy line and the app card under each converter
(`src/components/tools/converter-page.tsx`), the option labels
(`src/components/tools/converter-settings.tsx`), the converter's title and the boxes' placeholders
and Copy statuses (`src/components/tools/converter.tsx` and `converter-box.tsx`), and the tables'
headings (`src/components/tools/tool-reference.tsx`).

## Tools index

**Layout.** The heading Online tools for learning Japanese and a line about them; then Converters, six cards
(one per converter, each with its mark, name, a line, and a sample it converts, such as こーひー →
コーヒー); then Dictionary and reference, six cards that open existing pages (Dictionary, Hiragana
chart, Katakana chart, Kanji lists, Frequency lists, and Word categories, which is the browse
home); then a card for the app, its title and line beside Get the app (under them on phones), which
opens the iPhone app's page. The cards are stock `Card` parts (`CardHeader`, `CardTitle`, `CardDescription`,
`CardContent`) with the products catalog's mark tile and its hover, and no two share a mark. They
are one column on phones, two from 768 pixels, and three from 1024, as the product page's are. The
page is laid out as the browse pages are (`BrowsePage` and `BrowseHeading`), with their section
headings.

- Source: the owner's decision on #579 (Index: cards).
- Check: Tools spec, "lists the six converters, then the dictionary and reference pages, then the
  app" and "each card leads to its page, with no redirect"; `src/lib/tools/converters.test.ts`, "…
  turns its card’s sample … into …" for each converter.

## Converter pages

**Layout.** In this order: a breadcrumb (Tools, then the converter); the converter's name and a
line about it; the converter, with a link under it to the other direction's page (Katakana to Hiragana → on Hiragana to Katakana); How it works; on the
romaji pages Typing tips or Spelling rules, and on the width pages What changes; the conversion
table; Questions; Related tools, three other converters as the index's cards, with All tools → as
the product page's More from Zenbu has All products, leaving out the other direction, which is
already linked; and a card for the app, its title and line beside Dictionary and Get the app (under
them on phones). The
converter pages show no kana chart of their own: the conversion table links the full kana charts.

- Source: the owner's decision on #579 (Converter page: stacked), and the owner's change that
  replaced the swap button with a link to the other direction.
- Check: Tools spec, "each page links the other direction under its converter" and "related tools
  lead to their pages, and All tools to the index"; Page test, "the page links its other direction
  once, related tools to theirs, and all the tools"; `src/lib/tools/converters.test.ts`, "each one relates three others, leaving out itself
  and its other direction, which it links on its own".

**The converter.** A stock card: its header says Type in either box, and that the other box converts
as you type, with Romaji to Kana's Write in at its end (`CardAction`). Its content starts, on the
width pages, with the row of width options, and then has two boxes, both editable, each a stock
`Label` and `Textarea` of the same size: the top one in the page's "from" script (romaji on Romaji to
Kana, kana on Kana to Romaji) and the bottom one in its "to" script. Each has its character count,
the only muted text, and its own Copy, which copies that box and says Copied (or, where the browser
won't copy, to select the text). The top box also has Clear, which empties both boxes and puts the
cursor in the top one. The card's footer is Try, whose examples fill the top box. Every button is
the stock default size.

- Source: the owner's decision on #579; the owner's change to two editable boxes.
- Check: Tools spec, "converts as you type, counts the characters, and Clear empties both boxes",
  "a Try example fills the top box", and "each box’s Copy copies its text and says so"; Converter
  test, "starts with its sample, and converts what is typed in the top box into the bottom one",
  "Clear empties both boxes", "a Try example fills the top box", "each box’s Copy puts its own text
  on the clipboard and says so", and "says how to copy by hand when the browser won’t".

**Two ways.** Typing in the top box converts into the bottom one as you type, and typing in the
bottom box converts into the top one, through the other direction's converter. Only the other box
changes: the box being typed in keeps exactly what was typed. The page starts with a sample in the
top box.

- Source: the owner's change to two editable boxes.
- Check: Tools spec, "typing in the bottom box fills the top one, and the bottom keeps exactly what
  was typed"; Converter test, "converts what is typed in the bottom box into the top one, keeping
  the bottom as typed"; `src/lib/tools/converters.test.ts`, "typing in either box fills the other,
  and keeps what was typed as it is".

**Options.** Romaji to Kana writes hiragana or katakana (a stock toggle group labelled Write in),
which sets the kana box's script when romaji is typed; typed kana of either script turn into romaji.
The width converters choose what changes, under the label Change, in one row that wraps on phones,
with a stock checkbox and label for each: Katakana, Letters and numbers, and Symbols and spaces, all on at
first; a kind left off stays as it is, both ways. The others have
none, and Kana to Romaji writes hiragana when romaji is typed in its bottom box. There is no
long-vowel option yet.

- Source: the owner's decision on #579 (Options; no long-vowel option yet); the owner's change
  (the options work both ways).
- Check: Tools spec, "romaji to kana writes hiragana, or katakana when it is chosen" and "the width
  options choose what changes, both ways"; Converter test, "romaji to kana writes katakana once
  Katakana is chosen" and "a width option left off keeps that kind of character as it is, both
  ways"; `src/lib/tools/converters.test.ts`, "the options apply in both directions";
  `src/lib/tools/width.test.ts`, "with … off, that kind stays as it is", both ways.

**What is converted.** Text is read in its composed form first (Unicode NFC), so a kana and a
separate combining sound mark, as in some macOS file names and PDFs, read as the one kana, and a
combining macron as ō.

- Check: `src/lib/tools/converters.test.ts`, "reads text in its composed form, as typed or pasted
  from anywhere".

**Hiragana and katakana.** Each kana becomes its partner in the other script, small kana and the
iteration marks ゝゞ and ヽヾ included; ゔ becomes ヴ, and ヷ to ヺ, which have no hiragana, stay.
The long mark ー, kanji, letters, and punctuation stay as they are.

- Check: `src/lib/tools/kana.test.ts`.

**Romaji to kana.** Hepburn, with the other common spellings: si, ti, tu, hu, zi, sya, tya, jya,
and the like; x or l before a small kana (xa, la, xtu, ltsu, xya); n for ん before a consonant or
at the end, where nn works too, and n' (or n’) before a vowel or y, since n before a vowel starts
the な row (kinen is きねん, kin'en きんえん); a doubled consonant, or t before ch, for っ; m before
b, m, or p for ん (shimbun, sammai); a hyphen for ー; the loanword spellings tsa, tsi, tse, tso, dyu
(でゅ), fyu, kwa, gwa, twu, dwu, and who; and . , [ ] ? ! ~ for 。、「」？！〜. A vowel with a macron is
spelled long (ō is おう, or オー in katakana). Capitals read as lowercase, and anything it can't
read stays as it was, so a consonant waits for its vowel.

- Source: the owner's decision on #579 (Romanization).
- Check: `src/lib/tools/romaji-to-kana.test.ts`, among them konnichiwa → こんにちわ, kin'en →
  きんえん, kinen → きねん, kitte → きって, matcha → まっちゃ, ko-hi- → コーヒー in katakana,
  shinbun and shimbun → しんぶん, sammai → さんまい, onna → おんな, mootsaruto → もおつぁると, and a
  trailing n → ん.

**Kana to romaji.** Hepburn: し shi, つ tsu, ふ fu, じ and ぢ ji, づ zu, を o; っ doubles the next
consonant (tch before ch), and one with no consonant after it (あっ, or っ at the end) is xtsu, so
the romaji turns back into the same kana; ん before a vowel or y is n'. Long vowels are spelled as
written, and ー repeats the vowel before it. The loanword combinations are spelled as loanwords
are: ツァ tsa, デュ dyu, フュ fyu, クァ kwa. Katakana works the same way; kanji, letters, numbers,
and any kana it has no spelling for stay as they were typed, and Japanese punctuation becomes its
Latin form.

- Source: the owner's decision on #579 (Romanization; long vowels as written).
- Check: `src/lib/tools/kana-to-romaji.test.ts`, among them きって → kitte, まっちゃ → matcha,
  きんえん → kin'en, しんよう → shin'you, コーヒー → koohii, とうきょう → toukyou, モーツァルト →
  mootsaruto, "a small っ with no consonant after it is spelled xtsu, so it converts back", and
  "keeps a kana it has no spelling for in the script it was typed in".

**Half-width and full-width.** Half-width katakana become full-width, a kana and its separate
voiced or semi-voiced mark joining into one (ｶﾞ → ガ); letters and numbers, ASCII symbols, the
half-width ｡｢｣､･, and the space widen; and back again the other way, a voiced kana splitting into
two. Hiragana and kanji have no half-width form, and kana without one (ヮ, ヵ, ヶ) stay.

- Check: `src/lib/tools/width.test.ts`, with ｶﾞｯｺｳ ﾊﾟﾝ ABC ↔ ガッコウ　パン　ＡＢＣ with every option
  on and each one off on its own.

**How it works.** Two short paragraphs about the conversion, with examples.

- Check: No automated check yet; the copy is #690's.

**Reference.** Romaji to Kana adds Typing tips and Kana to Romaji Spelling rules, each a stock
table (For, How to type it or How it’s spelled, and Examples), with each spelling to type shown as a
stock `Kbd`. The width pages instead show What changes, a stock table of each kind of character in
both widths, the space among them (A B and A　B). Every example in these, and every other spelling
the conversion table lists, is what the converters do.

- Source: the owner's decision on #579 (the reference).
- Check: Page test, "the romaji pages add their typing tips or spelling rules, and the width pages
  their table"; `src/lib/tools/content.test.ts`, "every typing
  tip types what it says", "every spelling rule spells what it says", and "every row of the width
  table converts both ways with its option alone"; `src/lib/tools/reference.test.ts`, "every other
  spelling it lists types its kana".

**Conversion table.** Every one of the 131 kana is in the HTML, one group at a time in stock tabs
with short names, Basic, Marks, Combos, Small, and Katakana, so the tabs fit a phone; each panel names
its group in full with its count: Basic (46), With marks (25), Combinations (33), Small kana (10),
and Katakana only (17, Extended katakana on the width pages). The tabs' panels stay in the page while
hidden. Basic and With marks are charts in a stock table, a row for each consonant (a, ka, sa, and
on, as the dictionary core's `gojuonRows` and `dakuonRows` lay them out) by the columns a, i, u, e,
and o, with empty cells where there is no kana (yi, ye, wu); Combinations is a row for each kana by
ya, yu, and yo. Each cell holds the page's pair, in its direction (か カ on Hiragana to Katakana, ｶ
カ on Half-width to Full-width), over its romaji. Small kana and Katakana only are lists, a row for
each kana. Each table is at its default density and sized to its content. On Romaji to Kana, the
romaji are spellings that type the kana on that page (wo for を, di for ぢ, xa for ぁ, xtsu for っ,
who for うぉ), with the other spellings that type it after; on Kana to Romaji, the Hepburn spelling
and the other spellings; elsewhere the Hepburn spelling, and っ's is "doubled consonant", whose cell
wraps. The section links the full kana charts (`/dictionary/browse/kana/`).

- Source: the owner's decision on #579 (the conversion table); the owner's UI rules and their
  reviews (stock table at its default density, one group at a time in tabs with short names, and
  chart-shaped tables).
- Check: `src/lib/tools/table.test.ts`, "has every one of the 131 kana, in five groups with short
  tab names", "lays Basic and Marks out as a chart by vowel, with gaps, and Combos by ya, yu, and
  yo", "each page’s pair runs in its direction", and "every spelling on Romaji to Kana types the
  kana it sits beside"; `src/lib/tools/reference.test.ts`, "every kana has a
  spelling that types it, and its other typed spellings type it too"; Page test, "… holds every row
  of its conversion table, a tab per group, the ones not shown hidden"; Tools spec, "the conversion
  table shows one group at a time in tabs, every kana in the page".

**Questions.** Three questions per pair of converters, in the stock accordion the product page uses
(`src/components/question-list.tsx`, all closed at first), every answer in the HTML while closed,
and the same questions as FAQ structured data (`FAQPage` JSON-LD).

- Source: the owner's decision on #579 (Questions stay, with FAQ structured data).
- Check: Page test, "the questions are in the page with their answers, and as FAQ structured data";
  Tools spec, "a question opens to its answer" and "… has its title, description, canonical URL, and
  structured data"; `src/lib/questions.test.ts`.

## Site-wide

**Titles, descriptions, canonical URLs, and indexing.** The index is "Online tools for learning
Japanese | Zenbu Japanese" and each converter "<Name> Converter | Zenbu Japanese", each with its own
description and canonical URL, from `src/lib/tools/converters.ts`. All are indexed: no page carries
a robots meta tag. `/sitemap-tools.xml`, which the sitemap index lists, holds them, as does the
HTML sitemap (`/sitemap/`), under the tools index. A converter name the site doesn't have is 404,
and not indexed.

- Source: the owner's decision on #579 (all pages indexed and in the sitemap); the SERP XML
  sitemaps standard (`sitemap-tools.xml` for tool pages).
- Check: Tools spec, "… has its title, description, canonical URL, and structured data" for each
  page, "a converter name the site doesn’t have is 404", and "the HTML sitemap lists the tools
  index and every converter"; `e2e/sitemaps.spec.ts`, "the tools sitemap lists the tools index and
  every converter, each with its slash"; `src/lib/sitemap.test.ts`; `src/app/routes.test.ts`.

**Links to the tools.** The header's Tools menu (All free tools, and its Hiragana to Katakana and
Romaji to Kana), the Products menu's Free tools, the footer's All tools, the homepage's All free
tools and its free web tools list, and the products catalog's Converters card open these pages,
through the `tools`, `hiragana-to-katakana`, and `romaji-to-kana` entries in `linkTargets`
(`src/lib/site.ts`). Kanji to Furigana stays a placeholder (#691). Pages under `/tools/` are in
the header's Tools section.

- Source: the owner's decision on #579.
- Check: `src/components/site-header.test.tsx`, "the Tools menu leads to the tools, the reference
  pages, and the converters, and Kanji to Furigana is a placeholder" and "/tools/ is in Tools";
  `src/components/site-footer.test.tsx`; `src/lib/products/catalog.test.ts`; `e2e/site.spec.ts`,
  "the Tools menu opens the tools and two converters, Kanji to Furigana and the Products menu’s
  planned pages are # placeholders, and All products opens the catalog".

**Layout.** No tools page scrolls sideways at a desktop or a phone width, and each passes the phone
checks and the contrast check.

- Check: `e2e/layout.spec.ts`, for each tools page; `e2e/phone-layout.spec.ts` and
  `e2e/contrast.spec.ts`, which list the tools pages among the page types in `e2e/page-types.ts`;
  `e2e/placeholders.spec.ts`, on the index and Hiragana to Katakana.
