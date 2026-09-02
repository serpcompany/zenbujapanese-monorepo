# Issue #212: source-backed frequency-pack research and decision gate

Date: 2026-09-02

Issue: [#212](https://github.com/serpcompany/zenbujapanese-monorepo/issues/212)

Status: research only; no dataset or presentation has been selected

## Recommendation

Adopt the current **TUBELEX Japanese UniDic 3.1 lemma list** as the leading default candidate, presented as **YouTube frequency** with an exact rank and a compact percentile/band derived deterministically from that pack. It is recent, learner-relevant, compact, reproducible, and published with source code and frequency lists under BSD-3-Clause. Keep a Japanese-Wikipedia pack as the leading optional written-domain candidate. Do not implement either choice until the owner confirms the default domain and presentation.

This is a recommendation, not authorization. The product decision must remain open because frequency is corpus-relative: a YouTube rank is not a universal property of a dictionary entry. Migaku's public materials reinforce the product principle that different lists represent different genres and can be activated independently, but they are only a quality reference; no Migaku data, UI, ranking, or implementation was inspected or copied ([Migaku settings](https://migaku.com/blog/youtube/the-settings-migaku-browser-extension), [Migaku frequency approach](https://migaku.com/blog/japanese/how-to-learn-japanese-vocabulary)).

## Current root cause

### Exact observed entries

The committed issue screenshot shows `どいたま` with `UNMARKED`. The exact pinned source and bundled artifact trace is:

| Learner-visible entry | JMdict `ent_seq` | Pinned source priority evidence | Bundled `is_common` / `rank_score` | Current badge |
| --- | ---: | --- | ---: | --- |
| `どいたま` / `どいたま` | 2848448 | no `re_pri`; usage is explicitly slang and abbreviation | `0` / `0` | `UNMARKED` |
| `見る` / `みる` | 1259290 | selected display form has priority evidence | `1` / `100` | `COMMON` |
| `蝶々` / `ちょうちょう` | 1597640 | selected display form has priority evidence | `1` / `95` | `COMMON` |
| `茨` / `いばら` | 1167940 | selected display form has no priority evidence | `0` / `0` | `UNMARKED` |

These values were read from the pinned `JMdict_e-2026-08-10.gz` and the bundled `LanguageReferenceData.sqlite3` at branch tip `7da1a07`. The current public journey independently asserts `COMMON` for `見る` and `蝶々`, and `UNMARKED` for `茨`.

The exact bounded audit result is important: the current production `DictionaryEntry.Frequency` enum and `FrequencyBadge` renderer have only `COMMON` and `UNMARKED`. There is no current `UNCOMMON` or `RARE` frequency enum case or rendering path. `Rare` does exist separately as a normalized JMdict **form-usage label**, and the historical Nihongo reference fixture calls `蝶々` an uncommon badge. Neither is a current Zenbu frequency category. Repository search cannot prove that no dynamically supplied string exists outside the inspected source/artifact, but the compiled model and presentation path are exhaustive for this badge.

### Importer to learner trace

1. [`import_jmdict.py`](../../apps/ios/Tools/import_jmdict.py) selects the first written/reading element that has `ke_pri`/`re_pri`. `choose_primary` returns a Boolean indicating only whether the selected element has any such priority marker.
2. The importer stores that Boolean as `entries.is_common`. It separately stores a heuristic `rank_score` and complete form-scoped JMdict priority profiles for **Dictionary Ranking**.
3. [`LookupClient.swift`](../../apps/ios/Modules/Sources/SearchExperience/LookupClient.swift) decodes `entries.is_common` as `DictionaryEntry.isCommon`.
4. [`DictionaryEntry.swift`](../../apps/ios/Modules/Sources/SearchExperience/DictionaryEntry.swift) maps `true -> COMMON` and every `false -> UNMARKED`.
5. [`WordDetailView.swift`](../../apps/ios/Modules/Sources/SearchExperience/WordDetailView.swift) renders the enum raw value in `FrequencyBadge`.

`UNMARKED` therefore means exactly **“the selected display form lacks a JMdict priority marker.”** It does not mean rare, not common, neutral usage, unmarked register, unknown to JMdict, or absent from Japanese. For `どいたま`, no importer loss was found: JMdict really supplies slang/abbreviation usage evidence and no priority marker. The bug is the app's presentation fallback and conceptual coupling, not a missing source bit.

JMdict itself defines its priority tags as relative-priority evidence and `nf01...nf48` as newspaper-frequency bands; it is not an independently sampled frequency dictionary. Existing ADR 0003 also explicitly keeps that evidence inside Dictionary Ranking. A Frequency Pack must not rewrite those profiles, `is_common`, `rank_score`, Match eligibility, Dictionary Best Matches, or Primary Dictionary Entry selection ([JMdict project](https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html), [ADR 0003](../adr/0003-dictionary-best-match-contract.md)).

## Primary-source candidate scorecard

Scores are product-fit judgments from the cited facts, not source-provided ratings. “Redistributable” is an engineering reading, not legal advice.

| Candidate | Corpus/domain and coverage | Units and reproducibility | Rights / size / maintenance | Disposition |
| --- | --- | --- | --- | --- |
| **TUBELEX Japanese, UniDic 3.1 lemma+POS** | 165,721,393 subtitle tokens from 100,660 YouTube videos and 30,550 channels; 351,453 word rows plus total; category counts and video/channel dispersion; everyday spoken/media bias | word/lemma, occurrence count, videos, channels, majority POS, category counts; pinned commit `7cb5fb36add76b83a266d1967536e1a1d3faa513`; selected XZ SHA-256 `39d4edb2ccac4405b47d0f93e9ec7b11678b3b305d1a37c877dd76588817c8e9` | BSD-3-Clause repo/list; 3,658,276-byte XZ; current repository replaces an explicitly outdated predecessor; paper published 2025; no GitHub release assets or CI workflow were returned in the 2026-09-02 API audit | **Adopt as leading default**, subject to owner choice and final notice review |
| **Wikipedia Word Frequency Clean, Japanese UniDic 3.1 NFKC** | 609,365,356 tokens from 2,177,257 Japanese Wikipedia articles; 560,821 frequency rows plus total; formal/encyclopedic written bias | token, raw count, document count; pinned 2022-10-20 dump-derived artifact at commit `8b7a28118736ef4bc9b70ebb4abc33d32b53200c`; selected XZ SHA-256 `2524bd18fa54ac15125c60cf137fb3ea2b0473ba7f7cb95e8eff7657fdf808ca` | BSD-3-Clause pipeline/artifact repo; selected XZ 3,452,188 bytes; reproducible script supplied, but data snapshot is 2022 and no automated CI was visible in the API audit | **Adapt as curated optional written pack**; refresh from a pinned Wikimedia dump only in a separately reviewed pipeline |
| **Leipzig Corpora Collection** | Japanese downloads are offered; corpus families include web, news/newscrawl, Wikipedia and mixed domains. Word files are frequency ordered; automatic crawl/cleaning introduces source and tokenization bias | archive contains corpus metadata and a word-frequency file; a specific snapshot must be selected before rank, coverage, bytes, and checksum can be claimed | Official terms make downloadable text corpora CC BY, distinct from the CC BY-NC query/API data. The reachable `jpn_wikipedia_2021_1M.tar.gz` was 252,537,981 bytes by HTTP metadata; the Japanese chooser was bot-gated during this audit | **Adapt after manual snapshot selection**; good domain-pack source, not ready as an unspecified “Leipzig” pack |
| **FrequencyWords Japanese / OpenSubtitles 2018** | 34,504 surface-token rows, movie/TV/anime subtitle bias; raw counts | `word count`; pinned repo commit `525f9b560de45753a5ea01069454e72e9aa541c6`; file SHA-256 `581dd106a134ff9f2706e23cde9fe95cd24d96ead6357cd3bd3bba9e166a764e` | Repository declares content CC BY-SA 4.0 and code MIT; 402,792 bytes; last data era 2018, last commit 2022, and no releases/tests/CI were visible | **Defer** behind TUBELEX: older and much smaller; legal review should confirm the upstream OpenSubtitles attribution chain |
| **wordfreq Japanese** | opaque blend of Wikipedia, subtitles, web, Twitter and Reddit through about 2021; useful general Zipf estimate but domain contributions cannot be selected independently | packed frequency bins/Zipf values; Japanese uses MeCab/ipadic; large Japanese data member is 1,217,884 bytes | Apache-2.0 code; data CC BY-SA 4.0 with detailed NOTICE. The author says the data is frozen and warns that a bare CSV export cannot carry required attribution | **Defer**, not default: stale, mixed-domain, and awkward as a standalone app-owned pack |
| **Tatoeba-derived Japanese counts** | current official Japanese export measured 248,888 example/translation sentences; conversational-learning bias, not population usage | stable sentence IDs and weekly export; a new tokenizer-derived count list would need its own transparent pipeline and must not be marketed as an official Tatoeba rank | sentence data CC BY 2.0 FR/CC0 by record; measured 3,417,299-byte BZ2 and SHA-256 `9e5b674883bc0d156a2916adb3eeede2ee8193ec5acaec08d6b1e116f5ee25c9` on 2026-09-02 | **Adapt only as an explicitly example-corpus pack**; do not use as default general frequency |
| **BCCWJ** | 104.3M-word balanced contemporary written corpus across books, magazines, newspapers, reports, blogs, forums, textbooks and laws; mostly 1986–2006; Short/Long Unit Word lists | official word-frequency downloads and morphological units; high-quality stable mapping inputs but dated written-language sample | Commercial use is contract-priced (currently ¥400k/2 years, ¥4m perpetual up to 10 internal users, ¥8m unlimited). Agreement distinguishes allowed derivative works from forbidden corpus/analog redistribution and has newspaper restrictions | **Defer pending signed commercial agreement and written approval of the exact pack** |
| **CSJ** | 661 hours / 3,302 recordings; 7.52M SUW and 6.31M LUW; about 90% academic/simulated monologue rather than everyday dialogue | official morphology and frequency resources; ~120GB full ninth edition | Commercial agreement/fee required; derivative distribution requires advance notice and attribution while corpus/analogs are forbidden | **Defer pending contract**; high-quality spoken benchmark, weak default learner-dialogue fit |
| **JPDB-derived exports** | proprietary service-derived ranks; public third-party exports acknowledge gaps and update limits | no acceptable first-party redistributable snapshot or reproducible source contract established | JPDB terms prohibit automated access/scraping; inspected export repo has no root license granting the needed data rights | **Reject** unless JPDB grants written rights |

Primary sources: [TUBELEX repo and formats](https://github.com/naist-nlp/tubelex/tree/7cb5fb36add76b83a266d1967536e1a1d3faa513), [TUBELEX paper](https://aclanthology.org/2025.coling-main.641/), [Wikipedia frequency pipeline](https://github.com/adno/wikipedia-word-frequency-clean/tree/8b7a28118736ef4bc9b70ebb4abc33d32b53200c), [Wikimedia dumps](https://dumps.wikimedia.org/jawiki/), [Wikimedia reuse terms](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use/en#7._Licensing_of_Content), [Leipzig terms](https://wortschatz.uni-leipzig.de/en/usage), [Leipzig download format](https://www.wortschatz.uni-leipzig.de/documents/Format_Download_File-eng.pdf), [Leipzig data FAQ](https://wortschatz.uni-leipzig.de/en/faq-data), [FrequencyWords source/license](https://github.com/hermitdave/FrequencyWords), [OPUS OpenSubtitles](https://opus.nlpl.eu/datasets/OpenSubtitles), [wordfreq NOTICE](https://github.com/rspeer/wordfreq/blob/912caf64b657478d1dff1138efdc078947d54bb1/NOTICE.md), [wordfreq sunset](https://github.com/rspeer/wordfreq/blob/912caf64b657478d1dff1138efdc078947d54bb1/SUNSET.md), [Tatoeba downloads](https://tatoeba.org/en/downloads), [BCCWJ overview](https://clrd.ninjal.ac.jp/bccwj/en/), [BCCWJ frequency lists](https://clrd.ninjal.ac.jp/bccwj/en/freq-list.html), [BCCWJ fees](https://clrd.ninjal.ac.jp/bccwj/en/fee.html), [BCCWJ commercial agreement](https://clrd.ninjal.ac.jp/bccwj/en/doc/contract/BCCWJ_Commercial_3.pdf), [CSJ data](https://clrd.ninjal.ac.jp/csj/en/data-index.html), [CSJ commercial agreement](https://clrd.ninjal.ac.jp/csj/en/doc/contract/CSJ_Commercial_1.pdf), [JPDB terms](https://jpdb.io/terms-of-use).

### Anchor behavior in the two leading packs

These are raw source facts, not proposed badge thresholds:

| Form | TUBELEX UniDic 3.1 lemma count / row | Wikipedia UniDic 3.1 NFKC count / row |
| --- | ---: | ---: |
| `見る` | 552,294 / 42 | 40,878 / 1,424 |
| `蝶々` | 501 / 11,498 | 925 / 28,809 |
| `茨` | 335 / 14,729 | 479 / 43,638 |
| `どいたま` | absent from exact-form list | absent from exact-form list |

TUBELEX lemmatizes kana `いる` to several lexical forms, including `居る`, `要る`, and `射る`; the current Zenbu entry `いる` exposes linked forms and a reading. This demonstrates why a row number cannot be copied directly onto every same-spelling dictionary entry. Missing exact-form evidence for `どいたま` must produce **No data in YouTube pack**, not `Rare`, `Unmarked`, or an invented tail rank.

## Proposed source-neutral Frequency Pack contract

The contract follows ADR 0001's app-owned Language Reference Data boundary and remains separate from ADR 0003's Dictionary Ranking.

### Manifest

`FrequencyPackManifest/v1` should contain:

- immutable app-owned `packID`, schema version, pack version, display name, locale, domain (`spoken.youtube`, `written.wikipedia`, `written.news`, `web`, etc.), and a plain-language bias/coverage statement;
- source owner/project identity, source snapshot/revision, retrieval URL, retrieval time, original byte count and SHA-256;
- license SPDX/custom identifier, attribution text/URL, bundled-notice resource, commercial/redistribution/share-alike flags reviewed for that snapshot, and transformation notice;
- raw corpus totals and the exact measurement unit: surface or lemma, token count, document/video/channel dispersion, POS treatment, normalization and tokenizer/dictionary versions;
- mapping-policy version, importer/tool checksums, mapped/unmapped/ambiguous row and Language Reference Data coverage counts, mapping checksum, artifact byte count/checksum, and deterministic validation fixtures;
- presentation capabilities actually supported by the source: count, exact rank, percentile, dispersion, category values. A pack must not claim a field it did not supply or deterministically derive from its complete validated rows.

### App-owned evidence

`FrequencyEvidence/v1` belongs outside `DictionaryEntry` provider fields and should expose:

- `packID` and pack version;
- `LanguageReferenceID`;
- matched normalized form, reading when available, POS when used, and typed mapping relation (`exactWrittenReading`, `exactReading`, `exactWrittenPOS`, `uniqueFormFallback`);
- raw source measure(s), deterministic exact rank with a documented tie policy, total measured tokens/documents and covered entries;
- optional derived percentile/band plus its explicit policy version;
- source-row identity or content digest as provenance, never as product identity.

The adapter maps source rows to existing app-owned IDs using form/reading/POS evidence. Provider row IDs and JMdict `ent_seq` cannot become Frequency Pack identity. Ambiguous homographs fail closed and remain unmapped; they are not split by Dictionary Ranking order. A pack rebuild may change evidence after its manifest version changes, but it cannot change durable notes, saved items, or canonical dictionary identity.

### Deterministic validation

Generation should fail unless:

- manifest, source, importer, mapping and final-artifact checksums agree;
- source rows are normalized once, totals reconcile, ranks have a documented deterministic tie rule, and duplicate source keys are resolved by an explicit policy;
- every mapped ID exists in the exact Language Reference Data snapshot; mapping relations are independently replayable; ambiguous fixtures remain unmapped;
- mapped/unmapped/ambiguous counts and exact anchor rows match the manifest;
- required attribution/notices are bundled and the final artifact passes integrity checks;
- no Frequency Pack field appears in Dictionary Ranking metadata or changes the ranked lookup fixtures.

## Learner behavior and lifecycle

Recommended version-1 behavior:

- One **active pack** drives the compact Word Detail value. Simultaneous multi-pack values are deferred because they create dense, incomparable numbers without an established learner need.
- The value is source-labelled: for example `YouTube rank 11,498` plus an accessible explanation such as `TUBELEX YouTube subtitles; lower rank means more frequent in this pack`. If the owner prefers a quieter default, show a deterministic percentile/band with exact rank in disclosure. Do not reuse `Common/Uncommon/Rare` until thresholds and wording are explicitly approved.
- No evidence is rendered honestly as `No data in YouTube pack`; it is distinct from pack unavailable.
- The default pack is bundled offline if final license/app-size review accepts the ~3.5MB compressed input and the normalized artifact size. Lookup must not require network access.
- Optional first-party curated manifests can be listed, downloaded to a temporary location, checksum/signature validated, atomically installed, activated, switched, and removed. Failed download/validation/update leaves the previous active pack intact.
- Removing the active optional pack atomically falls back to the bundled default. The bundled default is not removable. Relaunch restores the last valid selection, never a half-installed update.
- A missing, corrupt, incompatible, or failed pack shows frequency unavailable but Search, Word Detail, saved learner data and Dictionary Ranking remain usable and unchanged.
- Updates are opt-in or explicitly disclosed; a changed source snapshot creates a new pack version and may change ranks. The old artifact remains active until the replacement validates.
- Version 1 should accept only Zenbu-curated manifests. User-imported packs require a later threat model, file-size/resource limits, schema UX, provenance trust model and support boundary.

Dictionary Sources should show active/default pack, domain, version/snapshot, coverage/bias, license/attribution, and update state. This is source disclosure, not a new Dictionary Ranking explanation.

## Exact future red-capable TDD seams

The TDD skill requires owner confirmation of public seams before tests are written. Proposed seams, in vertical-slice order, are:

1. **Importer command seam** — given a tiny independently authored source fixture and Language Reference Data fixture, the command emits a byte-stable manifest/artifact; checksum drift, ambiguous homographs, missing attribution, total mismatch and unknown IDs each fail red.
2. **Frequency capability seam** — `frequencyEvidence(LanguageReferenceID, activePackID)` returns exact typed evidence, honest `.noEvidence`, or typed pack-unavailable failure. First red anchors: `見る`, `蝶々`, `茨`, `どいたま`, and ambiguous `いる` forms. No test calls importer-private helpers.
3. **Dictionary isolation seam** — the existing public Lookup journeys and ranking fixture outputs are byte/order identical with a pack present, absent, corrupt and switched. This test protects Dictionary Match/Ranking rather than inspecting an internal SQL table.
4. **Word Detail learner seam** — opening the exact four entries renders the selected source semantics, never `UNMARKED`; absent evidence and unavailable pack have distinct accessible labels at default and Accessibility XXXL.
5. **Pack-management journey seam** — from Dictionary Sources, a learner can download, validate, activate, switch, remove and relaunch; a checksum failure and interrupted update retain the prior active pack; offline launch still uses the valid bundled/default pack.
6. **Attribution seam** — the public Sources screen exposes the active pack identity, snapshot, domain/bias and required license/notice content from the validated manifest.

Each is a learner-visible or executable public boundary. Tests should be written one failing behavior at a time, followed by the minimum implementation for that slice. Do not write a horizontal batch of model/helper tests before the owner confirms these seams.

## Owner decisions required before implementation

1. **Default domain:** TUBELEX YouTube/everyday-media (recommended), balanced written Japanese via a licensed BCCWJ agreement, or another named corpus?
2. **Presentation:** exact source-labelled rank + disclosure percentile/band (recommended), percentile/band only, or an explicitly thresholded label? If labels are wanted, what source-relative thresholds and words are acceptable?
3. **Active display:** one active pack (recommended) or multiple simultaneous values?
4. **Pack policy:** Zenbu-curated downloadable packs only for version 1 (recommended), or user imports now?
5. **Default delivery:** bundle the validated default for guaranteed offline use (recommended) or require first download to reduce app size?
6. **Commercial-source appetite:** should Zenbu pursue written approval/fees for BCCWJ or CSJ, or stay on the no-contract open-data path?

Until those are answered, #212 should remain open and `needs-triage`; no production Swift, tests, data, importer, issue label or dependency should change.

## Audit boundary

This research inspected the current branch and remote issue/PR evidence for #218, #212, #237, #173, #227 and PR #232; ADRs 0001–0003; current DictionaryEntry, Lookup, Dictionary Ranking, JMdict importer/manifests/artifact, Word Detail, Sources and relevant unit/UI tests. It used Migaku public product pages only as a learner-experience reference. It did not inspect proprietary Migaku bytes or infer private rankings.

Absence claims are limited to the cited repository revisions, APIs/files reachable on 2026-09-02, and the exact current Zenbu branch. License conclusions require counsel/owner confirmation before distribution, especially for subtitle provenance, share-alike derivatives and paid NINJAL agreements.
