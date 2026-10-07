# Data sources

A data source supplies information, data, content, etc. for a technology to process or present.

This is the index for the whole repository: one row per source and the apps that use it.
Source names link to the official publisher or project. Each app's source records hold the
exact versions, URLs, checksums, licenses, and transformations; for iOS, see the
[`source index`](../apps/ios/LanguageData/Sources/README.md).

When adding, removing, or relicensing a source, update iOS **Credits & Attributions**
([`CreditsView.swift`](../apps/ios/Modules/Sources/SearchExperience/CreditsView.swift)) in the
same PR: a one-line credit, the license name, and a project link, with no versions or dates. If
the license requires shipping its text, add one copy under the app's `Resources`, list it on the
Licenses screen, and point the source record at that file instead of keeping a second copy.

| Category | Source | What it supplies | Current consumer |
| --- | --- | --- | --- |
| Dictionaries and language analysis | [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) | Japanese written forms, readings, English meanings, usage, subject-field, and dialect labels, cross-references, and source priority evidence. | iOS, Website |
| Dictionaries and language analysis | [UniDic](https://clrd.ninjal.ac.jp/unidic_archive/cwj/3.1.0/) | Source-matched pronunciation and pitch-accent facts used while importing JMdict, and the accent-combination types used to estimate pitch for two-part compounds. | iOS, Website |
| Dictionaries and language analysis | [SudachiDict Core](https://github.com/WorksApplications/SudachiDict) | Lexical data required by Sudachi.rs to identify and describe Japanese words. It is not Zenbu's learner-facing Japanese-English dictionary. | iOS, Website |
| Dictionaries and language analysis | [MeCab IPADIC through kuromoji.js](https://github.com/takuyaa/kuromoji.js) | Bundled morphological data used by Kuromoji to parse interactive Japanese text. It is not Zenbu's learner-facing Japanese-English dictionary. | iOS, Website |
| Examples and corpora | [Tatoeba](https://tatoeba.org/en/downloads) | Japanese sentences, English translations, links, contributor information, license provenance, and the Japanese word index that links sentences to dictionary entries. | iOS, Website |
| Kanji and handwriting | [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) | Kanji meanings, readings, stroke counts, school grade, frequency, and JLPT classification. | iOS, Website |
| Kanji and handwriting | [KRADFILE and RADKFILE](https://www.edrdg.org/krad/kradinf.html) | Visible component membership and component stroke-count evidence. | iOS, Website |
| Kanji and handwriting | [Kanjium](https://github.com/mifunetoshiro/kanjium) | Structural membership, variants, and source phonetic annotations used with app-owned kanji facts. | iOS, Website |
| Kanji and handwriting | [KanjiVG](https://kanjivg.tagaini.net/) | Ordered vector paths for writing kanji. | iOS, Website |
| Kanji and handwriting | [DaKanji](https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition) | A model that predicts candidate Japanese characters from a completed drawing. | iOS |
| Study levels | [JLPT vocabulary lists with JMdict IDs](https://github.com/stephenmk/yomitan-jlpt-vocab) | Unofficial JLPT level estimates (N5–N1) from Jonathan Waller's lists. | iOS, Website |
| Study levels | [Jonathan Waller's JLPT kanji lists](https://web.archive.org/web/20200806005029/http://www.tanos.co.uk/jlpt/jlpt5/kanji/) | Unofficial JLPT level estimates (N5–N1) for 2,211 kanji, as the Internet Archive captured his site (CC BY). | iOS (bundled, not shown), Website (the JLPT kanji lists) |
| Frequency data | [TUBELEX](https://github.com/naist-nlp/tubelex) | Japanese word frequency data from occurrences across YouTube. | iOS, Website |
| Frequency data | [Wikipedia Word Frequency Clean](https://github.com/adno/wikipedia-word-frequency-clean) | Japanese word frequency data from occurrences across Wikipedia. | iOS, Website |
| Frequency data | [Jiten](https://jiten.moe/frequency-dictionaries) | Optional domain frequency lists for TV and film, anime, manga, novels, visual novels, and video games, keyed by dictionary form and reading (CC BY-SA 4.0), downloaded on demand. | iOS, Website (the frequency dictionary pages rank words by them) |
| Video captions | [YouTube](https://www.youtube.com/) | Japanese captions for the video a learner opens in Player, and YouTube's English translation of them, fetched when the video opens and not stored. | iOS |
| Unverified app-owned data | [`Zenbu Word Relationships`](../apps/ios/LanguageData/Sources/Zenbu-Word-Relationships-v1.json) | Two uncited relationships between dictionary entries. No source or reviewer is recorded, so the file is pending a separate removal decision. | iOS |

Which frequency sources iOS offers, and why, is recorded in the
[`frequency source analysis`](../apps/ios/LanguageData/FREQUENCY_SOURCE_DECISIONS.md).
