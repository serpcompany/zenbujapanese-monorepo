# Languages

zenbujapanese.com is in English and Japanese (#847), as SERP's
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
  English with none); #847.
- Check: `src/lib/i18n/routing.test.ts`, "bare URLs are rewritten to the English pages, and
  nothing else is" and "no language code is the first segment of an existing page, so adding one
  changes no URL"; `src/app/routes.test.ts`; URLs spec, "… answers 200 in ja"; smoke `200 /ja/`.

**`/en/` is never a public URL.** `/en`, `/en/`, and `/en/<path>` redirect (308) to the bare path in
one hop, with a page's trailing slash and a file's none.

- Source: SERP localization standard, URLs.
- Check: `src/lib/i18n/routing.test.ts`, "/en/ is never a public URL: it redirects to the bare
  path in one hop"; `src/lib/moved-pages.test.ts`, "sends https://zenbujapanese.com/en/about to …
  in one 308"; URLs spec, "/en/about/ redirects to /about/ in one hop" and the other `/en` cases;
  smoke `308 /en/about/ -> /about/`.

**Retired words in Japanese.** A retired word's Japanese URL answers as its English one does: 410,
with the notice in Japanese, or 308 to its replacement's Japanese page.

- Source: ADR 0007 (retired entries); SERP localization standard, URLs.
- Check: `src/lib/dictionary/retired.test.ts`, "a retired word on a Japanese page is gone, or
  redirects, in Japanese".

**Files have no language.** `robots.txt`, the sitemaps, and the JSON a page loads keep one URL,
with no prefix: `/ja/robots.txt` and `/ja/dictionary/examples/<n>.json` are 404.

- Source: SERP localization standard, Links.
- Check: URLs spec, "adding Japanese changed no file: …"; smoke `404 /ja/robots.txt`.

**Missing pages.** A Japanese page that answers 404, such as a word that doesn't exist
(`/ja/dictionary/999999999/`), says so in Japanese on a `lang="ja"` page, from
`src/app/[locale]/not-found.tsx`. A URL that matches no page, `/ja/no-such-page/` included,
shows the English 404 (`src/app/global-not-found.tsx`), whose switcher links each homepage.

- Source: SERP localization standard, Strings; #847. The English 404 for an unmatched `/ja/` URL
  is a debt row: a catch-all route under `[locale]` needs an owner decision.
- Check: Languages spec, "a missing Japanese page says so in Japanese, and links English to its
  homepage" and "a URL under /ja/ that matches no page shows the English 404".

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

- Source: the owner's decisions of 2026-10-16 on #847.
- Check: `src/app/[locale]/company-pages.test.tsx`, "… in Japanese says first that the English
  version prevails, and links it" and "the Japanese affiliate disclosure says its links are marked
  as advertising under 景品表示法".

**Account emails.** Every request the account pages and the account menu send the account service
names the page's language (`Content-Language: en` or `ja`), so the service writes a sign-in code
or an account notice in the language of the page that asked for it, and stores a new account's
language from the page it signed up on (#816,
[`account-email.md`](../../../../docs/agents/account-email.md)).

- Source: SERP localization standard, Strings (emails in the recipient's language); the owner's
  decision on #847.
- Check: `src/lib/account/client.test.ts`, "names the page’s language on every request, so the
  service writes its emails in it".

**The Japanese is a draft until reviewed.** The Japanese copy and its keyword briefs
(`content/briefs/ja/`) are drafts that a native speaker reviews on staging. Until then
`content/reviews/ja.json` names no reviewer, and its checksums tie each Japanese string to
the English it was written from, so a changed English string fails the check until its Japanese
is updated.

- Source: the owner's decision on #847 (the Japanese pages are built and reviewed on staging);
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
`xhtml:link` alternates as its hreflang. A word sitemap holds 20,000 words, 40,000 URLs, so each of
the service's 50,000-word files becomes three, the largest about 21 MiB: a Cloudflare Workers file
is at most 25 MiB, and 25,000 words came to 26.4 MiB. The index lists them all, and `pnpm
sitemaps` refuses to write a file over 25 MiB.

- Source: SERP localization standard, SEO signals (Sitemap); SERP XML sitemaps standard (50,000
  URLs a file); Cloudflare Workers' static asset limit (25 MiB a file).
- Check: `src/lib/dictionary/sitemaps.test.ts`, "a service sitemap of more than 20,000 words takes
  two files, …"; `src/lib/dictionary-sitemaps-deploy.test.ts`, "refuses a sitemap larger than a
  Cloudflare Workers asset may be, …"; `e2e/sitemaps.spec.ts`, "the pages sitemap writes the
  homepage as the origin and every other page with its slash, each in English and then
  Japanese"; hreflang spec.

## Language switcher

**Where.** Only the footer offers the languages, beside the Sitemap link, at every width. The
header, its account menu, and the phone menu have no language choice.

- Source: SERP language switcher standard, Behavior; #847 (the footer); the owner's choice on
  2026-10-19 (the footer alone, with flags).
- Check: `src/components/site-header.test.tsx`, "the %s header has no language button: …";
  `src/components/site-footer.test.tsx`, "the footer ends with the copyright, the language menu,
  and the Sitemap"; Languages spec, "only the footer offers the languages: …".

**What it shows.** The footer's button shows the current language's flag and code with a down
arrow, 🇺🇸 EN or 🇯🇵 JA, the flags drawn as SVG so every system shows them. Its accessible name
starts with the code: "EN, English, change language", 「JA, 日本語、表示言語を切り替える」. Its menu
lists each language by flag and by its name in itself (English, 日本語). The current one is marked
and isn't a link; the others are links, with `lang` and `hreflang` set.

- Source: SERP language switcher standard, Behavior and Accessibility, but for the flags, which it
  rules out ([`web-languages.md`](../../../../docs/agents/web-languages.md), Where this site
  differs).
- Check: `src/components/site-footer.test.tsx`; Languages spec, "the footer has a flag menu,
  named by its code, on every width" and "the footer menu opens and follows a language by
  keyboard, each named in itself".

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
