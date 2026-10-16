# Languages

zenbujapanese.com is in English and Japanese (#666), as SERP's
[localization](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/web-stack/localization.md)
and [language switcher](https://github.com/serpcompany/serp/blob/main/docs/engineering/websites/features/language-switcher.md)
standards describe. Every page has both: the English page at its bare URL, as before, and the
Japanese one under `/ja/`. How it's built is in
[`docs/agents/web-languages.md`](../../../../docs/agents/web-languages.md).

Abbreviations: Web paths are under `apps/web/`. **Languages spec** is `e2e/languages.spec.ts`,
**hreflang spec** `e2e/hreflang.spec.ts`, and **URLs spec** `e2e/urls.spec.ts`, browser tests at a
desktop and a phone width.

## URLs

**English keeps its URLs.** An English page is where it was (`/about/`, `/dictionary/<slug>/`);
adding Japanese changed no URL. Each Japanese page is its English page's path under `/ja/`, with
the same slug (`/ja/about/`, `/ja/dictionary/見る-1259290/`). The Japanese homepage is `/ja/`.

- Source: SERP localization standard, URLs; ADR 0007 (a locale's prefix in front of every path,
  English with none); #666.
- Check: `src/lib/i18n/routing.test.ts`, "bare URLs are rewritten to the English pages, and
  nothing else is" and "no language code is the first segment of an existing page, so adding one
  changes no URL"; `src/app/routes.test.ts`; URLs spec, "… answers 200 in ja"; smoke `200 /ja/`.

**`/en/` is never a public URL.** `/en`, `/en/`, and `/en/<path>` redirect (308) to the bare path in
one hop, with a page's trailing slash and a file's none.

- Source: SERP localization standard, URLs.
- Check: `src/lib/i18n/routing.test.ts`, "/en/ is never a public URL: it redirects to the bare
  path in one hop"; URLs spec, "/en/ is never a public URL: …"; smoke `308 /en/about/ -> /about/`.

**Files have no language.** `robots.txt`, the sitemaps, and the JSON a page loads keep one URL,
with no prefix: `/ja/robots.txt` and `/ja/dictionary/examples/<n>.json` are 404.

- Source: SERP localization standard, Links.
- Check: URLs spec, "adding Japanese changed no file: …"; smoke `404 /ja/robots.txt`.

**No automatic redirect.** The site never picks a language from the address, the browser's
languages, or a cookie: the URL is the language.

- Source: SERP localization standard, Routing (no proxy and no automatic redirects).
- Check: Languages spec, "following 日本語 opens the Japanese page in one full page load, and
  English comes back" (no cookie is set, and `/about/` stays English after a Japanese page).

## What each language shows

**Interface.** A Japanese page's interface is in Japanese: the header, menus, footer, headings,
labels, buttons, messages, `alt` text, accessible names, titles, descriptions, Open Graph, and the
breadcrumbs' structured data. The text comes from one dictionary per language
(`src/lib/i18n/dictionaries/`), and the core's English labels on the dictionary pages (sections,
parts of speech, conjugation forms, frequency rows) from the website's Japanese table for them.

- Source: SERP localization standard, Strings.
- Check: `src/lib/i18n/dictionaries.test.ts` (the Japanese dictionary has exactly the English
  one's keys, none empty, none left in English but names); `src/lib/i18n/hardcoded-strings.test.ts`
  (no page or component writes English outside the dictionaries); `src/lib/i18n/core-text.test.ts`
  (every label the core writes for the fixtures reads in Japanese); each area's rendered tests.

**Data stays as the data is.** JMdict's meanings, Tatoeba's translations, and the sources' names
are English on both pages, marked `lang="en"` on a Japanese page. Headwords, readings, and
example sentences are Japanese on both. `/ja/dictionary/` is a Japanese-English dictionary for
Japanese speakers.

- Source: ADR 0007; SERP localization standard, Content (reference data in its source language
  isn't a translation).
- Check: `src/components/dictionary/word-page.test.tsx` and the search results' rendered tests.

**The Japanese policies.** Each Japanese policy (Privacy Policy, Terms of Use, DMCA, Affiliate
Disclosure) opens with a line saying it translates the English original, which prevails if the two
differ, linking the English page. The Japanese affiliate disclosure also says affiliate links are
marked as advertising, in line with 景品表示法's stealth-marketing rule (in force since October
2023). Support and Contact say nothing about the language replies come in.

- Source: the owner's decisions of 2026-10-16 on #666.
- Check: `src/app/[locale]/company-pages.test.tsx`, "… in Japanese says first that the English
  version prevails, and links it" and "the Japanese affiliate disclosure says its links are marked
  as advertising under 景品表示法".

**The Japanese is a draft until reviewed.** The Japanese copy and its keyword briefs
(`content/briefs/ja/`) are drafts that a native speaker reviews on staging. Until then
`content/reviews/ja.json` names no reviewer, and its checksums tie each Japanese string to
the English it was written from, so a changed English string fails the check until its Japanese
is updated.

- Source: the owner's decision on #666 (the Japanese pages are built and reviewed on staging);
  SERP International SEO guide, Translating.
- Check: `src/lib/i18n/dictionaries.test.ts`, "no Japanese string is stale: …" and "the review
  record names no reviewer until a native speaker has reviewed the Japanese".

## Search engines

**`lang`, canonical, and hreflang.** Every page's `<html lang>` is its language. Its canonical is
the page itself in its own language. Its hreflang links name the English and Japanese pages and
`x-default` (the English page), on absolute URLs of the environment's host, and each page names
the other back. The homepages write these tags themselves, so the English homepage is the bare
origin and the Japanese one `/ja/`. A Japanese page's Open Graph names `ja_JP`; English pages
keep the Open Graph they had (`en_US` on the site's pages, none on the dictionary's).

- Source: SERP localization standard, SEO signals; SERP URL trailing slash standard (the
  homepage as the origin).
- Check: `src/lib/seo.test.ts`; `src/components/origin-canonical.test.tsx`; hreflang spec,
  "every page in the pages sitemap, …" and each dictionary page type's "the English and Japanese
  pages name each other"; smoke "/ and /ja/ are English and Japanese, …".

**Sitemaps.** Each child sitemap lists every URL in English and then Japanese, each with the same
`xhtml:link` alternates as its hreflang. A word sitemap holds 25,000 words, 50,000 URLs, so the
words take twice the files they did; the index lists them all.

- Source: SERP localization standard, SEO signals (Sitemap); SERP XML sitemaps standard (50,000
  URLs a file).
- Check: `src/lib/dictionary/sitemaps.test.ts`; `e2e/sitemaps.spec.ts`, "the pages sitemap writes
  the homepage as the origin and every other page with its slash, each in English and then
  Japanese"; hreflang spec.

## Language switcher

**Where.** From 1024 pixels a button in the header, before Get the app, opens the language menu;
below 1024 pixels the phone menu lists the languages above its account and Get the app buttons.
The footer has the same menu, beside the Sitemap link, at every width.

- Source: SERP language switcher standard, Behavior; #666 (the header, the drawer below 1024
  pixels, and the footer).
- Check: `src/components/site-header.test.tsx`, "from 1024 pixels the header has the language
  menu, …"; `src/components/site-footer.test.tsx`, "the footer ends with the copyright, the
  language menu, and the Sitemap"; Languages spec, "the header shows the menu from 1024 pixels
  and the phone menu below, never both" and "the footer has the same menu on every width".

**What it shows.** The button shows the Languages icon and the current language's name, and its
accessible name starts with it: "English, change language", 「日本語、表示言語を切り替える」. Each
language is named in itself (English, 日本語), with no flags. The current one is marked and isn't a
link. The others are links, with `lang` and `hreflang` set.

- Source: SERP language switcher standard, Behavior and Accessibility.
- Check: `src/components/site-header.test.tsx`; Languages spec, "the header menu opens and
  follows a language by keyboard, each named in itself".

**Where each item goes.** Each language links to the same page in that language, read from the
page's hreflang links when the menu opens; a page without them, such as a missing page, links each
language to its homepage. Following an item is a full page load of a 200 page, with no redirect.
The choice isn't remembered.

- Source: SERP language switcher standard, Behavior and Where the links come from.
- Check: Languages spec, "on … a translated page, each language links to the same page in that
  language", "a missing page links each other language to its homepage", "a missing Japanese page
  links English to its homepage", "each item of a translated page lands on a 200 page in its
  language, with no redirect", and "following 日本語 opens the Japanese page in one full page
  load, and English comes back".

**Phone layout.** Every Japanese page type fits a 360-pixel phone, as the English ones do.

- Source: #682.
- Check: `e2e/phone-layout.spec.ts`, each "… (日本語)" page type.
