# Required, not built yet (#831)

The website features that [Dictionary](dictionary.md) requires but the website doesn't have yet.
**App docs** is `apps/ios/docs/product/dictionary.md`, as there.

These are the #831 inventory's rows marked differs or missing, and the app features the owner's
decision on #831 makes required. Each is written as the behavior the website must have, with the
app source it must match and the check it will get. When one is built, its entry moves into its
page's section in [Dictionary](dictionary.md), with its check, in the same PR.

## Search results

**Handwriting and radical input.** The search box offers handwriting and radical selection, as the
app does.

- App source: App docs, Search; `HandwritingInputView.swift`, `OfflineHandwritingRecognizer.swift`,
  `RadicalInputView.swift`, `RadicalLookupClient.swift`. The radical panel's kanji and radicals are
  already the core's (`RadicalLookup` in `packages/dictionary-core/src/search/radicals.ts`), and
  so is which handwriting candidates are kept (`japaneseCandidates`); recognizing the strokes is
  the app's.
- Check it will get: an app-recorded suite of radical selections and their candidate kanji, and
  handwriting samples and their candidates, replayed against the website.

**Radical searches keep the strongest matches.** A search started from radical input lists only
its leading group of equally strong matches, as the app limits it (`rankedEntryLimit`).

- App source: `SearchResultsView` and its `rankedEntryLimit` in `SearchResultsView.swift`.
- Check it will get: radical-origin cases in the planned search results suite, recording the rows
  the app lists.

## Kanji details

**Kanji element detail.** An element opens its element detail screen, as in the app.

- App source: `KanjiElementDetailView.swift`, which draws the core's `kanjiElementDetail`
  (`detail/kanji-element.ts`).
- Check it will get: the app-recorded element suite (`kanji-element.json`, which the service
  already replays through the entry point the app calls), and a rendered-page check.

## Site-wide

**Hide Furigana on Known Words.** The Reading Aids setting the website doesn't offer yet: known
words in examples lose their furigana, as in the app. It needs the learner's known words, which the
website doesn't have yet (#934); the other Reading Aids are built ([Site-wide](site-wide.md)).

- App source: App docs index, Account (Reading Aids); App docs, Dictionary and kanji details;
  `ReadingAidPreferences.swift` (`hidesFuriganaOnKnownWords`, off by default) and
  `LinkedJapaneseText.swift` (`hidesFurigana(for:)`).
- Check it will get: a browser test that a known word in a word page's example loses its furigana
  with the setting on, and keeps it with it off.

## URLs and SEO

**Search sitemaps.** Child sitemaps list the canonical search URLs of a chosen query set (ADR
0007), and the sitemap index lists them.

- Source: #466, whose last open item this was; the route audit (#544) now decides which search
  pages stay indexable at all, and so whether any belong in a sitemap. #828 no longer supplies the
  query set (it dropped the precomputed search-sitemap queries with ADR 0009).
- Check it will get: a `sitemaps.test.ts` case and a smoke check.

**Structured data.** Word pages carry structured data beyond `BreadcrumbList`.

- Source: #465 (metadata and structured data).
- Check it will get: a rendered-HTML check of each page's JSON-LD.
