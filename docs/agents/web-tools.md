# Tools pages

How zenbujapanese.com's tools section is built. What each page does, and the check for each, is in
the [Tools pages](../../apps/web/docs/product/tools.md) product doc; the rest of the site is in
[`web.md`](web.md).

## Pages

`/tools/` and the seven converters, `src/app/[locale]/tools/[tool]/page.tsx`, in English and in
Japanese under `/ja/` ([`web-languages.md`](web-languages.md)), are static:
`generateStaticParams` lists them (`toolSlugs`: the six `converterSlugs` and `furiganaSlug`), and
the page answers any other name with `notFound()`.
It leaves `dynamicParams` on: the site's OpenNext build has no incremental cache, so with
`dynamicParams = false` the Worker answers 404 even for the prerendered converters (`next dev`
serves them, so only the production build shows it). The six kana and width converters' logic is
in `src/lib/tools/`, pure functions with tests beside them, which the browser runs, so nothing typed
leaves it. Their copy is the dictionaries' `tools` namespace; `src/lib/tools/tool-pages.ts` puts it
together with each converter's samples (`converters.ts`, which imports no dictionary, so the
converter's client bundle carries none) and the server passes the converter its labels. Each converter keeps its two boxes as one edit, the box last typed in and its text
(`bothSides` in `src/lib/tools/convert.ts`), and works out the other box from it, so the box being
typed in is never rewritten. The pages are stock shadcn components, as the owner's UI rules ask
(#696): `card`, `table`, `tabs`, `checkbox` with `label`, `textarea`, `toggle-group`, `kbd`, and
`accordion`, through `src/components/question-list.tsx`, which the product page shares. The
conversion chart is the browse pages' `KanaChart`
(`src/components/dictionary/browse/kana-chart.tsx`), its tiles holding each page's pair, in tabs
whose panels stay mounted, so all 131 kana are in the HTML. A `Kbd` on the muted grey sits in a
`muted-surface` wrapper, which keeps its text at 4.5:1 ([`web.md`](web.md), Theme).

## Listing the pages

The tools pages aren't in `src/lib/pages.ts`. `toolPaths` (`src/lib/tools/paths.ts`) lists them:
it feeds `/sitemap-tools.xml`, a child of the sitemap index ([`web.md`](web.md), Sitemaps), which
lists each in English and Japanese; `toolPagesIn` (`src/lib/tools/tool-pages.ts`) gives their
titles in a language, and the HTML sitemap reads them through `toolsTreeIn`
(`src/lib/dictionary/browse/site-tree.ts`).

## Kanji to Furigana

What the page does is in [Kanji to Furigana](../../apps/web/docs/product/kanji-to-furigana.md).
Its readings come from the dictionary service, not the browser:

- **The page.** `src/components/tools/furigana-page.tsx` fills `ToolPage`
  (`src/components/tools/tool-page.tsx`), the frame every converter page shares: the breadcrumb,
  heading, tool, How it works, the converter pages' reference and chart, Questions, Related tools,
  and the app card. Its copy is the dictionaries' `tools.furigana`, and its name, description,
  How it works, and questions sit beside the converters' under `kanji-to-furigana` and `furigana`.
  `src/lib/tools/furigana-tool.ts` holds its sample, with the furigana the service gives it, its
  card, Try examples, and related tools, and the two forms Copy writes (`furiganaHtml`, and
  `furiganaPlainText`); it imports no dictionary, so the converter's client bundle carries none.
- **The converter.** `src/components/tools/furigana-converter.tsx` keeps the typed text; the hook
  `src/hooks/use-furigana.ts` asks `/tools/furigana.json?text=` 300 ms after typing stops, drops
  an earlier request it no longer needs, and keeps each text's answer while the page is open. The
  boxes share `ConverterBox` and the card's header, Try, and Clear
  (`src/components/tools/converter-parts.tsx`) with the other converters, and Copy's status the
  hook `src/hooks/use-copy.ts`.
- **The route.** `src/app/[locale]/tools/furigana.json/route.ts` answers in English only, through
  `furiganaAnswer` in `src/lib/dictionary/furigana.ts`. That asks the client `dictionaryService()`
  returns for the service's `/v1/segmentation/<text>` with the site's token
  ([`dictionary-api.md`](dictionary-api.md), Routes), and puts each token's reading over its kanji
  with the core's `segmentationFurigana` (`packages/dictionary-core/src/cards/segmentation.ts`,
  over `rubySegments`). The answer is `SegmentationResponse`, `segmentation` in the core's
  `DictionaryContract` since contract 5. Without a service it reads `fixtureSegmentation`, the
  service's export of the sample's and Try examples' segmentation.
