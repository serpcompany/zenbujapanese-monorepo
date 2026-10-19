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

**Reading Aids.** The website offers the app's Reading Aids settings and applies them wherever the
app does:

- **Furigana** over headwords and linked words. With it off, a word page shows the reading under
  the headword instead, as in the app.
- **Romaji** alongside the Japanese on word pages, kanji details, and example sentences.
- **Word Meanings:** a short meaning under each linked word the learner hasn't marked known.
- **Sentence Translations:** whether examples show their English.
- **Hide Furigana on Known Words:** known words in examples lose their furigana.

The defaults are the app's: Furigana and Sentence Translations on, Romaji, Word Meanings, and Hide
Furigana on Known Words off. The app keeps the settings on the device; the website keeps them in
the browser until accounts exist.

Hide Furigana on Known Words depends on which words the learner knows, so it needs accounts (#468)
and ships with them. Furigana, Romaji, Word Meanings, and Sentence Translations can ship before
then: without an account every word counts as unknown, as it does in the app until the learner
marks it, so Word Meanings shows under every linked word.

- App source: App docs index, Account (Reading Aids); App docs, Dictionary and kanji details
  (furigana off, Word Meanings, Sentence Translations); `ReadingAidPreferences.swift`,
  `ReadingAidPresentation.swift`. Romaji itself is the core's (`romaji` and `sentenceRomaji` in
  `packages/dictionary-core/src/detail/romaji.ts`), with the app's recorded cases in
  `romaji.json`.
- Check it will get: a unit test pinning the defaults to `ReadingAidPreferences.swift`'s, and a
  rendered-page check of a word page (such as 見る) under each setting: ruby present or absent, the
  reading under the headword, romaji, meanings under example words, and translations. Hide Furigana
  on Known Words gets its check with #468.

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
