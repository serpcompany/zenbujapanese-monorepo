# Japanese frequency source analysis

Updated 2026-09-27 for issue #376. The sections after "Historical: public-catalog packs (#351)"
record the earlier decision and stay for provenance.

## Runtime source selection

Every frequency pack Zenbu offers has an openly licensed source.

| Pack | Source | License | Runtime behavior |
| --- | --- | --- | --- |
| JLPT Levels | Waller's lists via stephenmk | CC BY-SA 4.0 | Bundled, enabled first |
| YouTube | TUBELEX | BSD-3-Clause | Bundled, enabled second |
| Japanese Wikipedia | Wikipedia Word Frequency Clean | BSD-3-Clause | Optional download |
| TV & Movies | Jiten Drama + Movie | CC BY-SA 4.0 | Optional download |
| Anime | Jiten Anime | CC BY-SA 4.0 | Optional download |
| Manga | Jiten Manga | CC BY-SA 4.0 | Optional download |
| Novels | Jiten Novel | CC BY-SA 4.0 | Optional download |
| Visual Novels | Jiten VisualNovel | CC BY-SA 4.0 | Optional download |
| Video Games | Jiten VideoGame | CC BY-SA 4.0 | Optional download |

The nine public-catalog packs (Netflix, TV Shows, Slice of Life, Shonen, Novels, Visual Novel,
NHK, JP Dict, Internet) were removed: their originals, Yomitan community lists, carry no
license. Pack IDs that leave the catalog are deleted from devices on launch. NHK, JP Dict, and
Internet have no licensed replacement; they can return only if their authors grant a license.

## Jiten packs

Jiten (jiten.moe) publishes JMdict-linked frequency lists per media type under CC BY-SA 4.0 as
`Word,Form,Rank` CSVs (dictionary form, kana reading, competition rank; no counts or POS).
Downloads are unversioned, so the snapshots used are pinned in
`Sources/Jiten-2026-09-27.source.json` and `Sources/Jiten-2026-09-27/`.

`build_jiten_frequency_packs.py` builds each pack:

- **Tail:** each list's final max-rank bucket (40–66k rows of words Jiten never observed) is
  dropped.
- **Rank:** row position after the tail is dropped, so every row keeps a distinct rank, matching
  the other ordered packs. Jiten's order inside a tie bucket is kept.
- **Merge (TV & Movies):** mean list percentile; a word missing from a list counts as that list's
  last position.
- **Mapping:** `FrequencyPackMappingV2` joins on dictionary form **and** reading, honoring
  JMdict reading restrictions. It is additive: V1 packs keep their pinned V1 policy.

Reading-aware mapping cuts ambiguous rows by 30–41% on every list (Novels: 12,859 → 7,600) and
resolves homographs such as 方 (ほう/かた) that V1 must skip.

## #376 candidate results

From `Generated/Frequency-candidates-376.analysis.json` (`analyze_frequency_candidates.py`,
plan `Candidates/Frequency-candidates-376.plan.json`). Top-1k is the Jaccard index of the top
1,000 mapped entries.

| Pack | Rows | Mapped | Ambiguous | Pack it replaced (mapped) | Top-1k vs replaced | Top-1k vs YouTube |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| TV & Movies | 193,752 | 108,209 | 6,593 | Netflix (52,053), TV Shows (68,087) | 0.38, 0.43 | 0.26 |
| Anime | 175,456 | 98,264 | 7,623 | Slice of Life (25,360) | 0.32 | 0.27 |
| Manga | 208,204 | 105,287 | 8,731 | Shonen (32,098) | 0.34 | 0.29 |
| Novels | 272,246 | 140,061 | 7,600 | Novels (9,132) | 0.25 | 0.26 |
| Visual Novels | 205,292 | 115,109 | 7,743 | Visual Novel (28,539) | 0.45 | 0.26 |
| Video Games | 141,113 | 89,254 | 6,219 | — (new) | — | 0.29 |

Distinctness decisions:

- **Drama vs Movie:** Movie overlaps Drama 95% by entry and 0.74 top-1k, so they ship merged as
  TV & Movies. Other measured Jiten pairs sit at 0.53–0.70 and ship separately
  (Video Games: 0.53 vs Visual Novels and TV & Movies, 0.63 vs Anime).
- **TUBELEX categories:** people+comedy (0.84 top-1k vs YouTube) and gaming (0.64) mostly repeat
  the bundled YouTube pack and were not shipped. News (0.47 vs YouTube, 0.16 vs NHK) is spoken
  YouTube news rather than NHK's written news, so it did not replace NHK.

Sources considered and rejected for #376: BCCWJ, CSJ, and CEJC (research/education only);
hermitdave FrequencyWords (broken tokenization); wordfreq (blended); NINJAL NWJC (license
unconfirmed); manythings.org news list and Wiktionary's unsourced "5000 Most Frequent Words"
(no source license); Game Gengo (per-episode stats; decks unlicensed).

## Historical: public-catalog packs (#351)

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
| Netflix | 78.91% | 0.3412 | 0.5205 | 96.50% | 0.1423 | 0.4589 |
| Novels | 93.67% | 0.2618 | 0.6328 | 81.71% | 0.0485 | 0.5033 |
| Slice of Life | 84.18% | 0.2874 | 0.2507 | 98.13% | 0.0817 | 0.2848 |
| NHK | 64.74% | 0.1448 | 0.0725 | 79.25% | 0.1605 | 0.1126 |
| Shonen | 84.02% | 0.2976 | 0.3322 | 97.70% | 0.0982 | 0.3008 |
| YouTube | 52.61% | 0.3955 | 0.2644 | 63.43% | 0.1689 | 0.3276 |
| JP Dict | 36.88% | 0.1978 | 0.4085 | 47.64% | 0.2129 | 0.5096 |
| Visual Novel | 90.81% | 0.3556 | 0.3835 | 97.12% | 0.0676 | 0.1819 |
| TV Shows | 49.64% | 0.2893 | 0.3993 | 60.27% | 0.0869 | 0.3627 |
| Internet | 58.47% | 0.4372 | 0.6698 | 74.38% | 0.2290 | 0.6208 |

The supplied YouTube list is not a substitute for TUBELEX: only 22,747 of its
43,241 mapped IDs overlap TUBELEX, its top-1,000 mapped Jaccard is 0.3955, and
shared raw ranks correlate at 0.2644. These are practical ordering differences,
not a quality judgment. TUBELEX remains the only offered YouTube pack because it
is more comprehensive.

## Storage and reproducibility

The ten compressed candidates total 5,702,392 bytes and their raw JSON totals
17,223,490 bytes. Projected runtime SQLite sizes use the current v1 evidence
schema, 4,096-byte pages, rank index, source-row removal, and `VACUUM`. They are
deterministic analysis projections, not runtime artifacts.

| Candidate | Compressed ZIP | Raw JSON | Projected runtime SQLite |
| --- | ---: | ---: | ---: |
| Netflix | 1,039,994 | 3,228,941 | 6,184,960 |
| Novels | 164,820 | 569,913 | 1,089,536 |
| Slice of Life | 411,869 | 1,274,114 | 3,002,368 |
| NHK | 349,003 | 1,617,165 | 671,744 |
| Shonen | 550,470 | 1,700,426 | 3,796,992 |
| YouTube | 300,673 | 884,304 | 5,181,440 |
| JP Dict | 1,203,851 | 3,389,244 | 15,994,880 |
| Visual Novel | 178,905 | 493,039 | 3,358,720 |
| TV Shows | 561,111 | 1,589,061 | 8,192,000 |
| Internet | 941,696 | 2,477,283 | 10,633,216 |
| **Total** | **5,702,392** | **17,223,490** | **58,105,856** |

The verified iOS Simulator debug build contains 793,920,633 file bytes. This is
a developer-build measurement, not an App Store download estimate. This change
adds **zero candidate archive or SQLite bytes** to the app bundle. For comparison,
the current bundled TUBELEX SQLite artifact is 8,134,656 bytes and the generated
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
