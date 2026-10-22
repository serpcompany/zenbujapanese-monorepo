# The website's languages

How zenbujapanese.com serves English and Japanese (#847). What a reader sees, and the check for
each behavior, is in [Languages](../../apps/web/docs/product/languages.md). It follows SERP's
[localization](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/web-stack/localization.md)
standard, its [language switcher](https://github.com/serpcompany/serp/blob/main/docs/engineering/websites/features/language-switcher.md),
and the [International SEO](https://github.com/serpcompany/serp/blob/main/docs/marketing/international-seo.md)
guide; where this site differs, the difference is under Where this site differs, below. Run every
command from `apps/web`.

## Routing

- **One list of languages,** `src/lib/i18n/config.ts`: `{ code, ogLocale, name }` for English and
  Japanese, English first, each named in itself. The default, the other codes, and `isLocale` come
  from it.
- **Every page is implemented once, under `src/app/[locale]/`.** Its layout is the root layout: it
  renders `<html lang>` (`src/components/site-document.tsx`, shared with the 404),
  `generateStaticParams` returns both codes, and `localeOf` (`src/lib/i18n/params.ts`) answers 404
  for any other segment. There is no `src/app/layout.tsx`. A page reads its language with
  `await localeOf(params)` and passes `locale` to every component that writes text or links.
- **Bare URLs are rewritten to `/en/…`** by the `afterFiles` rewrites in `src/lib/i18n/routing.ts`,
  which Next.js applies after its files and routes, so the files (the dictionary's sitemaps among
  them), `robots.txt`, and the sitemaps never reach them. The first segment's lookahead leaves `/ja`, `/en`, `/api`, and `/_next` alone.
- **`/en/…` redirects to the bare path** (`defaultLocaleRedirects`, first in `next.config.ts`'s
  redirects). Next.js adds a missing slash before it reads them, so `/en/about` would take two hops
  there; `worker.ts` answers every `/en` path in one 308 before Next.js runs
  (`withoutDefaultLocale`, through `movedPath` in `src/lib/moved-pages.ts`, which the other hosts'
  redirect uses too), as it does for moved pages. `pnpm dev` doesn't run `worker.ts`.
- **The JSON routes moved under `[locale]` with their pages** (an `afterFiles` rewrite runs before
  dynamic routes), and answer only for English: a file has no language, so `/ja/…json` is 404.
- **404s.** An unmatched URL renders `src/app/global-not-found.tsx` (`experimental.globalNotFound`),
  in English; `notFound()` in a page renders `src/app/[locale]/not-found.tsx` in its language,
  which reads the segment with `next/root-params`, since a not-found file takes no props. Both show
  Next.js's own 404 (`src/components/not-found-message.tsx`) with the message in the language.

## Strings

- **One dictionary per language,** `src/lib/i18n/dictionaries/en.json` and `ja.json`, one
  namespace per area (`chrome`, `menus`, `footer`, `pages`, `home`, `products`, …).
  `getDictionary(locale)` returns `en.json`'s type, so a key missing from `ja.json` fails `tsc`.
  Server components load it; a client component gets the strings it shows from its server parent
  (typed `Dictionary['<namespace>']`), never the dictionary.
- **Templates, not fragments:** `fill` and `countOf` in `src/lib/i18n/format.ts` (plurals keyed
  by CLDR category, numbers and dates through `Intl`), and `<Fill>` (`src/components/fill.tsx`)
  for a sentence with a link in it.
- **Links** go through `localizedPath(path, locale)` (`src/lib/i18n/paths.ts`), which adds `/ja`
  to a page and leaves files, `#`, external URLs, `/api`, and `/_next` alone. Data modules keep
  paths unprefixed; the component that writes the link localizes it.
- **The core's labels.** The shared core writes the dictionary screens' labels in English, for the
  app and the site alike (`docs/agents/dictionary-core.md`). The website reads them in Japanese
  through `coreText` (`src/lib/i18n/core-text.ts`), keyed by the core's English; a label it doesn't
  know stays English, and its test fails on any label the fixtures show untranslated. JMdict's
  meanings and Tatoeba's translations are data, not labels: they stay English, with `lang="en"`.
- **Account requests name the page's language.** `accountApi(apiUrl, locale)`
  (`src/lib/account/client.ts`) sends `Content-Language: en` or `ja` on every call, a header the
  browser sends cross-origin without a preflight for those values, so the account service writes
  its emails in the reader's language and stores a new account's.
- **Checks:** `src/lib/i18n/dictionaries.test.ts` (parity: the same keys, no empty value, no
  English value but the names it lists), `src/lib/i18n/hardcoded-strings.test.ts` (no literal
  English in JSX text, `alt`, `aria-label`, `title`, `placeholder`, `label`, or route metadata,
  outside the stock components in `src/components/ui/`), and each area's rendered tests.

## Review

The Japanese is a draft, built and live so a native speaker can review it on staging (the owner's
decision on #847). `apps/web/content/reviews/ja.json` is its review record: `reviewedBy` and
`reviewedAt`, empty until the reviewer, or the owner on the reviewer's word, sets them (an agent
never does), and `sourceChecksums`, the SHA-256 prefix of each key's English that its Japanese was
written from. When an English string changes, the stale check in `dictionaries.test.ts` names its
key: update its Japanese, then record it with `pnpm i18n:stamp ja <key>…`
(`scripts/stamp-translations.mjs`; `--all` stamps every key). A material change goes back to
review; a typo fix only re-stamps.

The term list every draft uses is `apps/web/content/terms/ja.md`, and the keyword brief for each
page or template is in `apps/web/content/briefs/ja/` ([README](../../apps/web/content/briefs/ja/README.md)).
No keyword volumes are measured yet.

## SEO signals

`src/lib/seo.ts` builds them, so the head, the sitemaps, and the switcher agree:

- `hreflangPaths(path)`: each language's URL and `x-default` (English). `localizedAlternates`
  gives a page's metadata its canonical in its own language and those `alternates.languages`; the
  three metadata helpers (`pageMetadata`, `dictionaryMetadata`, `accountMetadata`) call it.
- The homepages leave `alternates` unset and write their canonical, `og:url`, and hreflang links
  themselves (`src/components/origin-canonical.tsx`, `homeHeadLinks`), so the English homepage is
  the bare origin.
- `siteOpenGraph(locale)` names `og:locale`, with the site's name, type, and image, which every
  page's Open Graph keeps ([Titles, descriptions, and sharing](../../apps/web/docs/product/snippets.md)).
- `localizedSitemapEntries(path, origin)`: a page's URL in each language, each with the same
  `xhtml:link` alternates. The pages, browse, and word sitemaps all use it. A word sitemap holds
  `wordsPerSitemap` (20,000) words, so each of the service's 50,000-word files becomes three
  (`wordSitemapFiles` in `src/lib/dictionary/sitemaps.ts`, which `pnpm sitemaps` writes at each
  deploy, ADR 0016). The largest is about 21 MiB, under the 25 MiB a Workers asset may be, and
  `pnpm sitemaps` refuses a larger one. The tools sitemap lists each tools page in both languages
  too.
- The header marks the current section from the public path: on the server, a page reads the
  rewritten `/en/…`, so `isCurrentSection` and `isCurrentPage` (`src/lib/site-menus.ts`) drop the
  prefix first, and the server's HTML and the browser's agree.

## The switcher

`src/components/language-switcher.tsx`: `LanguageMenu`, the footer's `DropdownMenu`, the site's only
language choice, whose trigger shows the language's flag (`src/components/flag.tsx`, from its
`ogLocale`), its code, and a down arrow. It reads the page's `<link rel="alternate" hreflang>` tags
when it opens, all but `x-default`, and falls back to a language's homepage (`switcherFor` in
`src/lib/i18n/switcher.ts`). It keeps each link's path, so a local or staging page links to its own
host. An item is the `<a>` itself, so switching is a full page load.

## Where this site differs from the standards

- **The languages are only in the footer, with flags.** The standard puts one menu in the header,
  and the same list in the phone menu, with the Languages icon and the language's name, and no
  flags. The owner chose (2026-10-19) the footer alone, at every width, with a flag, code, and
  arrow: 🇺🇸 EN and 🇯🇵 JA, drawn as SVG, since Windows doesn't draw flag emoji. The menu still
  names each language in itself. Its menu is a list, so more languages need no new design.

- **Unreviewed Japanese is built.** The standard builds a translation only once it's reviewed;
  the owner chose to publish the drafts so they're reviewed on staging (#847). Production deploys
  only by hand, so the review comes before a production deploy.
- **One hop for `/en` without a slash comes from `worker.ts`,** not `skipTrailingSlashRedirect`
  and hand-written slash rules: the site's slash redirects stay as they were, so no existing URL
  answers differently, and `worker.ts` already gives moved pages their one hop.
- **The core's labels are translated in the website,** since the core writes them in English for
  the app (debt in `docs/tech-debt-web.md`).
- **Every page is published in both languages,** the legal and account pages included, by the
  owner's decision on #847; the dictionary's pages in every language by ADR 0007.
