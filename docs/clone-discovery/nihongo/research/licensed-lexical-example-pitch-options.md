# Licensed lexical, example, and pitch-data options

Research date: 2026-08-06  
Wayfinder ticket: [Research licensed lexical, example, and pitch-data options](https://github.com/serpcompany/zenbujapanese-monorepo/issues/84)

## Decision summary

Zenbu does not need Nihongo's private JMdict snapshot, Tatoeba selection, local edits, or source-joining rules to become implementation-ready. Those facts do not define an observable learner-facing contract and cannot establish rights to reuse Nihongo's derived database. Zenbu should instead create versioned, independently acquired Language Reference Data behind the boundary in ADR 0001.

The recommended initial stack is:

1. **Dictionary entries:** the English-only JMdict XML distribution, acquired from EDRDG on a recorded date, hashed, normalized while retaining `ent_seq` and field-level provenance, and refreshed through a documented at-least-monthly process.
2. **Example text:** Tatoeba's Japanese and English **CC0** sentence exports plus the translation-links export, selected by a deterministic, versioned quality policy. Add Zenbu-authored examples where CC0 coverage is insufficient. Broader CC BY 2.0 FR data is a later option only if per-sentence attribution is designed and retained.
3. **Pitch accent:** pin `unidic-cwj-202512.zip` under its Modified BSD option as the first evaluation candidate. Import only the required pronunciation/accent and matching fields into app-owned records with source/version provenance. Do not join it to JMdict by spelling alone. Evaluate homographs, readings, parts of speech, inflection, compounds, and proper nouns before accepting its coverage.
4. **Commercial pitch fallback:** ask CJKI for a Japanese Phonetic Database quote only if UniDic fails the agreed evaluation or product scope requires CJKI's proper-name or phonetic coverage. CJKI is not required to start the app-owned pipeline.

This resolves the two "exact Nihongo" source gaps as nonblocking. It leaves one product/data decision—whether the evaluated UniDic baseline is sufficient—and one conditional procurement dependency if CJKI is selected.

## Primary-source findings

### JMdict

EDRDG says JMdict is generated daily, exposes a current English-only XML distribution, and includes its generation date in the file header. The project also gives each entry a stable numeric `ent_seq`; only active, approved entries are exported. These facts are enough to build a reproducible Zenbu acquisition and update pipeline without reconstructing Nihongo's snapshot ([JMdict project and downloads](https://www.edrdg.org/jmdict/j_jmdict.html), [JMdictDB help](https://www.edrdg.org/jmwsgi/edhelp.py?svc=jmdict)).

EDRDG licenses the Japanese and English JMdict components and derived data under CC BY-SA 4.0. Its project-specific conditions explicitly permit commercial smartphone apps and do not require the app's software to be open source, but require source acknowledgement in an accessible Sources/About surface, links or bundled licence documentation, and a procedure for regular updates; it says dictionary servers should update at least monthly ([EDRDG General Dictionary Licence Statement](https://www.edrdg.org/edrdg/licence.html)).

Recommended acquisition contract:

- acquire `JMdict_e.gz` directly from EDRDG;
- record retrieval timestamp, generated date from the XML header, byte length, SHA-256, DTD/schema revision, source URL, and licence revision;
- retain `ent_seq`, original reading/orthography restrictions, sense boundaries, tags, priorities, cross-references, and field-level provenance through normalization;
- record every correction, suppression, search index, derived field, and ranking signal separately from the upstream record;
- run a scheduled monthly-or-faster upstream check, produce a reviewable change report, and keep shipped build manifests reproducible;
- provide the required attribution and licence links in the Zenbu Japanese iOS App's Sources/About surface.

The 2026 JMdictDB XML-NG work does **not** make JMdict a current pitch source: EDRDG explicitly delayed pitch-accent output and says the initial XML-NG release ignores pitch data ([2026-03 XML-NG update, pitch accent](https://www.edrdg.org/jmwsgi/web/doc/2026-03-update.html#_pitch_accent_delayed)).

### Tatoeba examples

Tatoeba publishes weekly exports. Its downloads include sentence IDs, detailed sentence metadata with owner and modification dates, translation links, experimental reviews, and a separate CC0 sentence export. Japanese is available in the CC0 export. The downloads page also warns that the community corpus is data for processing rather than an already curated learner set ([Tatoeba downloads](https://tatoeba.org/en/downloads)).

The general text export is CC BY 2.0 FR. Tatoeba's current terms say reuse must preserve the sentence's licence and, for CC BY sentences, quote the author. They also state that Tatoeba cannot guarantee linguistic accuracy or comprehensively police contributed material ([Tatoeba Terms of Use, sections 5 and 6](https://tatoeba.org/en/terms_of_use)). Audio is governed separately per recording; an empty audio-licence field means it cannot be reused outside Tatoeba ([Tatoeba downloads](https://tatoeba.org/en/downloads)). This ticket recommends no Tatoeba audio.

Recommended acquisition and selection contract:

- start with the Japanese and English CC0 exports and `links.tar.bz2`; record retrieval timestamp, file SHA-256, source URL, and export cadence;
- preserve both sentence IDs, source licence, modification dates, translation link, and every automated/manual selection decision;
- reject indirect or missing Japanese-English links; normalize only for indexing while retaining source text verbatim;
- define deterministic filters for length, script/content safety, duplicates, learner usefulness, and known review signals, then have bilingual review own the curated learner-facing set;
- make ranking an app-owned policy using explicit signals, never inherited export order;
- add Zenbu-authored examples with their own provenance when CC0 coverage is weak;
- if CC BY sentences are later admitted, ingest the detailed owner metadata, provide per-item or equivalently traceable attribution approved for the product presentation, and preserve the applicable licence with each item.

Nihongo's selection, ordering, edits, and associations are neither required nor evidence of quality. Zenbu needs a documented corpus and acceptance test, not a reverse-engineered Tatoeba subset.

### UniDic pitch candidate

NINJAL describes UniDic for morphological analysis as a Short Unit Word analysis dictionary, not a general dictionary keyed to JMdict senses. Its fields include lemma, orthographic form, pronunciation, part of speech, and accent-related attributes; the official documentation describes `aType` as the accent-nucleus position and also defines accent modification/connection fields ([What is UniDic?](https://clrd.ninjal.ac.jp/unidic/en/about_unidic_en.html), [UniDic manual](https://clrd.ninjal.ac.jp/unidic/UNIDIC_manual.pdf)). This means UniDic can supply candidate accent facts, but a join to JMdict must account for reading, pronunciation, lemma identity, part of speech, inflection, and multiple records.

The current official archive lists `unidic-cwj-202512.zip`, released 2025-12-31, as the general-use Contemporary Written Japanese package. NINJAL lists it under the GPL v2.0/LGPL v2.1/Modified BSD triple licence. NINJAL's licence FAQ says the user may select one of those paths and describes the BSD path as requiring its copyright/licence files to accompany distributed software, attribution for other publication forms, disclaimer retention, and no endorsement using contributor names. NINJAL also says versions 2.x and later of Contemporary Written Japanese UniDic may be used commercially ([UniDic archive](https://clrd.ninjal.ac.jp/unidic/back_number.html), [licence FAQ](https://clrd.ninjal.ac.jp/unidic/faq.html), [commercial-use note](https://clrd.ninjal.ac.jp/unidic/en/commerce_use_en.html)).

Recommended UniDic contract:

- pin `unidic-cwj-202512.zip`, compute and store SHA-256 on acquisition, and preserve its `AUTHORS`, Modified BSD, and warranty/endorsement notices;
- select the Modified BSD path explicitly in the source registry and release checklist;
- import only the fields needed to represent source lemma/form, reading/pronunciation, part of speech, accent nucleus/pattern, and combination/modification context;
- retain the UniDic record identity available in the pinned package and provenance on every normalized accent record;
- keep ambiguous joins as multiple candidates or unresolved; never silently select by orthography alone;
- treat proper-name and compound coverage as measured capabilities, not implied coverage;
- do not claim that this release matches the UniDic version or supplemental role used by Nihongo.

Acceptance should be measured on a versioned gold corpus covering at minimum:

- kana-only and kanji forms with one reading;
- same spelling with multiple readings;
- homographs separated by part of speech or meaning;
- accented and unaccented patterns across mora counts;
- inflected verbs and adjectives;
- compounds, counters, loanwords, and common proper names;
- records with multiple UniDic candidates and JMdict entries with no candidate.

Report candidate coverage, exact-match coverage, ambiguity rate, false-match rate after bilingual review, proper-name coverage, and unresolved rate. The stakeholder must set thresholds before this candidate becomes the production pitch source.

### CJKI commercial option

CJKI's Japanese Phonetic Database publicly advertises more than 110,000 entries with kana, IPA transcription, pitch-accent codes, grammatical information, semantic classification for proper names, and multiple allophonic variants ([Japanese Phonetic Database](https://www.cjk.org/data/japanese/nlp/japanese-phonetic-database/)). This is a plausible higher-coverage commercial option, especially for names and phonetic detail.

No public page grants mobile/offline redistribution or derivative-display rights. CJKI says it licenses data non-exclusively, customizes fields and formats, and determines fees and terms case by case based on fields, entry count, use, and budget ([CJKI licensing](https://www.cjk.org/licensing/)). Therefore only CJKI can confirm:

- exact product/version and delivered record identity;
- accent-code semantics and included fields;
- mobile/offline bundling and number of distributed devices;
- whether normalized or graphically rendered pitch data is an allowed derivative display;
- server-side use, caching, updates, term/termination, and post-termination handling;
- attribution, audit, sublicensing, backup, and App Store distribution terms;
- price, support, sample/evaluation delivery, and permitted benchmark publication.

If procurement is triggered, request a sample first and evaluate it with the same gold corpus and metrics as UniDic. Do not send proprietary Nihongo evidence or ask CJKI to identify another customer's delivery.

## Blocker dispositions

| Blocker | Classification | Resolution or remaining gate |
| --- | --- | --- |
| `PROVENANCE-GAP-JMDICT-SNAPSHOT` | `NOT_BLOCKING` | Exact Nihongo snapshot and transforms are unnecessary. Use Zenbu's pinned `JMdict_e.gz` pipeline, preserve `ent_seq` and provenance, meet EDRDG attribution/update conditions, and prohibit claims of matching Nihongo's private database. |
| `PROVENANCE-GAP-TATOEBA-SELECTION` | `NOT_BLOCKING` | Exact Nihongo selection/order/edits are unnecessary. Use a pinned CC0-first export and deterministic reviewed selection; preserve sentence/link IDs and provenance. Broader CC BY text requires an attribution design. |
| `PROVENANCE-GAP-CJKI-DELIVERY-LICENSE` | `EXTERNAL_DEPENDENCY` | CJKI's exact deliverable, rights, and price are quote-only. This dependency is **conditional**, not on the implementation frontier, unless the pitch-source decision selects CJKI or UniDic fails its acceptance threshold. |
| `PROVENANCE-GAP-UNIDIC-VERSION-ROLE` | `DECISION_NEEDED` | The available, independently usable candidate is `unidic-cwj-202512.zip` under Modified BSD. Decide whether its measured coverage/accuracy is sufficient and set acceptance thresholds. Nihongo's version and role remain irrelevant and must not be claimed. |

## Language Reference Data boundary

Normalize providers through separate adapters into app-owned records. At minimum, each canonical fact should retain:

- Zenbu record ID and fact type;
- source provider, dataset, release/version, acquisition timestamp, file hash, and source record ID;
- original orthography, reading/pronunciation, sense or part-of-speech restrictions, and upstream value;
- transformation version and transformation history;
- confidence/review status and ambiguity status;
- licence/attribution class and source URL;
- supersession/tombstone status without rewriting historical provenance.

Provider schemas must not become the public domain model. JMdict sense IDs, Tatoeba sentence IDs, and UniDic lexical/form IDs are provenance keys, not Zenbu identity. Updates should produce diffs and require validation before promotion. Shipped data manifests should identify the exact normalized build and every input hash.

## Allowed differences and prohibited claims

Allowed differences from Nihongo:

- different snapshot dates, source mixes, example selection, ordering, corrections, and update cadence;
- different pitch coverage where the approved gold-corpus thresholds are met and missing/ambiguous data is represented honestly;
- Zenbu-authored or CC0 examples in place of Nihongo's examples.

Prohibited claims:

- that Zenbu uses Nihongo's snapshot, local corrections, Tatoeba selection, CJKI delivery, UniDic version, joining rules, or pitch transformations;
- that source resemblance proves record identity or permission;
- that JMdict currently supplies pitch accent;
- that a spelling-only UniDic/JMdict join is authoritative;
- that all Tatoeba text or any Tatoeba audio is CC0;
- that CJKI mobile/offline rights exist before a signed licence says so.

## Readiness consequence

Lexical and example provenance can be removed from the implementation-readiness blocker set once the canonical dossier records these substitute boundaries and acquisition obligations. Pitch implementation may begin against app-owned interfaces and fixtures, but production pitch data remains gated by the UniDic acceptance-threshold decision. CJKI outreach is not required unless that decision selects the commercial option or the UniDic evaluation fails.

This note is technical and provenance research, not legal advice. The release owner should verify the pinned licence files and final attribution presentation when a concrete data build is prepared.
