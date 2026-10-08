# Tools pages

The tools index, `/tools/`, and six converters, each at `/tools/<name>/`: Hiragana to Katakana,
Katakana to Hiragana, Romaji to Kana, Kana to Romaji, Half-width to Full-width, and Full-width to
Half-width. They follow the owner's decisions on #579 (2026-10-09) and the prototype linked there,
whose copy is a first draft that #690 dials in. Kanji to Furigana, which needs the dictionary
service, is #691, and stays a placeholder until then.

The converters run entirely in the browser: nothing typed is sent anywhere, and the pages say so
under the converter.

Abbreviations: Web paths are under `apps/web/`. **Tools spec** is `e2e/tools.spec.ts`, the browser
tests of these pages at a desktop and a phone width. **Page test** is
`src/components/tools/converter-page.test.tsx`, which renders each converter page to HTML, and
**Converter test** is `src/components/tools/converter.interaction.test.tsx`. The converters' logic
is in `src/lib/tools/`, each with its unit tests beside it, and the pages' copy in
`src/lib/tools/converters.ts` and `src/lib/tools/content.ts`.

## Tools index

**Layout.** The heading Free Japanese converters and a line about them; then Converters, six cards
(one per converter, each with its mark, name, a line, and a sample it converts, such as こーひー →
コーヒー); then Dictionary and reference, six cards that open existing pages (Dictionary, Hiragana
chart, Katakana chart, Kanji lists, Frequency lists, and Word categories, which is the browse
home); then a card for the app, with Get the app, which opens the iPhone app's page. Cards are one
column on phones, two from 640 pixels, and three from 1024.

- Source: the owner's decision on #579 (Index: cards).
- Check: Tools spec, "lists the six converters, then the dictionary and reference pages, then the
  app" and "each card leads to its page, with no redirect"; `src/lib/tools/converters.test.ts`, "…
  turns its card’s sample … into …" for each converter.

## Converter pages

**Layout.** Stacked, in this order: a breadcrumb (Tools, then the converter); the converter's name
and a line about it; the converter; How it works; the reference; the conversion table; Questions;
Related tools, three other converters, the other direction first; and a card for the app, with
Dictionary and Get the app.

- Source: the owner's decision on #579 (Converter page: stacked).
- Check: Page test, "the swap links to the other direction, and related tools to theirs"; Tools
  spec, "related tools lead to their pages"; `src/lib/tools/converters.test.ts`, "each one relates
  three others, its other direction first".

**The converter.** A bar names the direction (Hiragana ⇄ Katakana) with the swap button between
the two, and the options at its end. Below it, the input, which starts with a sample, its
character count, and Clear, which empties it and puts the cursor in it; then the larger result,
which converts as you type and says "The result shows here." while the input is empty, with Copy,
which copies the result and says Copied (or, where the browser won't copy, to select the text);
then Try, whose examples fill the input.

- Source: the owner's decision on #579; the prototype.
- Check: Tools spec, "converts as you type, counts the characters, and clears", "a Try example
  fills the input", and "Copy copies the result and says so"; Converter test, "starts with its
  sample, and converts what is typed as it is typed", "Clear empties the input and says where the
  result will show", "a Try example becomes the input", "Copy puts the result on the clipboard and
  says so", and "says how to copy by hand when the browser won’t".

**Swap.** The swap button links to the other direction's page. Following it moves there without
loading the page again, keeps the scroll where it was, and carries the result over as the new
input. Each converter keeps what was typed in it while the learner stays under `/tools/`
(`src/app/tools/layout.tsx` holds it), so Back brings the earlier input back; a page loaded afresh
starts with its sample.

- Source: the owner's decision on #579 (one page per direction, each with a swap button, like
  tableconvert.com's).
- Check: Tools spec, "swapping opens the other direction without reloading, keeps the scroll, and
  carries the result over".

**Options.** Romaji to Kana writes hiragana or katakana (Write in). The width converters choose
what changes: Katakana, Letters and numbers, and Symbols and spaces, all on at first; a kind left
off stays as it is. The others have none. There is no long-vowel option yet.

- Source: the owner's decision on #579 (Options; no long-vowel option yet).
- Check: Tools spec, "romaji to kana writes hiragana, or katakana when it is chosen" and "the width
  options choose what changes"; Converter test, "romaji to kana writes katakana once Katakana is
  chosen" and "a width option left off keeps that kind of character as it is";
  `src/lib/tools/width.test.ts`, "with … off, that kind stays as it is", both ways.

**Hiragana and katakana.** Each kana becomes its partner in the other script, small kana and the
iteration marks ゝゞ and ヽヾ included; ゔ becomes ヴ, and ヷ to ヺ, which have no hiragana, stay.
The long mark ー, kanji, letters, and punctuation stay as they are.

- Check: `src/lib/tools/kana.test.ts`.

**Romaji to kana.** Hepburn, with the other common spellings: si, ti, tu, hu, zi, sya, tya, jya,
and the like; x or l before a small kana (xa, la, xtu, ltsu, xya); nn or n' (or n’) for ん before
a vowel or y, and n alone before a consonant or at the end; a doubled consonant, or t before ch,
for っ; m before b or p for ん; a hyphen for ー; and . , [ ] ? ! ~ for 。、「」？！〜. A vowel with a
macron is spelled long (ō is おう, or オー in katakana). Capitals read as lowercase, and anything it
can't read stays as it was, so a consonant waits for its vowel.

- Source: the owner's decision on #579 (Romanization).
- Check: `src/lib/tools/romaji-to-kana.test.ts`, among them konnichiwa → こんにちわ, kin'en →
  きんえん, kitte → きって, matcha → まっちゃ, ko-hi- → コーヒー in katakana, shinbun and shimbun →
  しんぶん, onna → おんな, and a trailing n → ん.

**Kana to romaji.** Hepburn: し shi, つ tsu, ふ fu, じ and ぢ ji, づ zu, を o; っ doubles the next
consonant (tch before ch); ん before a vowel or y is n'. Long vowels are spelled as written, and ー
repeats the vowel before it. Katakana works the same way; kanji, letters, and numbers stay, and
Japanese punctuation becomes its Latin form.

- Source: the owner's decision on #579 (Romanization; long vowels as written).
- Check: `src/lib/tools/kana-to-romaji.test.ts`, among them きって → kitte, まっちゃ → matcha,
  きんえん → kin'en, しんよう → shin'you, コーヒー → koohii, and とうきょう → toukyou.

**Half-width and full-width.** Half-width katakana become full-width, a kana and its separate
voiced or semi-voiced mark joining into one (ｶﾞ → ガ); letters and numbers, ASCII symbols, the
half-width ｡｢｣､･, and the space widen; and back again the other way, a voiced kana splitting into
two. Hiragana and kanji have no half-width form, and kana without one (ヮ, ヵ, ヶ) stay.

- Check: `src/lib/tools/width.test.ts`, with ｶﾞｯｺｳ ﾊﾟﾝ ABC ↔ ガッコウ　パン　ＡＢＣ with every option
  on and each one off on its own.

**How it works.** Two short paragraphs about the conversion, with examples.

- Check: No automated check yet; the copy is #690's.

**Reference.** The kana pages show a kana chart, hiragana with its katakana and romaji, and the
romaji pages one with romaji and its other spellings, each in three tabs, Basic, With marks, and
Combinations, with every tab's chart in the HTML and the ones not chosen hidden; it links to the
full kana charts (`/dictionary/browse/kana/`). Romaji to Kana adds Typing tips and Kana to Romaji
Spelling rules. The width pages instead show What changes: each kind of character in both widths.
Every example in these, and every other spelling the charts list, is what the converters do.

- Source: the owner's decision on #579 (the reference).
- Check: Tools spec, "the kana chart’s tabs show each chart"; Page test, "the kana pages hold all
  three kana charts, the ones not shown hidden" and "the romaji pages add their typing tips or
  spelling rules, and the width pages their table"; `src/lib/tools/content.test.ts`, "every typing
  tip types what it says", "every spelling rule spells what it says", and "every row of the width
  table converts both ways with its option alone"; `src/lib/tools/reference.test.ts`, "every other
  spelling it lists types its kana".

**Conversion table.** Every one of the 131 rows is in the HTML, grouped as Basic (46), With marks
(25), Combinations (33), Small kana (10), and Katakana only (17, Extended katakana on the width
pages), with its columns in the page's direction (Romaji, Hiragana, Katakana, and Also typed as on
Romaji to Kana, for example). A filter shows one group or All; it only hides the others.

- Source: the owner's decision on #579 (the conversion table).
- Check: Page test, "… holds every row of its conversion table, with no group hidden" for each
  converter; `src/lib/tools/table.test.ts`; Tools spec, "the conversion table’s filter shows one
  group, and All brings back the rest".

**Questions.** Three questions per pair of converters that open and close, every answer in the HTML
while closed, and the same questions as FAQ structured data (`FAQPage` JSON-LD).

- Source: the owner's decision on #579 (Questions stay, with FAQ structured data).
- Check: Page test, "the questions are in the page with their answers, and as FAQ structured data";
  Tools spec, "a question opens to its answer" and "… has its title, description, canonical URL, and
  structured data"; `src/lib/tools/content.test.ts`, "the questions become FAQ structured data,
  each answer in full".

## Site-wide

**Titles, descriptions, and canonical URLs.** The index is "Free Japanese converters and tools |
Zenbu Japanese" and each converter "<Name> Converter | Zenbu Japanese", each with its own
description and canonical URL, from `src/lib/tools/converters.ts`. All are indexed, and
`/sitemap-tools.xml`, which the sitemap index lists, holds them, as does the HTML sitemap
(`/sitemap/`), under the tools index. A converter name the site doesn't have is 404.

- Source: the owner's decision on #579 (all pages indexed and in the sitemap); the SERP XML
  sitemaps standard (`sitemap-tools.xml` for tool pages).
- Check: Tools spec, "… has its title, description, canonical URL, and structured data" for each
  page, and "the HTML sitemap lists the tools index and every converter"; `e2e/sitemaps.spec.ts`,
  "the tools sitemap lists the tools index and every converter, each with its slash";
  `src/lib/sitemap.test.ts`; `src/app/routes.test.ts`.

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
