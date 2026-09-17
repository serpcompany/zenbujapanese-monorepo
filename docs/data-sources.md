# Data sources

A data source supplies information, data, content, etc. for a technology to process or present.

Source names link to the official publisher or project. For iOS, the
[`source index`](../apps/ios/LanguageData/Sources/README.md) and its records are
authoritative for exact versions, URLs, checksums, licenses, and transformations.

| Category | Source | What it supplies | Current consumer |
| --- | --- | --- | --- |
| Dictionaries and language analysis | [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) | Japanese written forms, readings, English meanings, usage information, cross-references, and source priority evidence. | iOS |
| Dictionaries and language analysis | [UniDic](https://clrd.ninjal.ac.jp/unidic_archive/cwj/3.1.0/) | Source-matched pronunciation and pitch-accent facts used while importing JMdict. | iOS |
| Dictionaries and language analysis | [SudachiDict Core](https://github.com/WorksApplications/SudachiDict) | Lexical data required by Sudachi.rs to identify and describe Japanese words. It is not Zenbu's learner-facing Japanese-English dictionary. | iOS |
| Examples and corpora | [Tatoeba](https://tatoeba.org/en/downloads) | Japanese sentences, English translations, links, contributor information, and license provenance. | iOS |
| Kanji and handwriting | [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) | Kanji meanings, readings, stroke counts, school grade, frequency, and JLPT classification. | iOS |
| Kanji and handwriting | [KRADFILE and RADKFILE](https://www.edrdg.org/krad/kradinf.html) | Visible component membership and component stroke-count evidence. | iOS |
| Kanji and handwriting | [Kanjium](https://github.com/mifunetoshiro/kanjium) | Structural membership, variants, and source phonetic annotations used with app-owned kanji facts. | iOS |
| Kanji and handwriting | [KanjiVG](https://kanjivg.tagaini.net/) | Ordered vector paths for writing kanji. | iOS |
| Kanji and handwriting | [DaKanji](https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition) | A model that predicts candidate Japanese characters from a completed drawing. | iOS |
| Frequency data | [TUBELEX](https://github.com/naist-nlp/tubelex) | Japanese word frequency data from occurrences across YouTube. | iOS |
| Frequency data | [Wikipedia Word Frequency Clean](https://github.com/adno/wikipedia-word-frequency-clean) | Japanese word frequency data from occurrences across Wikipedia. | iOS |
| Unverified app-owned data | [`Zenbu Word Relationships`](../apps/ios/LanguageData/Sources/Zenbu-Word-Relationships-v1.json) | Two uncited relationships between dictionary entries. No source or reviewer is recorded, so the file is pending a separate removal decision. | iOS |
