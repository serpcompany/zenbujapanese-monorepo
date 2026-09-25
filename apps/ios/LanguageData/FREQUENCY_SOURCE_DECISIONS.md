# Japanese frequency source decisions

Updated 2026-09-25 for issue #351. A public download is evidence of availability,
not evidence that Zenbu may redistribute the compiled data in an iOS app.

## Shipping decision

Zenbu continues to ship the BSD-3-Clause TUBELEX pack and offer the
BSD-3-Clause Wikipedia pack. No additional pack is approved in this review.
The ten real ordered-JSON archives supplied for the issue are checksum-pinned
and analyzed, but remain a **no-go pending rights**: the public catalog gives
download links and brief domain descriptions but no license, attribution chain,
modification terms, or app-redistribution permission for these compiled lists.

They must not be bundled, mirrored, or made a direct in-app download until the
applicable rightsholder publishes suitable terms. A user-file bypass is also not
implemented: it would activate data with unknown provenance and tokenizer/count
semantics as a trusted Zenbu ranking source, while the current v1 mapper cannot
use the supplied reading field to resolve ambiguity. This can be reconsidered
with an explicitly untrusted custom-list product contract.

## Source decision matrix

| Source | Publisher / canonical source | Snapshot and availability | Domain and scale | Semantics and bias | Distribution terms | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| TUBELEX Japanese | Adam Nohejl, NAIST NLP; <https://github.com/naist-nlp/tubelex> | Commit `7cb5fb36`; immutable raw GitHub artifact | YouTube subtitles; 100,660 videos, 30,550 channels, 165,721,393 tokens | UniDic 3.1 lemma/POS counts; media-category bias; pinned source-row order breaks ties | BSD-3-Clause with bundled notice; app redistribution allowed | **Approved and bundled** |
| Wikipedia Word Frequency Clean | Adam Nohejl and contributors; <https://github.com/adno/wikipedia-word-frequency-clean> | Commit `8b7a2811`; 2022-10-20 dump; immutable raw GitHub artifact | Encyclopedic written Japanese; 2,177,257 documents, 609,365,356 tokens | UniDic 3.1 NFKC surface counts; encyclopedic/formal bias; pinned source-row order breaks ties | BSD-3-Clause with bundled notice; app redistribution allowed | **Approved and optional download** |
| BCCWJ v1 frequency tables | NINJAL; <https://clrd.ninjal.ac.jp/bccwj/freq-list.html> | Version 1.0 downloads remain available | Balanced written corpus; 104.3 million words across books, magazines, news, web, textbooks, legal and other registers | Short/long-unit lexemes with POS, raw frequency and per-million frequency; manual reports about 2% analysis error and defines deterministic tie ordering | Page permits free research/education use. Commercial product use and redistribution are not granted by that statement; NINJAL has separate commercial contracts and restricts distribution | **No-go without written product/redistribution grant** |
| CEJC frequency tables | NINJAL; <https://www2.ninjal.ac.jp/conversation/cejc/cejc-wc.html> | Official tables available; current project page maintained | Recorded everyday conversation with demographic/context dimensions | Short-unit lexeme, written form, pronunciation and POS; conversational sampling bias | Published materials carry noncommercial/no-derivatives restrictions and corpus-specific terms; app redistribution is not established | **No-go** |
| Migaku public Japanese catalog (10 lists below) | Migaku public catalog/distributor; underlying compiler/publisher unidentified; <https://migaku-public-data.migaku.com/dicts/index.json> | Local catalog snapshot SHA-256 `5927c09666b666720178c870e78d7a861d21948464ff3b3fdabc3319e8474bfe`; all ten archive URLs available on 2026-09-25 | Streaming, fiction, anime dialogue, news, YouTube, dictionary definitions, visual novels, television and web | Ordered strings or `[written, reading]` pairs; no counts, corpus dates, document/token totals, tokenizer, normalization, tie policy or upstream attribution published | Catalog publishes downloads but no license or app-redistribution grant for compiled lists | **No-go pending rights and provenance** |

The candidate catalog record at
`Candidates/Migaku-public-catalog-ja-ordered-json-v1.json` pins every archive
URL, byte count, entry name, row count and SHA-256. The generated analysis at
`Generated/Migaku-public-catalog-ja-ordered-json-v1.analysis.json` pins its
inputs, analysis-tool, and mapping-policy hashes.

## Ordered-JSON mapping results

Analysis normalizes written forms with NFKC, assigns one-based array position as
rank, preserves duplicate rows, and runs `FrequencyPackMappingV1`. Because v1 is
form/POS based and these rows have no POS, ambiguous forms are not guessed. The
reading field remains in the source-record digest but is not used to select an
entry. “Duplicate mappings” counts otherwise eligible source rows discarded
because a better-ranked row already mapped to the same `LanguageReferenceID`.

| Candidate | Rows | Mapped | Ambiguous | Unmapped | Duplicate mappings | Mapped coverage | TUBELEX mapped-ID overlap | Top-1,000 Jaccard | Shared-rank correlation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Netflix | 102,844 | 52,053 | 8,194 | 27,384 | 15,213 | 50.61% | 78.86% | 0.3446 | 0.5201 |
| Novels | 16,469 | 9,132 | 1,349 | 5,663 | 325 | 55.45% | 93.66% | 0.2649 | 0.6332 |
| Slice of Life | 43,125 | 25,360 | 4,946 | 8,595 | 4,224 | 58.81% | 84.11% | 0.2902 | 0.2506 |
| NHK | 38,075 | 5,596 | 1,981 | 28,235 | 2,263 | 14.70% | 64.67% | 0.1444 | 0.0725 |
| Shonen | 56,396 | 32,098 | 4,749 | 13,126 | 6,423 | 56.92% | 83.96% | 0.3004 | 0.3316 |
| YouTube | 56,251 | 43,241 | 4,031 | 5,401 | 3,578 | 76.87% | 52.57% | 0.3996 | 0.2641 |
| JP Dict | 206,621 | 131,840 | 7,385 | 39,453 | 27,943 | 63.81% | 36.86% | 0.2004 | 0.4087 |
| Visual Novel | 35,058 | 28,539 | 3,482 | 2,306 | 731 | 81.41% | 90.81% | 0.3602 | 0.3836 |
| TV Shows | 99,999 | 68,087 | 5,665 | 16,258 | 9,989 | 68.09% | 49.60% | 0.2920 | 0.3986 |
| Internet | 160,836 | 89,015 | 8,723 | 41,492 | 21,606 | 55.35% | 58.44% | 0.4433 | 0.6702 |

The supplied YouTube list is not a substitute for TUBELEX: only 22,733 of its
43,241 mapped IDs overlap TUBELEX, its top-1,000 mapped Jaccard is 0.3996, and
shared raw ranks correlate at 0.2641. These are practical ordering differences,
not a quality judgment; TUBELEX remains preferable because it publishes corpus,
tokenization, count and license evidence.

## Storage and reproducibility

The ten compressed candidates total 5,702,392 bytes (about 5.7 MB decimal).
Their uncompressed JSON and projected SQLite sizes are not treated as shipping
estimates because no runtime artifacts are approved. Once a source is approved,
the importer must generate and record exact artifact bytes before catalog entry.

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
  --output apps/ios/LanguageData/Generated/Migaku-public-catalog-ja-ordered-json-v1.analysis.json
```

The tool rejects mismatched archive byte counts, archive SHA-256 values, ZIP
entry names, row shapes and row counts. It records hashes for the candidate
catalog, language database, mapping policy and TUBELEX comparison artifact.

## Remaining acceptance criteria

No new source can enter `FrequencyPackCatalog.json` until all of the following
are supplied and reviewed:

- rightsholder/publisher identity and upstream artifact provenance;
- an immutable version or snapshot and continued canonical availability;
- corpus date range, document/token totals and known sampling biases;
- tokenizer, normalization, lemma/surface/POS semantics and tie policy;
- explicit attribution, modification, app-redistribution and download-hosting rights;
- a reading-aware mapping decision (or an explicit decision to retain v1 form-only mapping);
- a deterministic runtime artifact/import report with exact installed bytes;
- catalog, bundled notice/credits, install/update/remove/corruption tests, and active-pack persistence verification.

Until then, the issue's “two additional approved sources” acceptance criterion
is blocked by a documented no-go and requires product/legal review rather than
weakening Zenbu's trust contract.
