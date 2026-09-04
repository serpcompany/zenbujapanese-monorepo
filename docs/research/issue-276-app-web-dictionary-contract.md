# Issue #276: app/web dictionary contract research

Status: research recommendation for owner review

Issue: [#276](https://github.com/serpcompany/zenbujapanese-monorepo/issues/276)

Parent: [#271](https://github.com/serpcompany/zenbujapanese-monorepo/issues/271)
Implementation baseline inspected: local `issue-271-website-dictionary-plan` at `aff74dc33d434684b926eb3d7d03afc8e65003df`, branched from `refactor/native-swiftui-components`

## Answer first

The website should begin as another presentation of Zenbu's existing **Language Reference Data**, **Dictionary Match**, **Dictionary Ranking**, and entry-association contracts. It should not begin by rebuilding a Japanese dictionary from raw source files or by copying Swift/SQLite implementation details.

For the same published dictionary-data and policy version, app and web should agree on:

- the canonical Language Reference Data identity behind a result or entry;
- which entries are eligible for a query;
- the order and grouping of Dictionary Best Matches and Additional Matches;
- headword, reading, ordered senses/glosses, parts of speech, notes, forms, commonness, pitch facts, and qualified relationships;
- which examples are associated with an exact entry and their order;
- whether optional metadata is present, absent, or unavailable;
- source snapshot, transform/policy version, provenance, and attribution obligations.

They do **not** need to share Swift types, a SQLite file, runtime libraries, UI layout, loading choreography, speech voice, browser/mobile navigation controls, caches, or persistence. Those are platform adapters and presentation.

The largest unresolved product problem is public entry addressing. The planned path contains only a Japanese surface (`/dictionary/{entry}`), but the app proves that one surface can identify multiple unrelated Language Reference Data entries (`モール`). Conversely, the current greeting's displayed headword is `今日は` and reading is `こんにちは`, while the proposed example URL uses `こんにちは`. Before app Share or entry-page TDD, the owner must decide whether a surface URL is a family/disambiguation page, how one exact app entry is selected, and which form is canonical. This research intentionally does not choose an ID, fragment, redirect, or slug mechanism.

## Evidence authority and limitations

This report uses repository source code, accepted ADRs, pinned source manifests, generated import manifests, public XCTest behavior, retained journey evidence, issue #271/#276, and PR #232 as primary evidence. The domain vocabulary comes from [`CONTEXT.md`](../../CONTEXT.md).

The local clone intentionally skipped Git LFS smudging; therefore the 480,985,088-byte database was not opened in this research run. Its committed LFS pointer, generated contract, import manifest, source manifests, tests, and previously retained journey evidence were inspected instead. The generated contract binds the database SHA-256, policy, schema, evidence counts, mapping checksum, search indexes, and tool checksums ([runtime contract](../../apps/ios/Modules/Sources/SearchExperience/Resources/DictionaryRankingArtifactContract.json); [import manifest](../../apps/ios/LanguageData/Generated/JMdict_e-2026-08-10.import.json#L19-L82)).

The local baseline is `aff74dc`. During research, the remote PR head advanced to `b9cb0de90eee3cfac8bd4dd20d9eb8b782f69bdd` with a test-related commit titled `test(ios): force accessibility appearances`. That later commit was not fetched into this isolated branch. Recheck PR #232 and its final merge commit before `/to-spec`; this report does not claim merge readiness or current-head test completion.

## Existing contract boundaries

### 1. Language Reference Data and identity

`DictionaryEntry` already exposes the platform-neutral entry facts: app-owned `LanguageReferenceID`, provenance, headword, reading, summary, meanings, parts of speech, written/reading forms, senses, relationships, optional pitch, and commonness ([`DictionaryEntry.swift`](../../apps/ios/Modules/Sources/SearchExperience/DictionaryEntry.swift#L3-L17)). A sense contains meaning, notes, and parts of speech, and a relationship can retain an exact target ID and target sense ([same file](../../apps/ios/Modules/Sources/SearchExperience/DictionaryEntry.swift#L112-L145)).

Equivalent source records normalize to one canonical public identity while retaining sorted provenance ([`DictionaryEntry.swift`](../../apps/ios/Modules/Sources/SearchExperience/DictionaryEntry.swift#L155-L189)). The import manifest records 218,382 retained entries, 752,077 normalized forms, 253,020 canonical senses, 441,826 gloss atoms, 36,668 relationships, 79,830 pitch-bearing entry rows, and 232,703 example pairs ([JMdict import manifest](../../apps/ios/LanguageData/Generated/JMdict_e-2026-08-10.import.json#L19-L81)).

**Recommendation:** expose an implementation-neutral entry record and version descriptor to both platforms. Preserve `LanguageReferenceID` as the cross-platform identity even if human URLs use a surface form. Do not use JMdict `ent_seq`, a database row, or a URL slug as identity.

### 2. Query normalization, Match, Ranking, and presentation groups

The current `SearchQuery` applies Unicode compatibility precomposition, lowercase conversion, whitespace collapse, Japanese/mixed-script classification, and a bounded romaji deinflection candidate policy ([`SearchQuery.swift`](../../apps/ios/Modules/Sources/SearchExperience/SearchQuery.swift#L3-L20), [`SearchQuery.swift`](../../apps/ios/Modules/Sources/SearchExperience/SearchQuery.swift#L37-L78)).

Dictionary Ranking is explicitly app-owned under accepted ADR 0003. Written form, reading, romaji, and English gloss evidence stay typed and separate; source/database order and provider IDs are forbidden ranking inputs ([ADR 0003](../adr/0003-dictionary-best-match-contract.md)). The current search implementation:

- offers a source-backed Japanese reading refinement for exact romaji;
- uses direct ranked results first, then bounded romaji deinflection when no exact/prefix evidence exists;
- falls back to Japanese Text Analysis for multiword or mixed-script discovery;
- de-duplicates by `LanguageReferenceID`;
- groups every entry sharing the leading presentation rank as Best Matches and puts remaining ranked entries in Additional Matches, normally capped to 60 total ([`LookupClient.swift`](../../apps/ios/Modules/Sources/SearchExperience/LookupClient.swift#L128-L205), [`LookupClient.swift`](../../apps/ios/Modules/Sources/SearchExperience/LookupClient.swift#L278-L291)).

The model distinguishes ranked results from Discovered Words, optional reading refinement, example association with the Primary Dictionary Entry, and exact/prefix evidence ([`DictionaryEntry.swift`](../../apps/ios/Modules/Sources/SearchExperience/DictionaryEntry.swift#L192-L220)). Search UI separately presents example access, reading refinement, Discovered Words, Best Matches, Additional Matches, and per-entry frequency evidence ([`SearchView.swift`](../../apps/ios/Modules/Sources/SearchExperience/SearchView.swift#L630-L713)).

**Recommendation:** the shared contract is normalized query in, typed result presentation out—not SQL, FTS syntax, Swift comparators, or a provider result array. Preserve result entry IDs, order, group, presentation kind, and relevant association flags. Browser interaction can be submit-based instead of reproducing iOS live typing.

### 3. Exact entry resolution and homographs

The app can resolve by exact `LanguageReferenceID`, one ranked matching form, or all entries matching a form ([`LookupClient.swift`](../../apps/ios/Modules/Sources/SearchExperience/LookupClient.swift#L208-L229)). The public tests prove that same-spelling `モール` entries for “(shopping) mall” and “Moor” remain distinct and do not inherit one another's notes or unverifiable form-only examples ([UI test](../../apps/ios/AppUITests/SearchExperienceJourneyUITests.swift#L4220-L4261); [Word Detail evidence](../../apps/ios/Verification/JOURNEY-INSPECT-WORD-v5/README.md)).

**Recommendation:** an entry-page capability must resolve an exact Language Reference ID. A surface-only route may first return an entry family, but the eventual selected page/share result must carry exact identity through the capability boundary. The URL behavior is an owner decision, not a data-layer assumption.

### 4. Example Sentence Corpus and retrieval

Example Sentence Retrieval is a separate accepted app-owned capability with three typed requests: direct English, direct Japanese, and exact dictionary-entry association. It owns eligibility and ranking and returns app-owned example-pair identities; provider coordinates and FTS order are not public contract inputs ([ADR 0002](../adr/0002-example-sentence-retrieval-contract.md); [`ExampleSentenceClient.swift`](../../apps/ios/Modules/Sources/SearchExperience/ExampleSentenceClient.swift)).

The current UI can show example-only results even when no Dictionary Match exists, and a selected entry can use entry-associated examples rather than direct-query examples ([`SearchView.swift`](../../apps/ios/Modules/Sources/SearchExperience/SearchView.swift#L157-L183); [example journey](../../apps/ios/Verification/JOURNEY-READ-EXAMPLES-v2/README.md)). Japanese Text Analysis supplies linked occurrences and deliberately leaves ambiguous homographs as a candidate family rather than inventing one target ([`JapaneseTextAnalysisClient.swift`](../../apps/ios/Modules/Sources/SearchExperience/JapaneseTextAnalysisClient.swift); [analysis tests](../../apps/ios/Modules/Tests/SearchExperienceTests/JapaneseTextAnalysisTests.swift)).

**Recommendation:** keep direct example search and exact-entry examples distinct on web. Match exact example IDs/order for a shared data/policy version. Browser token/link presentation may differ, but an inflected or ambiguous token must not silently open the wrong entry.

### 5. Optional enrichment capabilities

Word Detail currently orders public and private material as Word identity/pronunciation, Entry classification/frequency, alternatives, meanings, primary/alternative kanji, relationships, notes, and examples ([`WordDetailView.swift`](../../apps/ios/Modules/Sources/SearchExperience/WordDetailView.swift#L44-L136)). It renders reading aids from trusted readings, optional pitch, synthesized pronunciation, ordered numbered senses and notes, alternative forms, related entries, conjugation navigation where supported, and explicit “No source-matched examples” when association is absent ([`WordDetailView.swift`](../../apps/ios/Modules/Sources/SearchExperience/WordDetailView.swift#L530-L606), [`WordDetailView.swift`](../../apps/ios/Modules/Sources/SearchExperience/WordDetailView.swift#L858-L1022), [`WordDetailView.swift`](../../apps/ios/Modules/Sources/SearchExperience/WordDetailView.swift#L1069-L1096)).

Frequency is a separately swappable capability. The default bundled TUBELEX pack and optional Wikipedia pack have different corpora and mappings; unavailable and no-evidence are distinct states ([`FrequencyPack.swift`](../../apps/ios/Modules/Sources/SearchExperience/FrequencyPack.swift); [frequency sources](../../apps/ios/LanguageData/Sources/TUBELEX-ja-310-lemma-pos.source.json), [Wikipedia source](../../apps/ios/LanguageData/Sources/Wikipedia-ja-20221020-310-nfkc.source.json)). Conjugations are app-authored typed rules with acknowledged coverage limits rather than imported dictionary facts ([`JapaneseConjugationClient.swift`](../../apps/ios/Modules/Sources/SearchExperience/JapaneseConjugationClient.swift); [conjugation evidence](../../apps/ios/Verification/JOURNEY-INSPECT-CONJUGATIONS/README.md)). Speech uses platform synthesis and is not a source recording.

**Recommendation:** treat pitch, frequency, examples, kanji, conjugations, and speech as named enrichment capabilities with explicit available/no-evidence/unavailable behavior. Core lexical parity must not depend on all enrichments succeeding. The owner must decide which frequency pack the public web represents; it cannot automatically mirror a particular user's active iOS pack.

## Feature inventory and web posture

“Adopt” means preserve the current learner-visible contract. “Adapt” means preserve the facts/outcome but redesign interaction for browsers. “Defer” means valid future public scope, not required for the first search/entry slice. “Exclude” means private or platform-specific behavior should not appear on public pages.

| Current capability | Current authority | Web posture | Contract note |
| --- | --- | --- | --- |
| Japanese written/reading search | Language Reference Data + Dictionary Ranking | Adopt | Same eligible IDs, order, Best/Additional grouping for a shared version. |
| English meaning search | Normalized JMdict English gloss atoms + app Ranking | Adopt | `hello` is a search query returning Japanese entries, not an English entry page. |
| Romaji search/refinement | Normalized romaji forms + Search policy | Adopt/Adapt | Preserve results and offered Japanese reading; UI need not use an iOS-style refinement row. |
| Romaji conjugated-form recovery | Bounded `SearchQuery` deinflection | Adopt initially | Match protected outputs such as `tabeta` and `makasete`; do not call it general morphology. |
| Multiword/mixed-text Discovered Words | Sudachi-backed Japanese Text Analysis + exact lookup | Adapt | Useful for pasted text, but browser presentation and runtime may differ. |
| Single-kanji primary result | Kanji Reference + Language Reference Data | Adapt | Preserve distinction between kanji reference and word entries. |
| Radical picker | KRADFILE/RADKFILE capability | Defer | It is a search input mode, not required for text-search/entry parity. |
| Handwriting input | DaKanji/Core ML + iOS drawing UI | Defer | Do not make current Core ML/iOS adapter a web requirement. |
| Image Text entry path | OCR/analysis/personal flow | Exclude from public dictionary v1 | It can link to public entries later, but source images and session data are private. |
| Loading, no results, retrieval failure, Retry | Search presentation state | Adopt/Adapt | Preserve semantic distinction; timing, skeletons, and control placement may differ. |
| Result row | Headword, reading aid, summary, frequency | Adopt/Adapt | Preserve facts and rank/group; use responsive web semantics. |
| Entry identity, reading, senses, POS, notes, alternatives, commonness | Language Reference Data | Adopt | Core entry parity. “Notes” here means source usage notes, not learner notes. |
| Pitch accent | Exact UniDic association | Adopt when available | Omit/no-evidence when the source match is absent; never infer. |
| Pronunciation | Apple Speech Synthesis | Adapt | The action can exist; exact engine, voice, callbacks, and audio output are platform-specific. |
| Frequency | Active Frequency Pack | Adapt, owner decision | Publish a named fixed web policy; distinguish rank, no evidence, and unavailable. |
| Related words | Qualified JMdict cross-references + reviewed Zenbu facts | Adopt | Resolve by exact target ID; do not regenerate relationships from similarity. |
| Entry examples | Example Sentence Retrieval | Adopt after public-web attribution decision | Exact entry association must fail closed for ambiguous homographs. |
| Example word links | Japanese Text Analysis + Language Reference lookup | Adapt | Preserve exact/ambiguous resolution; browser navigation can differ. |
| Kanji traversal/detail | KANJIDIC2 + KRADFILE + Language Reference Data | Defer or adapt in later slice | Preserve source-backed fields, missing metadata, and partial failure semantics. |
| Kanji elements | Kanjium + KANJIDIC2 | Defer | Separate capability and attribution. |
| Stroke order | KanjiVG | Defer | Separate source, artifact, controls, and share-alike obligations. |
| Conjugations | App-owned typed rules | Adopt or defer by scope | If shipped, match supported classes/forms and disclose bounded coverage. |
| Dictionary Sources | Source manifests/notices | Adopt/Adapt | Public web needs reachable attribution and retained notices appropriate to distribution. |
| Recent Search history | Device-local learner data | Exclude from public page parity | A browser may later store local history, but it is not public entry data. |
| Learner notes | `WordNoteStore` / `WordNoteID` | Exclude | Never render on public pages or include in shared URLs. |
| Encounter Media | Device-local learner media | Exclude | Never render publicly; ADR 0004 makes it learner-owned and persistent. |
| Saved status/profile/settings | Device-local learner state | Exclude | Not part of an anonymous public entry. |
| App Share to web | Issue #211, not implemented | Adopt after address decision | Recipient must reach corresponding public entry without account/install; universal-link behavior is separately owned. |

## Learner journey matrix

| Learner goal | Start/input and visible steps | Expected observable result | Current owner/evidence | Capabilities/sources | Web posture | Candidate future QA journey | Candidate public test seam |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Find Japanese for English `hello` | Empty Search → enter `hello` | Ranked results; `今日は` / `こんにちは` is first; `ハロー` remains visible; substring noise is absent | [`testHelloRanks…`](../../apps/ios/AppUITests/SearchExperienceJourneyUITests.swift#L2566-L2583); ADR 0003 | JMdict gloss/forms, Dictionary Match/Ranking | Adopt | Submit `/dictionary/?search=hello`; inspect stable Best/Additional results; open greeting | Public search request → ordered result IDs/groups/summaries |
| Open an exact Japanese form | Enter `問題` → choose result → Back | `問題` / `もんだい`, ordered meaning begins “question … problem”; return preserves results | [`testJapaneseQueryOpens…`](../../apps/ios/AppUITests/SearchExperienceJourneyUITests.swift#L5412); [Search Text evidence](../../apps/ios/Verification/JOURNEY-SEARCH-TEXT-v3/README.md) | JMdict, identity, Ranking | Adopt/Adapt | Search exact form, open public entry, return to results | Search result link → exact entry identity and core record |
| Find an entry by romaji | Enter `sushi` or `mondai` → optionally choose reading refinement | Literal ranked results remain; source-backed `すし`/`もんだい` option reranks to `寿司`/`問題` | [`testAmbiguousRomaji…`](../../apps/ios/AppUITests/SearchExperienceJourneyUITests.swift#L2335); [Romaji evidence](../../apps/ios/Verification/JOURNEY-SEARCH-ROMAJI-REFINEMENT/README.md) | JMdict reading/romaji forms, Ranking | Adopt/Adapt | Search romaji, activate reading option, verify URL/query/result state | Public search response including optional reading refinement |
| Recover a conjugated romaji form | Enter `tabeta`; separately `makasete` | `食べる` is sole Best Match for `tabeta`; `任せる` leads `makasete` with legitimate alternates | [`testInflectedRomaji…`](../../apps/ios/AppUITests/SearchExperienceJourneyUITests.swift#L3173-L3224); ranking regression test | Bounded SearchQuery deinflection + Ranking | Adopt initially | Submit both fixtures and inspect positive and negative candidates | Public search request → independently frozen expected IDs/groups |
| Discover words in mixed text | Enter `にほんabc` or `蝶々abc` | Discovered Words replaces Best/Additional; Japanese segment resolves without an `ＡＢＣ` invention | [`testMixedScriptShowsDiscoveredWords`](../../apps/ios/AppUITests/SearchExperienceJourneyUITests.swift#L3225-L3258) | Sudachi Japanese Text Analysis, Language Reference lookup | Adapt | Paste mixed input and inspect discovered Japanese entries | Public analyze/search request → ordered discovered entry IDs and presentation kind |
| Resolve same-reading ambiguity | Search `はし` | Primary entry is `端`, not automatically `箸`; other eligible entries remain separately addressable | [`testHashiSelectsEdge…`](../../apps/ios/Modules/Tests/SearchExperienceTests/ExampleSentenceRetrievalTests.swift#L321-L329); manual checklist | Typed form evidence, priority, breadth tie-break | Adopt | Search `はし`, inspect primary and alternative entry identities | Public ranked-search response, never surface-only equality |
| Keep same-spelling homographs isolated | Search `モール` → open shopping mall → Back → open Moor | Two separate entries; private notes and unverifiable examples do not cross | [`testWordNotesRemainIsolated…`](../../apps/ios/AppUITests/SearchExperienceJourneyUITests.swift#L4220-L4261); Word Detail evidence | LanguageReferenceID, WordNoteID, entry example association | Adopt core / exclude private note | Open both public variants/family and verify senses/examples stay isolated | Exact entry resolution by ID plus surface-family response |
| Inspect meanings and forms | Search/open `見る` | Headword/reading, `#41` under default pack, pitch, POS, first ordered sense, `観る` alternative, examples | [`testCommonWordDetail…`](../../apps/ios/AppUITests/SearchExperienceJourneyUITests.swift#L3659-L3778); Word Detail evidence | JMdict, UniDic, TUBELEX, Tatoeba | Adopt/Adapt | Open `見る`; compare core record and named optional enrichments | Public entry request → versioned exact entry record |
| Follow a related word | On `見る`, choose `見える`, then return | Exact `見える` destination and its first sense; no ranked-search fallback | Same test; importer relationship contract | Qualified JMdict xref / Zenbu reviewed relationship, target ID | Adopt | Follow relation and assert exact target identity; return state browser-native | Relationship target link → exact entry request |
| Inspect examples and word links | Search `いる` → examples → `見て` token → `見る` | Ordered Japanese/English pairs, linked word selection, canonical inflected destination, source identity; example-only `hello-world` also works | [Example journey](../../apps/ios/Verification/JOURNEY-READ-EXAMPLES-v2/README.md); ADR 0002 | Tatoeba corpus/retrieval, Sudachi analysis, Language Reference Data | Adopt/Adapt after attribution decision | Exercise direct-query examples, entry examples, example-only state, exact and ambiguous tokens | Public example-search and entry-example requests → ordered ExampleSentenceIDs; token-selection seam |
| Traverse kanji and restore context | `静か` → `静` → scroll → `静寂` → Back twice | Source-backed kanji facts and related words; each Back restores useful prior context | [Kanji evidence](../../apps/ios/Verification/JOURNEY-INSPECT-KANJI/README.md) | KANJIDIC2, KRADFILE, JMdict | Defer/Adapt | Browser entry → kanji → word and browser Back; verify correct destinations | Public kanji request and links; history behavior at page seam |
| Inspect conjugations | `いる` or `書く` → View Conjugations → switch Plain/Polite | Supported class title and independently expected ordered forms/readings; unsupported classes omit action | [Conjugation evidence](../../apps/ios/Verification/JOURNEY-INSPECT-CONJUGATIONS/README.md) | App-owned rules + normalized word class/forms | Adopt or defer | Verify one Ichidan, Godan, irregular, i-adjective, na-adjective representative | Public entry-conjugation request → typed table or unsupported |
| Handle missing optional metadata | Open `どいたま`; inspect frequency; inspect entries without pitch/examples | Entry remains usable; no-evidence appears neutrally; unavailable is not relabeled “rare”; absent pitch is omitted; no examples says so | [`testMissingTUBELEX…`](../../apps/ios/AppUITests/SearchExperienceJourneyUITests.swift#L3846-L3875); source README pitch rule | Optional UniDic/frequency/example capabilities | Adopt/Adapt | Load sparse fixture and simulate one enrichment failure | Exact entry response with typed optional states |
| Distinguish no result from failure | Search `zzzxqv`; separately inject failure → Retry | No Dictionary Matches is not an error; retrieval failure remains stable until Retry, which recovers real results | [Search Text evidence](../../apps/ios/Verification/JOURNEY-SEARCH-TEXT-v3/README.md); [`SearchView.swift`](../../apps/ios/Modules/Sources/SearchExperience/SearchView.swift#L145-L194) | Search capability and presentation state | Adopt/Adapt | Return empty result successfully; separately fail request and retry | HTTP/public search boundary with success-empty versus error semantics |
| Share the exact app entry | Word Detail → Share → recipient opens URL | Intended: corresponding public entry opens without sign-in/install; exact homograph must not change | [Issue #211](https://github.com/serpcompany/zenbujapanese-monorepo/issues/211); not yet implemented | Entry identity, public addressing, universal-link/fallback policy | Adopt after decision | Share both `モール` entries and greeting form variants; verify recipient identity | App-generated public URL → resolved LanguageReferenceID and visible entry |

## Sources, publication, and licensing

This is a product/engineering inventory, not independent legal advice. Web publication may be a different distribution context from the accepted iOS release posture and needs explicit owner/legal review where noted.

| Source/capability | Retained facts and current use | Recorded terms/posture | Public-web consequence |
| --- | --- | --- | --- |
| JMdict English export, 2026-08-10 | Entries, forms, English gloss atoms, senses, POS/applicability, priority, xrefs, provenance | EDRDG general dictionary licence / CC BY-SA 4.0; exact source is pinned through LFS ([manifest](../../apps/ios/LanguageData/Sources/JMdict_e-2026-08-10.source.json); [attribution](../../apps/ios/LanguageData/Sources/EDRDG-ATTRIBUTION.md)) | Core web dictionary derivative must retain source identity, required attribution/licence link, and modification disclosure; confirm share-alike treatment for delivered data/artifacts. |
| UniDic CWJ 3.1.0 | Exact base/pronunciation-or-reading join produces optional downstep/mora count | New BSD; full notice retained ([source README](../../apps/ios/LanguageData/Sources/README.md#L19-L25)) | If pitch facts ship, retain required copyright/conditions/disclaimer in an accessible web notice; do not infer missing facts. |
| Tatoeba 2026-08-08 exports | 232,703 selected Japanese-English pairs with both IDs, contributor status, and per-side licence evidence | General data CC BY 2.0 FR; 2 current pairs recorded CC0; owner accepted a known attribution risk for iOS v1, not independent legal clearance ([manifest](../../apps/ios/LanguageData/Sources/Tatoeba-2026-08-08.source.json); [source README](../../apps/ios/LanguageData/Sources/README.md#L45-L53)) | Do not assume the iOS disclosure automatically settles public SEO pages. Decide contributor-credit discoverability, per-entry/source notice, redistribution, and risk acceptance before indexing examples. |
| KANJIDIC2 2026-08-10 | Literal, radical number, strokes, grade, frequency, JLPT, English meaning, Japanese readings/nanori | EDRDG general dictionary licence / CC BY-SA 4.0 ([manifest](../../apps/ios/LanguageData/Sources/KANJIDIC2-2026-08-10.source.json)) | Same EDRDG attribution/share-alike review; expose only retained fields and omit unsupported optional sections. |
| KRADFILE/RADKFILE 2026-08-10 | 6,355 kanji, 253 components, 25,699 checked memberships | EDRDG general dictionary licence / CC BY-SA 4.0 ([manifest](../../apps/ios/LanguageData/Generated/EDRDG-radicals-2026-08-10.import.json)) | Needed only if web exposes radical/component functions; keep its ontology separate from KanjiVG/Kanjium. |
| Kanjium at `8a0cdaa` | 1,698 top-level elements, variants/roles combined with KANJIDIC2 summaries | CC BY-SA 4.0; Uros O. plus EDRDG attribution ([manifest](../../apps/ios/LanguageData/Generated/Kanjium-8a0cdaa.import.json)) | Deferred surface requires its own attribution/modification disclosure; do not publish excluded lexical/pitch/etymology fields. |
| KanjiVG `r20250816` | 6,430 ordered stroke diagrams / 79,180 strokes | CC BY-SA 3.0, Ulrich Apel attribution, modifications recorded ([manifest](../../apps/ios/LanguageData/Generated/KanjiVG-2025-08-16.import.json)) | Deferred stroke-order web distribution must retain attribution, full terms, modification notice, and share-alike analysis. |
| TUBELEX 2025.1 | Default iOS Japanese YouTube lemma/POS frequency | BSD-3-Clause; corpus-specific, not universal frequency ([manifest](../../apps/ios/LanguageData/Sources/TUBELEX-ja-310-lemma-pos.source.json)) | If selected for web, name its domain and version and retain BSD notice; never label its rank universal/common/rare. |
| Wikipedia frequency 2022-10-20 | Optional iOS written-domain surface frequency | BSD-3-Clause ([manifest](../../apps/ios/LanguageData/Sources/Wikipedia-ja-20221020-310-nfkc.source.json)) | Do not let a user's optional iOS choice silently redefine public-page facts; owner must select the public policy. |
| Sudachi.rs / SudachiDict Core 20260723 / binding | Japanese boundaries, dictionary forms, readings, POS for discovery and example links | Apache-2.0 plus retained UniDic/NEologd and binding/archive notices ([contract](../../apps/ios/Modules/Sources/SearchExperience/JapaneseMorphologyClient.swift); [notice](../../apps/ios/Modules/Sources/SearchExperience/Resources/SudachiLanguageTechnologyNotices.txt)) | Preserve observable analysis policy where adopted, but web runtime need not reuse the Swift/iOS adapter. Any redistributed dictionary/runtime needs its recorded notices. |
| DaKanji v1.2 | iOS handwriting candidate recognition | MIT ([manifest](../../apps/ios/LanguageData/Sources/DaKanji-v1.2.source.json)) | Deferred; no reason to ship Core ML/model bytes in the initial web dictionary. |
| Zenbu word relationships | Versioned human-reviewed facts plus resolved authoritative JMdict xrefs | App-owned editorial source with separate JMdict provenance ([source README](../../apps/ios/LanguageData/Sources/README.md#L55-L59)) | Publish exact qualified targets and provenance; do not derive lookalike “related” words independently on web. |
| App-authored conjugation rules | Supported verb/adjective form tables | App-owned code; current evidence records an unresolved private-reference provenance gap and bounded coverage | Can publish as Zenbu behavior, but label scope honestly and parity-test only supported classes/fixtures. |
| Apple Speech Synthesis | Pronunciation playback | Platform capability, synthesized audio | Not a lexical data source. Web can adapt with another approved synthesizer; never call it a source recording or require acoustic parity. |

The in-app Dictionary Sources surface already presents source identities, snapshots, licences, notices, contributor credits, and Zenbu transforms ([`DictionarySourcesView.swift`](../../apps/ios/Modules/Sources/SearchExperience/DictionarySourcesView.swift)). The web should retain equivalent disclosure capability, but its exact information architecture is a later product/SEO decision.

## Public versus private information

Public candidates are source-backed Language Reference Data and explicitly approved enrichments: entry identity, headword/reading/reading aids, summary, ordered senses/glosses, parts of speech, source usage/form labels, alternatives, commonness, exact pitch facts, named frequency evidence, qualified relationships, approved examples, kanji facts, and supported conjugations.

The following are learner-owned or session/device state and must not appear on anonymous public entry pages or in share payloads:

- learner notes and `WordNoteID` contents;
- Encounter Media, source images, filenames, or associations;
- recent searches and search history;
- saved status, profile/settings, installed optional pack choice, and activity;
- Image Text session content, OCR regions, translations, and transient navigation state.

ADR 0004 explicitly classifies Encounter Media as learner-retained and device-owned ([ADR 0004](../adr/0004-word-image-attachment-persistence.md)). `DictionarySourcesView` also states that searches, notes, and Encounter Media remain on device ([source view](../../apps/ios/Modules/Sources/SearchExperience/DictionarySourcesView.swift#L5-L15)).

## Proposed platform-neutral contract boundaries

These are behavioral modules, not proposed transport endpoints or packages:

1. **Dictionary version descriptor** — identifies source snapshot set, normalization transform, dictionary-ranking policy/schema, example-retrieval policy, enrichment versions, and relevant content checksums.
2. **Dictionary search** — accepts a raw learner query and returns its normalized display value, presentation kind, ordered Dictionary Match groups, optional reading refinement, example availability/count kind, and typed failure. Results reference exact LanguageReference IDs.
3. **Entry resolution** — resolves an exact LanguageReference ID and separately resolves a Japanese surface to zero/one/many candidate identities. It never pretends a homograph family is one entry.
4. **Entry detail** — returns the source-backed core record and explicit optional enrichment states, with exact related targets.
5. **Example retrieval** — keeps direct query routes and exact-entry association distinct and returns ordered app-owned Example Sentence IDs plus source/provenance disclosure.
6. **Japanese occurrence resolution** — returns exact linked entry, candidate family, or unlinked text; it does not choose an ambiguous entry merely to create a link.
7. **Kanji reference** — if/when adopted, returns source-backed kanji facts, elements, stroke-order availability, and related exact Language Reference IDs while keeping source ontologies separate.
8. **Conjugation** — if/when adopted, returns a typed supported table or unsupported state from the entry's normalized class/forms.

ADR 0001 requires precisely this direction: Product Experiences depend on app-owned models and focused capability interfaces, with source adapters and replaceable Language Technology behind them ([ADR 0001](../adr/0001-language-capability-boundaries.md)). It does not require a shared runtime or choose an API/database.

## What must match and what may differ

### Must match for the same declared version

- exact Language Reference identity and semantic-equivalence normalization;
- query normalization that affects Match eligibility;
- eligible results, total order, Best/Additional/Discovered grouping, and Primary Dictionary Entry where required;
- canonical headword/reading and source-backed display-form choice;
- ordered senses and glosses, POS, usage notes, form restrictions as they affect matching, alternatives, and commonness;
- exact relation target and qualifier;
- exact entry-example eligibility/order and ambiguous-homograph fail-closed behavior;
- optional fact truth (`value`, `no evidence`, or `unavailable`) and named source/version;
- provenance, attribution, licence posture, and modification disclosure;
- explicit no-result versus retrieval failure behavior.

### May differ by platform

- Swift/TypeScript types, SQLite/other storage, transport, indexes, cache, concurrency, hosting, and deployment;
- list/card/two-pane layout, responsive hierarchy, interaction density, live-versus-submit search timing, focus, browser history, and restoration mechanics;
- loading animation, copy, native controls, SF Symbols, share-sheet UI, and app-install affordance;
- speech implementation and voice, provided the text pronounced is correct and synthesis is disclosed honestly;
- whether deferred input modes and enrichments ship in the first web slice;
- private local preferences/history, which are not public parity data.

## TDD preparation: candidate public seams

No product test should be written until the owner confirms these seams. Later tickets should use red → green vertical slices, one learner-visible behavior at a time, with expected literals/IDs drawn independently from approved fixtures rather than recomputing the implementation.

| Proposed seam for owner confirmation | What a durable test observes | Avoid |
| --- | --- | --- |
| Public dictionary search | Raw query → normalized query plus ordered exact entry IDs, presentation group/kind, reading refinement, example count kind, or typed empty/failure | SQL rows, FTS scores/order, private ranking functions, snapshots generated by the code under test |
| Public surface resolution | Japanese surface → zero/one/many exact IDs; exact ID → one semantic entry | Assuming every slug is unique, using provider IDs, picking `.first` without declared ranking |
| Public entry page | Shared URL/request → exact visible headword/reading, ordered senses, forms, relationship targets, and optional states | DOM structure snapshots, React component internals, duplicating Swift model shape solely for test convenience |
| Public example retrieval | Query or exact entry → ordered Example Sentence IDs/text and source disclosure | Joining by provider coordinates, testing SQL tables, conflating direct search with entry association |
| Public linked occurrence | Example token → exact target, candidate family, or intentionally unlinked state | Forcing ambiguous text to one entry, testing Sudachi private adapter calls |
| Public optional enrichment | Exact entry → source/version plus evidence/no-evidence/unavailable | Treating absent as zero/rare, coupling to a user's iOS pack choice |
| App-to-web Share | Share action's public URL → same exact LanguageReferenceID and visible entry for recipient | Verifying only URL text, testing a single unambiguous word, leaking private state |
| Contract-version parity gate | One approved fixture bundle executed by both adapters → same platform-neutral outputs | Comparing screenshots or requiring identical storage/runtime code |

The highest-leverage first TDD slice is `hello`: search through the public seam, assert the approved first exact ID/headword/reading and presence/absence anchors, then open that result through the entry seam and assert the same identity and first ordered sense. The next slice must be `モール`, because a system that only passes unambiguous entries does not prove share/address correctness.

## Minimum representative fixture set

The fixture set should be small but independently frozen from the accepted app behavior. It should contain expected IDs where identity matters, not only display text.

| Fixture | Contract exercised | Minimum independent expectation |
| --- | --- | --- |
| `hello` | English gloss ranking | Primary `今日は` / `こんにちは`; `ハロー` eligible; known substring noise absent. |
| `問題` | Exact Japanese form and entry | Primary `問題` / `もんだい`; ordered first sense; Back/link path can retain query. |
| `sushi` or `mondai` | Exact romaji plus refinement | Reading option `すし` or `もんだい`; refined Japanese primary entry. |
| `tabeta` | Romaji deinflection | Sole Best Match `食べる`; `食べるラー油` and `ベタベタ` absent. |
| `makasete` | Ambiguous deinflection family | `任せる` first; `任す` and `負かす` retained as Additional Matches. |
| `にほんabc` and `蝶々abc` | Mixed-script discovery and iteration mark | Discovered Words kind; exact Japanese entries; no fabricated Latin full-width entry. |
| `はし` | Same-reading ranking | Primary exact ID `8784500933ea7b27b14398efa769d7b8` (`端`); other entries remain distinct. |
| `モール` | Same-spelling homographs and share/addressing | Shopping-mall and Moor IDs stay separate; examples/selected identity do not cross. |
| `見る` | Rich entry | ID, headword/reading, ordered first sense, POS, `観る`, `見える` exact relation, pitch, default web frequency decision, examples. |
| `どいたま` | Missing optional data | Core entry remains usable; frequency is no-evidence, not “rare”; absent enrichments do not fail page. |
| `hello-world` | Example-only search | No dictionary headings; two source-backed examples under current policy; linked `こんにちは` path. |
| `いる` → `見て` → `見る` | Entry/query examples and occurrence resolution | Entry-associated examples remain distinct; inflected token reaches canonical `見る`. |
| `静か` → `静` → `静寂` | Kanji traversal | Source-backed kanji and exact linked word; include only if kanji web slice is approved. |
| `いる`, `書く`, `する`, `来る`, `とんでもない`, `静か` | Conjugation class coverage | Approved typed tables for each supported class; include only if conjugations ship. |
| `zzzxqv` plus injected/unavailable backend | Empty versus failure | Successful empty result differs from retrieval failure; Retry can recover. |
| canonical duplicate `中越地震` | Semantic-equivalence identity | Both source records resolve to canonical ID `845d27d83eebdadc22af4e2de4231d68` with both provenances. |

The existing regression expectations are in [`ExampleSentenceRetrievalTests.swift`](../../apps/ios/Modules/Tests/SearchExperienceTests/ExampleSentenceRetrievalTests.swift#L127-L225) and [`ExampleSentenceRetrievalTests.swift`](../../apps/ios/Modules/Tests/SearchExperienceTests/ExampleSentenceRetrievalTests.swift#L284-L367). Later shared fixtures should be extracted from approved expected values, not generated by serializing the current Swift result and declaring it correct.

## First owner decisions required before `/to-spec`

1. **Public addressing and homographs:** Is `/dictionary/モール` a family/disambiguation page, or must a shared exact entry have another public discriminator? How does the public page expose the selected exact entry without compromising the human URL?
2. **Canonical public form:** For the greeting, is the canonical page `/dictionary/今日は`, `/dictionary/こんにちは`, or one canonical destination with the other accepted as an entry form? This must be decided from the current headword/reading model, not SEO intuition alone.
3. **Parity strength:** Confirm that core lexical facts and shared fixture ranking are hard parity, while layout/runtime are not. Decide whether every Additional Match must match or whether only approved result windows/anchors are contractual.
4. **Search timing:** Should web search only on submit, or update live like iOS? The outcome contract can remain identical either way.
5. **V1 feature cut:** Confirm which enrichments appear initially: pitch, frequency, examples, kanji links/detail, conjugations, pronunciation, mixed-text discovery, radicals, handwriting.
6. **Frequency policy:** Choose one named public frequency pack/policy, multiple explicitly selectable packs, or defer frequency. Do not imply the page mirrors each recipient's iOS setting.
7. **Tatoeba public-web posture:** Explicitly approve or defer public/indexable example publication and its contributor/licence disclosure. The recorded iOS v1 risk acceptance is not legal advice.
8. **Source disclosure placement:** Decide the minimum per-page attribution and the route for complete sources, licences, modifications, and Tatoeba contributor credits.
9. **Version alignment:** Decide the release rule when app and web versions differ: block publication, expose versioned compatibility, or allow a documented lag. The contract must make drift observable.
10. **Confirm public TDD seams:** Approve or amend the seams above before an implementation ticket writes tests, as required by the TDD workflow.

## Evidence that would change this recommendation

- PR #232 changes entry identity, SearchQuery normalization, ranking, example association, or source manifests before merge.
- The owner changes Zenbu from a Japanese-centered dictionary to canonical entries in non-Japanese languages.
- A source licence review prevents public redistribution of a currently proposed field/artifact or requires a different attribution surface.
- Inspection proves that `LanguageReferenceID` is not stable across intended source promotions or cannot be mapped during promotion.
- Product approval says entry pages are deliberately search-result families rather than exact entries; that would weaken app Share parity and require a different contract.
- A web runtime cannot reproduce an accepted observable behavior from the same normalized facts without importing a platform-specific implementation. That is evidence for a new focused shared adapter or policy version, not permission to drift silently.
- Representative cross-platform fixtures reveal current iOS behavior is wrong or too app-specific. Correct the app-owned contract/version first rather than freezing a defect into web parity.
- A new definition language is added. Current JMdict import deliberately retains English glosses only, so localized UI alone does not create Japanese–Spanish dictionary content ([import manifest](../../apps/ios/LanguageData/Generated/JMdict_e-2026-08-10.import.json#L103-L128)).

## Recommended handoff

### Owner decision outcome

The owner completed the post-research decision rounds in #276. Approved outcomes:

- Exact public JMdict entry URLs use the app-displayed headword plus retained JMdict `ent_seq`; one URL represents one exact entry.
- App/Web Dictionary Parity is hard parity for visible identities, order, and Best/Additional grouping under the same declared version.
- Public Dictionary Search is submit-first.
- Full enrichment parity does not block the initial route scaffold; enrichments ship in later vertical slices while preserving approved app behavior.
- Public frequency follows the app-default TUBELEX policy when shipped.
- Public examples follow the app's entry-associated Tatoeba behavior when shipped, with attribution retained.
- Dictionary source acknowledgement belongs on the About surface, subject to source-specific disclosure validation.
- App Share copies a public HTTPS website URL; installed-app opening is post-MVP.
- Locale infrastructure launches with unprefixed English, an initial `/ja` edition, a language selector, and maintained library behavior rather than custom negotiation.
- Successful search-result pages with one or more strong approved matches are indexable; zero-result, retrieval-failure, and weak-only pages are not. The policy requires deterministic unit/policy and route-metadata tests.
- Browser presentation may differ while dictionary content and behavior remain aligned.
- The proposed public TDD seams are approved; SEO and performance have separate web quality gates.
- External links open in a clearly indicated new tab. Trusted/source links remain followed, while paid/affiliate, user-generated, and untrusted links use `sponsored`, `ugc`, and `nofollow` respectively.

The exact implementations remain owned by the later spec and tracer-bullet tickets.

After the owner answers the ten decisions above:

1. rebase/recheck this evidence against the final merged PR #232 head;
2. use `/to-spec` to define public page behavior and the platform-neutral capability/fixture contract without selecting storage prematurely;
3. use `/to-tickets` to create vertical tracer bullets, beginning with a versioned `hello` search-to-entry path and a separate `モール` exact-identity/address path;
4. present the named public seams for explicit owner confirmation before each ticket begins TDD;
5. keep data-delivery, website foundation, localized routing, SEO/sitemaps, dictionary search, entry content, app Share, and deployment as bounded tickets linked by their real blockers.

This research does not recommend Next.js storage, D1, Drizzle, R2, an API shape, caching, or deployment architecture. Issue #281 should choose a delivery boundary only after this behavioral contract is approved.
