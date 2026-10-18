# Tools pages

How zenbujapanese.com's tools section is built. What each page does, and the check for each, is in
the [Tools pages](../../apps/web/docs/product/tools.md) product doc; the rest of the site is in
[`web.md`](web.md).

## Pages

`/tools/` and the six converters, `src/app/tools/[tool]/page.tsx`, are static:
`generateStaticParams` lists the converters, and the page answers any other name with `notFound()`.
It leaves `dynamicParams` on: the site's OpenNext build has no incremental cache, so with
`dynamicParams = false` the Worker answers 404 even for the prerendered converters (`next dev`
serves them, so only the production build shows it). The converters' logic and copy are in
`src/lib/tools/`, pure functions with tests beside them, which the browser runs, so nothing typed
leaves it. Each converter keeps its two boxes as one edit, the box last typed in and its text
(`bothSides` in `src/lib/tools/convert.ts`), and works out the other box from it, so the box being
typed in is never rewritten. The pages are stock shadcn components, as the owner's UI rules ask
(#696): `card`, `table`, `tabs`, `checkbox` with `label`, `textarea`, `toggle-group`, `kbd`, and
`accordion`, through `src/components/question-list.tsx`, which the product page shares. The
conversion chart is the browse pages' `KanaChart`
(`src/components/dictionary/browse/kana-chart.tsx`), its tiles holding each page's pair, in tabs
whose panels stay mounted, so all 131 kana are in the HTML. A `Kbd` on the muted grey sits in a
`muted-surface` wrapper, which keeps its text at 4.5:1 ([`web.md`](web.md), Theme).

## Listing the pages

The tools pages aren't in `src/lib/pages.ts`. `toolPages` (`src/lib/tools/converters.ts`) lists
them: it feeds `/sitemap-tools.xml`, a child of the sitemap index ([`web.md`](web.md), Sitemaps),
and the HTML sitemap reads them through `toolsTree` (`src/lib/dictionary/browse/site-tree.ts`).
