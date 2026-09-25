# Japanese frequency source decisions

Updated 2026-09-25 for issue #351. A public download is evidence of availability,
not evidence that Zenbu may redistribute the compiled data in an iOS app.

## Shipping decision

Zenbu ships the BSD-3-Clause TUBELEX pack and offers the BSD-3-Clause Wikipedia
pack. By product decision, nine of the ten checksum-pinned ordered-JSON archives
are offered as optional direct-source downloads. The generic YouTube list remains
analyzed but is not offered because TUBELEX is larger, documented, and licensed.
Zenbu does not bundle or mirror
their raw data: the app downloads each selected ZIP from the public catalog,
validates its exact checksum and shape, maps it locally, and retains only the
generated removable SQLite pack.

The catalog still does not publish an underlying compiler/rightsholder,
occurrence counts, tokenizer and tie semantics, or redistribution terms. Credits &
Attributions discloses those shared limitations, while each compact pack card contains
only operational status, installed storage, and actions. The runtime treats array position
as the explicit rank. Supplied readings remain in source-record digests but the v1 mapping
policy continues to use normalized written forms only and rejects ambiguous mappings.

## Source decision matrix

| Source | Publisher / canonical source | Snapshot and availability | Domain and scale | Semantics and bias | Distribution terms | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| TUBELEX Japanese | Adam Nohejl, NAIST NLP; <https://github.com/naist-nlp/tubelex> | Commit `7cb5fb36`; immutable raw GitHub artifact | YouTube subtitles; 100,660 videos, 30,550 channels, 165,721,393 tokens | UniDic 3.1 lemma/POS counts; media-category bias; pinned source-row order breaks ties | BSD-3-Clause with bundled notice; app redistribution allowed | **Approved and bundled** |
| Wikipedia Word Frequency Clean | Adam Nohejl and contributors; <https://github.com/adno/wikipedia-word-frequency-clean> | Commit `8b7a2811`; 2022-10-20 dump; immutable raw GitHub artifact | Encyclopedic written Japanese; 2,177,257 documents, 609,365,356 tokens | UniDic 3.1 NFKC surface counts; encyclopedic/formal bias; pinned source-row order breaks ties | BSD-3-Clause with bundled notice; app redistribution allowed | **Approved and optional download** |
| BCCWJ v1 frequency tables | NINJAL; <https://clrd.ninjal.ac.jp/bccwj/freq-list.html> | Version 1.0 downloads remain available | Balanced written corpus; 104.3 million words across books, magazines, news, web, textbooks, legal and other registers | Short/long-unit lexemes with POS, raw frequency and per-million frequency; manual reports about 2% analysis error and defines deterministic tie ordering | Page permits free research/education use. Commercial product use and redistribution are not granted by that statement; NINJAL has separate commercial contracts and restricts distribution | **No-go without written product/redistribution grant** |
| CEJC frequency tables | NINJAL; <https://www2.ninjal.ac.jp/conversation/cejc/cejc-wc.html> | Official tables available; current project page maintained | Recorded everyday conversation with demographic/context dimensions | Short-unit lexeme, written form, pronunciation and POS; conversational sampling bias | Published materials carry noncommercial/no-derivatives restrictions and corpus-specific terms; app redistribution is not established | **No-go** |
| Migaku public Japanese catalog (10 lists below) | Migaku public catalog/distributor; underlying compiler/publisher unidentified; <https://migaku-public-data.migaku.com/dicts/index.json> | Committed Japanese frequency-list snapshot SHA-256 `9f3d483fd31fcef5f08e88b7859e094abb81c07ea24ec477437b854d99441794`; all ten archive URLs available on 2026-09-25 | Streaming, fiction, anime dialogue, news, YouTube, dictionary definitions, visual novels, television and web | Ordered strings or `[written, reading]` pairs; no counts, corpus dates, document/token totals, tokenizer, normalization, tie policy or upstream attribution published | Catalog publishes downloads but no license or app-redistribution grant for compiled lists; Zenbu downloads selected packs directly and does not bundle or mirror them | **Nine optional direct-source downloads; generic YouTube excluded in favor of TUBELEX** |

The candidate catalog record at
`Candidates/Migaku-public-catalog-ja-frequency-lists-2026-09-25.json` preserves
the exact relevant public-catalog names, descriptions, and archive paths. Its
SHA-256 is pinned by `Candidates/Migaku-public-catalog-ja-ordered-json-v1.json`,
which also pins every archive URL, byte count, entry name, row count and
SHA-256. The analyzer rejects snapshot hash, identity, URL, and candidate-count
mismatches. The generated analysis at
`Generated/Migaku-public-catalog-ja-ordered-json-v1.analysis.json` pins its
inputs, analysis-tool, mapping-policy, TUBELEX, and Wikipedia artifact hashes.

## Ordered-JSON mapping results

Analysis normalizes written forms with NFKC, assigns one-based array position as
rank, preserves duplicate rows, and runs `FrequencyPackMappingV1`. Because v1 is
form/POS based and these rows have no POS, ambiguous forms are not guessed. The
reading field remains in the source-record digest but is not used to select an
entry. “Duplicate mappings” counts otherwise eligible source rows discarded
because a better-ranked row already mapped to the same `LanguageReferenceID`.

| Candidate | Rows | Mapped | Ambiguous | Unmapped | Duplicate mappings | Mapped coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Netflix | 102,844 | 52,053 | 8,194 | 27,384 | 15,213 | 50.61% |
| Novels | 16,469 | 9,132 | 1,349 | 5,663 | 325 | 55.45% |
| Slice of Life | 43,125 | 25,360 | 4,946 | 8,595 | 4,224 | 58.81% |
| NHK | 38,075 | 5,596 | 1,981 | 28,235 | 2,263 | 14.70% |
| Shonen | 56,396 | 32,098 | 4,749 | 13,126 | 6,423 | 56.92% |
| YouTube | 56,251 | 43,241 | 4,031 | 5,401 | 3,578 | 76.87% |
| JP Dict | 206,621 | 131,840 | 7,385 | 39,453 | 27,943 | 63.81% |
| Visual Novel | 35,058 | 28,539 | 3,482 | 2,306 | 731 | 81.41% |
| TV Shows | 99,999 | 68,087 | 5,665 | 16,258 | 9,989 | 68.09% |
| Internet | 160,836 | 89,015 | 8,723 | 41,492 | 21,606 | 55.35% |

Practical ordering comparisons use mapped `LanguageReferenceID`s. “Overlap” is
the percentage of the candidate's mapped IDs also present in the reference;
Jaccard compares mapped IDs whose raw source rank is at most 1,000; correlation
is Pearson correlation of raw source ranks for shared mapped IDs.

| Candidate | TUBELEX overlap | TUBELEX top-1k Jaccard | TUBELEX rank corr. | Wikipedia overlap | Wikipedia top-1k Jaccard | Wikipedia rank corr. |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Netflix | 78.86% | 0.3446 | 0.5201 | 96.50% | 0.1423 | 0.4589 |
| Novels | 93.66% | 0.2649 | 0.6332 | 81.71% | 0.0485 | 0.5033 |
| Slice of Life | 84.11% | 0.2902 | 0.2506 | 98.13% | 0.0817 | 0.2848 |
| NHK | 64.67% | 0.1444 | 0.0725 | 79.25% | 0.1605 | 0.1126 |
| Shonen | 83.96% | 0.3004 | 0.3316 | 97.70% | 0.0982 | 0.3008 |
| YouTube | 52.57% | 0.3996 | 0.2641 | 63.43% | 0.1689 | 0.3276 |
| JP Dict | 36.86% | 0.2004 | 0.4087 | 47.64% | 0.2129 | 0.5096 |
| Visual Novel | 90.81% | 0.3602 | 0.3836 | 97.12% | 0.0676 | 0.1819 |
| TV Shows | 49.60% | 0.2920 | 0.3986 | 60.27% | 0.0869 | 0.3627 |
| Internet | 58.44% | 0.4433 | 0.6702 | 74.38% | 0.2290 | 0.6208 |

The supplied YouTube list is not a substitute for TUBELEX: only 22,733 of its
43,241 mapped IDs overlap TUBELEX, its top-1,000 mapped Jaccard is 0.3996, and
shared raw ranks correlate at 0.2641. These are practical ordering differences,
not a quality judgment. TUBELEX remains the only offered YouTube pack because it
is more comprehensive and publishes corpus, tokenization, count, and license evidence.

## Storage and reproducibility

The ten compressed candidates total 5,702,392 bytes and their raw JSON totals
17,223,490 bytes. Projected runtime SQLite sizes use the current v1 evidence
schema, 4,096-byte pages, rank index, source-row removal, and `VACUUM`. They are
deterministic analysis projections, not approved shipping artifacts.

| Candidate | Compressed ZIP | Raw JSON | Projected runtime SQLite |
| --- | ---: | ---: | ---: |
| Netflix | 1,039,994 | 3,228,941 | 6,340,608 |
| Novels | 164,820 | 569,913 | 1,110,016 |
| Slice of Life | 411,869 | 1,274,114 | 3,055,616 |
| NHK | 349,003 | 1,617,165 | 688,128 |
| Shonen | 550,470 | 1,700,426 | 3,874,816 |
| YouTube | 300,673 | 884,304 | 5,292,032 |
| JP Dict | 1,203,851 | 3,389,244 | 16,388,096 |
| Visual Novel | 178,905 | 493,039 | 3,420,160 |
| TV Shows | 561,111 | 1,589,061 | 8,372,224 |
| Internet | 941,696 | 2,477,283 | 10,907,648 |
| **Total** | **5,702,392** | **17,223,490** | **59,449,344** |

The verified iOS Simulator debug build contains 793,920,633 file bytes. This is
a developer-build measurement, not an App Store download estimate. This change
adds **zero candidate archive or SQLite bytes** to the app bundle. For comparison,
the current bundled TUBELEX SQLite artifact is 8,122,368 bytes and the generated
optional Wikipedia artifact is 8,884,224 bytes.

Reproduce the analysis from a checkout that has the separately held archives:

```sh
python3 apps/ios/Tools/analyze_ordered_json_frequency_lists.py \
  --catalog apps/ios/LanguageData/Candidates/Migaku-public-catalog-ja-ordered-json-v1.json \
  --archives /path/to/japanese-frequency-word-lists \
  --language-data apps/ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3 \
  --tubelex apps/ios/Modules/Sources/SearchExperience/Resources/TUBELEXFrequencyPack.sqlite3 \
  --wikipedia /path/to/pinned-wikipedia-frequency.sqlite3 \
  --wikipedia-import-report apps/ios/LanguageData/Generated/Wikipedia-ja-20221020-310-nfkc.import.json \
  --output apps/ios/LanguageData/Generated/Migaku-public-catalog-ja-ordered-json-v1.analysis.json
```

Generate the Wikipedia comparison artifact with `import_frequency_pack.py`
from the source URL and manifest pinned in
`Sources/Wikipedia-ja-20221020-310-nfkc.source.json`. The analyzer requires its
SHA-256 to match the committed Wikipedia import report; regeneration during
this review produced a byte-identical report and artifact SHA-256
`d3dba5c4902b9323799d5c0ac53af2dd84a0c1bd208d047176a4a6a703f31eea`.

The tool rejects mismatched archive byte counts, archive SHA-256 values, ZIP
entry names, row shapes and row counts. It records hashes for the public-catalog
snapshot, candidate catalog, language database, mapping policy, and both
comparison artifacts.

## Runtime contract

Each optional catalog pack pins the public URL, ZIP byte count and SHA-256,
single archive entry and uncompressed byte count, ordered row count, mapping
coverage, logical mapping SHA-256, and logical artifact SHA-256. Installation
fails closed on any mismatch. Raw archives are discarded after local mapping;
installed packs remain removable and only an installed, validated pack can be
selected as active.

Every selectable manifest also pins a smoke-test `LanguageReferenceID` and expected rank.
The bundled pack, a freshly installed artifact, every restored installed artifact, and any pack
being activated must return that exact evidence row. A mismatch fails closed instead of exposing
an installed or active pack that cannot populate frequency evidence.
