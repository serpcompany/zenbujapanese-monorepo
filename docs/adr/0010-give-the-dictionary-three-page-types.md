---
status: accepted
---

# Give the dictionary three page types, with everything else on the word page

zenbujapanese.com's dictionary has three page types, and no others:

- the dictionary home, `/dictionary/`;
- a search's results, `/dictionary/search/<normalized query>/`;
- a word, `/dictionary/<slug>-<ent_seq>/`.

Whatever the app drills down into from a word is shown on the word page itself, in sections that
open and close (an accordion), and stays in the page's HTML while closed. That covers:

- the conjugation table, and each conjugated form with its examples;
- each kanji's details, its stroke order included;
- the example sentences.

A one-kanji search shows that kanji's details in its results. An English search, whose example
sentences aren't any one word's, lists them on its results page.

## Language

The result is always Japanese. The source, what the reader types into search, can be any
supported language; English and Japanese are supported today. The site itself displays in a
locale, English today. A locale other than English puts its language identifier in front of
`/dictionary/`, as `/{lang}/dictionary/` (English has none), as
[ADR 0007](0007-publish-the-dictionary-at-permanent-urls-from-the-websites-copy.md) set out. No
other locale is built yet.

## Why

The kanji, conjugation, and Example Sentences pages multiplied the URLs without being part of the
route plan:

- every word with a conjugation table had a table page;
- every one of its forms had a page in each register;
- the conjugations sitemap alone listed 33,532 URLs.

One complete page per word is the page search engines should find, and it keeps the routes to a
plan that a check can enforce.

## Consequences

- **The removed pages redirect.** The pages are gone, and their URLs answer 308 to the nearest
  page:

  | Old URL | Redirects to |
  | --- | --- |
  | `/dictionary/kanji/<character>/` | `/dictionary/search/<character>/` |
  | `/dictionary/<slug>-<ent_seq>/conjugations/`, and each form under it | The word page |
  | `/dictionary/search/<query>/examples/` | The search page |
- **Sitemaps:** they list only the site's pages and the word pages. The kanji and conjugations
  sitemaps are gone.
- **Data routes:** the JSON routes that load more of a page are not pages. They are `noindex`, are
  in no sitemap, and are on the same list.
- **Enforced by a test:** `apps/web/src/app/routes.test.ts` fails when a page or route appears
  that isn't on that list.
- **ADR 0007:** its kanji URLs and its search Example Sentences pages no longer exist.
- **The dictionary service:** its kanji and conjugation sitemap routes, its conjugation-word
  route, and the fields that named kanji pages are unused. They're removed once the website no
  longer reads them, so a site and a service deployed apart still understand each other.

The decision is the owner's and Devin's, on
[issue 544](https://github.com/serpcompany/zenbujapanese-monorepo/issues/544). This decision
amends [ADR 0007](0007-publish-the-dictionary-at-permanent-urls-from-the-websites-copy.md).
