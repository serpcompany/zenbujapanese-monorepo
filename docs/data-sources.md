# Data sources

A data source supplies information, data, content, etc. for a technology to process or present.

This is the index for the whole repository: one row per source and the apps that use it.
Source names link to the official publisher or project. The language data's source records hold
the exact versions, URLs, checksums, licenses, and transformations; see the
[`source index`](../language-data/sources/README.md).

Every client's credits come from one list, `sourceCredits` in
[`packages/dictionary-core/src/sources/credits.ts`](../packages/dictionary-core/src/sources/credits.ts):
for each source its name, a one-line credit, its license, a project link, a notice where the license
asks for one (Jiten's says its rankings are adapted and shared alike), and the clients that use it,
with no versions or dates. The list also holds the sentence that says Zenbu converts every source
and shares converted Creative Commons data alike. The website imports the list for its Sources
page and each page's Sources list; the app's **Credits & Attributions** asks the core it runs for
it; and word cards read their sources' names, licenses, and links from it. No client words a
credit itself.

When adding, removing, or relicensing a source, change that list and this table in the same PR. The
Credit column names the source's credit in the list, or None for a source no client credits, and
the consumers a row names are the clients its credit lists;
`packages/dictionary-core/src/sources/credits.test.ts` fails when the table and the list differ.

What follows the list without another edit:

- the wording of a credit, wherever it is shown: its name, sentence, license, links, and notice;
- the website's Sources page, `/sources/`, which lists every credit the list gives the website; and
- the app's Credits & Attributions, which lists every credit the list gives the app, once
  `pnpm bundle:javascriptcore` is run in `packages/dictionary-core` and the app's bundle is committed.

What is still kept by hand, so a new source reaches it only when it is added there too:

- which dictionary page credits which source: `pageSources` and `withShownData` in
  `apps/web/src/lib/dictionary/sources.ts`, the ranked lists' in
  `apps/web/src/lib/dictionary/browse/copy.ts`, and the browse pages' own in
  `apps/web/src/components/dictionary/browse/`;
- the word cards' sources, `wordCardSources` in `packages/dictionary-core/src/cards/sources.ts`,
  with what a card takes from each and the notice file that ships with the cards;
- the license texts the app bundles, `BundledLicenseText.listed` in
  [`CreditsView.swift`](../apps/ios/Modules/Sources/SearchExperience/CreditsView.swift), and the
  licenses its Licenses screen links, `sourcesWithLinkedTerms` beside it. If a license requires
  shipping its text, add one copy under the app's `Resources`, list it there, and point the source
  record at that file instead of keeping a second copy;
- each frequency dictionary's own one-line source, shown in its details: `attribution` in
  `apps/ios/Modules/Sources/SearchExperience/Resources/FrequencyPackCatalog.json`, and `source` in
  `packages/dictionary-core/src/detail/frequency.ts`; and
- the notice files a language-data release ships, `language-data/notices/`, which repeat three
  credits as they were worded when each release was made, and change only with a new release.

| Category | Source | What it supplies | Current consumer | Credit |
| --- | --- | --- | --- | --- |
| Dictionaries and language analysis | [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) | Japanese written forms, readings, English meanings, usage, subject-field, and dialect labels, cross-references, and source priority evidence; and, from its `JMdict_e_examp` export, which Tatoeba sentence is a checked example of each meaning (the sentences themselves are Tatoeba's). | iOS, Website | JMdict |
| Dictionaries and language analysis | [UniDic](https://clrd.ninjal.ac.jp/unidic_archive/cwj/3.1.0/) | Source-matched pronunciation and pitch-accent facts used while importing JMdict, and the accent-combination types used to estimate pitch for two-part compounds. | iOS, Website | UniDic |
| Dictionaries and language analysis | [SudachiDict Core](https://github.com/WorksApplications/SudachiDict) | Lexical data required by Sudachi.rs to identify and describe Japanese words. It is not Zenbu's learner-facing Japanese-English dictionary. | iOS, Website | Sudachi |
| Dictionaries and language analysis | [MeCab IPADIC through kuromoji.js](https://github.com/takuyaa/kuromoji.js) | Bundled morphological data the shared core's tokenizer, a port of kuromoji.js's, reads to parse interactive Japanese text. It is not Zenbu's learner-facing Japanese-English dictionary. | iOS, Website | Kuromoji |
| Examples and corpora | [Tatoeba](https://tatoeba.org/en/downloads) | Japanese sentences, English translations, links, contributor information, license provenance, and the Japanese word index that links sentences to dictionary entries. | iOS, Website | Tatoeba |
| Kanji and handwriting | [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) | Kanji meanings, readings, stroke counts, school grade, and frequency. | iOS, Website | KANJIDIC2 |
| Kanji and handwriting | [KRADFILE and RADKFILE](https://www.edrdg.org/krad/kradinf.html) | Visible component membership and component stroke-count evidence. | iOS, Website | RADKFILE |
| Kanji and handwriting | [Kanjium](https://github.com/mifunetoshiro/kanjium) | Structural membership, variants, and source phonetic annotations used with app-owned kanji facts. | iOS, Website | Kanjium |
| Kanji and handwriting | [KanjiVG](https://kanjivg.tagaini.net/) | Ordered vector paths for writing kanji. | iOS, Website | KanjiVG |
| Kanji and handwriting | [DaKanji](https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition) | A model that predicts candidate Japanese characters from a completed drawing. | iOS | DaKanji |
| Study levels | [JLPT vocabulary lists with JMdict IDs](https://github.com/stephenmk/yomitan-jlpt-vocab) | Unofficial JLPT level estimates (N5–N1) from Jonathan Waller's lists. | iOS, Website | JLPT vocabulary lists |
| Study levels | [Jonathan Waller's JLPT kanji lists](https://web.archive.org/web/20200806005029/http://www.tanos.co.uk/jlpt/jlpt5/kanji/) | Unofficial JLPT level estimates (N5–N1) for 2,211 kanji, as the Internet Archive captured his site (CC BY). | iOS (kanji details), Website (kanji details and the JLPT kanji lists) | JLPT kanji lists |
| Frequency data | [TUBELEX](https://github.com/naist-nlp/tubelex) | Japanese word frequency data from occurrences across YouTube. | iOS, Website | TUBELEX |
| Frequency data | [Wikipedia Word Frequency Clean](https://github.com/adno/wikipedia-word-frequency-clean) | Japanese word frequency data from occurrences across Wikipedia. | iOS, Website | Wikipedia Word Frequency Clean |
| Frequency data | [Jiten](https://jiten.moe/frequency-dictionaries) | Optional domain frequency lists for TV and film, anime, manga, novels, visual novels, and video games, keyed by dictionary form and reading (CC BY-SA 4.0), downloaded on demand. | iOS, Website (the frequency dictionary pages rank words by them) | Jiten |
| App releases | [Apple's App Store lookup](https://performance-partners.apple.com/search-api) | The live app's version and minimum iOS version, from `itunes.apple.com/lookup` by bundle ID, kept for a day. Nothing the app shows, so it needs no app credit. | Website (the iPhone app's product page) | None |
| Video captions | [YouTube](https://www.youtube.com/) | Japanese captions for the video a learner opens in Player, and YouTube's English translation of them, fetched when the video opens and not stored. | iOS | None |
| Unverified app-owned data | [`Zenbu Word Relationships`](../language-data/sources/Zenbu-Word-Relationships-v1.json) | Two uncited relationships between dictionary entries. No source or reviewer is recorded, so the file is pending a separate removal decision. | iOS | None |

Which frequency sources iOS offers, and why, is recorded in the
[`frequency source analysis`](../language-data/FREQUENCY_SOURCE_DECISIONS.md).
