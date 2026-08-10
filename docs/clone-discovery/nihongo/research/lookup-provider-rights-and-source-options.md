# Lookup provider rights and source options

Research date: 2026-08-06

Scope: resolve the source/licensing questions behind `PROVENANCE-GAP-CJKI-DELIVERY-LICENSE`, `PROVENANCE-GAP-UNIDIC-VERSION-ROLE`, `PROVENANCE-GAP-ETYMOLOGY-REVISION-RIGHTS`, `PROVENANCE-GAP-HUMAN-AUDIO-SOURCE-RIGHTS`, `PROVENANCE-GAP-JMDICT-SNAPSHOT`, `PROVENANCE-GAP-TATOEBA-SELECTION`, `PROVENANCE-GAP-KANJI-RADICAL-STROKE-SOURCES`, and the related exact-reference question `PROVENANCE-GAP-SPEECH-SYNTHESIS-IMPLEMENTATION`.

## Product disposition update — 2026-08-10

The stakeholder deferred the complete kanji-etymology and Origin/history content family until after MVP. This includes historical glyph presentation, etymology classifications and explanations, imagery, and the dedicated Kanji Etymology reference surface. The findings below remain the research baseline for [post-MVP issue #91](https://github.com/serpcompany/zenbujapanese-monorepo/issues/91), not an MVP implementation selection.

For MVP, no etymology source is selected and no etymology content is shipped. Shinjigen and Nihongo text or imagery remain prohibited reuse. A later product decision may evaluate revision-pinned Wiktionary material with original Zenbu wording, separately licensed media, or a negotiated Shinjigen permission path.

This is an engineering source-selection note, not legal advice. It relies on provider-owned product, license, repository, and platform documentation rather than third-party summaries.

## Decision summary

Zenbu does not need to procure CJKI data, obtain Shinjigen permission, or license private/current WaniKani recordings to implement the Lookup feature described by the current scope.

The recommended source boundary is:

1. Ship a pinned modern UniDic release under its New BSD option for the initial pitch-accent display.
2. Exclude etymology and Origin/history content from MVP. Preserve revision-pinned Wiktionary with original Zenbu wording as one post-MVP option, and never reuse Shinjigen text or images without permission.
3. Use only the recordings published in the Tofugu/WaniKani open audio repository and the Kanji Alive open media release. Bundle the selected clips and play them locally; use an app-defined Japanese system-speech fallback when no selected human clip exists.
4. Import a dated JMdict English snapshot directly from EDRDG, retain stable `ent_seq` identifiers, document Zenbu's transforms, and check upstream at least monthly.
5. Import dated Japanese/English Tatoeba text exports with sentence IDs, contributors, licenses, and deterministic Zenbu-owned selection and ordering. Do not import Tatoeba audio for this feature.
6. Build kanji metadata, radical lookup, decomposition, and stroke-order artifacts from pinned KANJIDIC2, RADKFILE/KRADFILE, and a stable KanjiVG release, with each source kept separately attributable.

CJKI and Shinjigen become optional future procurement choices, not coding-readiness blockers. No public fixed price exists for either source because neither provider publishes a reusable off-the-shelf data license for this use.

## 1. Pitch accent: CJKI is available, but optional

### What CJKI actually offers

CJKI's likely relevant product is the Japanese Phonetic Database (JPD). Its official page describes more than 110,000 entries with IPA transcriptions, pitch-accent codes, part-of-speech information, proper-noun semantic classifications, and allophonic variants. That is a richer commercial source than the single pitch contour Lookup needs. [CJKI Japanese Phonetic Database](https://www.cjk.org/data/japanese/nlp/japanese-phonetic-database/)

CJKI does not publish a list price or a self-service license. Its licensing page says that data packages are customized, fees are determined case by case from the data type, entry count, fields, and intended use, and possible commercial structures include a one-time fee, annual fee, royalties, consulting, and work for hire. Delivery can be arranged as delimited text, Excel, XML, HTML, or another requested format. [CJKI licensing](https://www.cjk.org/licensing/)

Therefore:

- Product availability is confirmed.
- Public pricing is not available.
- A quote and contract are required before Zenbu can redistribute JPD-derived data in a commercial mobile app.
- Mobile distribution, offline bundling, permitted transformations, update rights, and attribution would need to be written into that contract; the public product page does not grant them.
- CJKI accepts inquiries through its official contact form and publishes telephone and email contact details. [CJKI contact](https://www.cjk.org/contact/)

### UniDic is sufficient for the initial Zenbu feature

The official UniDic manual documents the fields required for an app-owned pitch display: `aType` is the accent-nucleus position, `aModType` describes accent changes caused by inflection, and `aConType` describes changes caused by combining adjacent elements. The same manual explains that UniDic records an isolated word's accent and models changes for inflection, compounds, and attachment of particles or auxiliaries. [UniDic manual, pp. 16–17](https://clrd.ninjal.ac.jp/unidic/UNIDIC_manual.pdf)

NINJAL's official download page identifies UniDic for Contemporary Written Japanese 3.1.0 as the published current download and offers a GPL 2.0 / LGPL 2.1 / New BSD triple license. [UniDic download](https://clrd.ninjal.ac.jp/unidic/en/) NINJAL explicitly states that version 2.x and later of Contemporary Written Japanese UniDic may be used commercially under that triple license. [UniDic commercial-use note](https://clrd.ninjal.ac.jp/unidic/en/commerce_use_en.html)

For Zenbu, select the New BSD option and retain the release's `BSD` and `AUTHORS` files. NINJAL's FAQ says those files should be packaged when UniDic is used in distributed software and that the relevant authors and BSD use should be identified for web or printed outputs. It also says one of the triple-license alternatives may be selected. [UniDic licensing FAQ](https://clrd.ninjal.ac.jp/unidic/faq.html#license)

Recommended implementation boundary:

- Pin `UniDic for Contemporary Written Japanese 3.1.0` and record a checksum of the downloaded archive.
- Extract only the fields and records needed by Lookup into an app-owned, versioned language-data artifact.
- Retain the UniDic release license and authors files and show the attribution in Settings.
- Treat ambiguous matches and entries absent from UniDic as “pitch unavailable”; do not synthesize a contour from Nihongo's presentation.
- Do not claim equivalence with CJKI's JPD coverage, especially for proper nouns and less-common compounds.

This supports a useful, lawful initial pitch-accent feature without procurement. CJKI remains a possible later coverage upgrade if product metrics justify requesting a quote.

### Blocker disposition

- `PROVENANCE-GAP-CJKI-DELIVERY-LICENSE`: downgrade to a nonblocking optional-procurement decision. It requires business/legal authority only if Zenbu later elects to ship CJKI data.
- `PROVENANCE-GAP-UNIDIC-VERSION-ROLE`: close as a discovery blocker once the implementation records UniDic 3.1.0, the New BSD choice, archive checksum, extracted fields, and attribution files. That is routine engineering work, not stakeholder or procurement work.

## 2. Etymology: exclude Shinjigen expression

### Shinjigen is not a reusable public dataset

KADOKAWA's official page identifies *Kadokawa Shinjigen, Revised New Edition* as its published kanji dictionary and promotes its explanations and ancient-character material. It does not offer that text or imagery under an open-data license. [KADOKAWA Shinjigen product page](https://promo.kadokawa.co.jp/shinjigen/)

KADOKAWA's copyright policy says unauthorized use of its published books, ebooks, text, images, illustrations, photographs, and other works is prohibited and directs corporate users to request permission for publication use. [KADOKAWA copyright and permission policy](https://www.kadokawa.co.jp/copyrightpolicy/)

The clean result is not “contact KADOKAWA before work can continue.” It is to omit Shinjigen's expressive text and images. Permission and potentially commercial terms are needed only if the product later chooses to reproduce or adapt that material.

### Lawful independent route

Use a revision-pinned Wiktionary pipeline instead of copying Nihongo's Origin prose or Shinjigen expression:

1. Pin the English and/or Japanese Wiktionary page revision used for every imported or adapted etymology record. Store the page URL, revision ID, retrieval date, contributor-history URL, and any source-specific notices.
2. Extract only the relevant origin claims and author Zenbu's own concise presentation. Do not use Nihongo as an intermediate source and do not copy Shinjigen prose or images.
3. License the adapted etymology text/data boundary under CC BY-SA 4.0, provide the source/history link, identify modifications, and keep it separable from app code and unrelated proprietary data.
4. Exclude entry elements carrying separate or fair-use-only terms. Wiktionary warns that entries may include externally sourced text, images, or sound under different terms; each non-text item needs its own license review.
5. For bulk reproducibility, retain the Wikimedia dump filename and checksum or archive the exact API revision payload used to generate the record. Wikimedia publishes current and history dumps for Japanese Wiktionary. [Japanese Wiktionary dumps](https://dumps.wikimedia.org/jawiktionary/latest/)

Wiktionary states that its original entry text is available under CC BY-SA 4.0 and GFDL and describes attribution, share-alike, source-history, and separately licensed material requirements. [Wiktionary copyright policy](https://en.wiktionary.org/wiki/Wiktionary:Copyrights) The Wikimedia terms likewise allow attribution through the article URL/history and require modified text to remain under CC BY-SA 4.0 or later. [Wikimedia Terms of Use — licensing](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use/en#7._Licensing_of_Content)

Images should be omitted initially. If later desired, select only individually reviewed Wikimedia Commons files and retain each file's author, source, license, and modification record; never reuse a screenshot or illustration from Nihongo or Shinjigen.

### Blocker disposition

- `PROVENANCE-GAP-ETYMOLOGY-REVISION-RIGHTS`: downgrade from a stakeholder/legal blocker to an implementation provenance task under the source boundary above. It requires business/legal authority only if Zenbu elects to reproduce or adapt Shinjigen material. Exact Nihongo revision selection and prose are not parity requirements.

## 3. Human pronunciation audio: reusable releases exist

The Settings attribution to WaniKani, Tofugu, and Kanji Alive identifies source families, but Zenbu should acquire clips from the providers' published open releases rather than extracting or assuming rights to the clips inside Nihongo.

### Tofugu/WaniKani open audio

Tofugu's official repository states that it contains mainly older WaniKani vocabulary recordings that were replaced on WaniKani. It identifies a native Tokyo-accent male professional voice and a native Kansai-accent female amateur voice, and specifically requests attribution to both Tofugu and WaniKani. [Tofugu/WaniKani audio repository](https://github.com/tofugu/japanese-vocabulary-pronunciation-audio)

Pin repository commit [`9725e0e7d628ab616e8b14e126d3daa33eba8d36`](https://github.com/tofugu/japanese-vocabulary-pronunciation-audio/tree/9725e0e7d628ab616e8b14e126d3daa33eba8d36). At that revision the repository tree contains 6,355 MP3 files and 5,461 Ogg files; filenames encode the written form and reading. The differing format counts mean ingestion must build a manifest from the selected format rather than assume one-to-one format coverage. [Pinned repository tree](https://api.github.com/repos/tofugu/japanese-vocabulary-pronunciation-audio/git/trees/9725e0e7d628ab616e8b14e126d3daa33eba8d36?recursive=1)

The repository applies CC BY-SA 4.0. Its license permits reproduction, sharing, and adaptation, including technical format changes, subject to attribution. Adapted audio must use the same or a compatible ShareAlike license, modifications must be identified, and downstream rights cannot be restricted by additional legal terms or effective technological measures. [Tofugu/WaniKani repository license](https://github.com/tofugu/japanese-vocabulary-pronunciation-audio/blob/9725e0e7d628ab616e8b14e126d3daa33eba8d36/LICENSE)

Practical compliance:

- Prefer the existing MP3 without editing.
- Attribute both Tofugu and WaniKani, name CC BY-SA 4.0, link the pinned repository and license, and state whether the file was changed.
- Keep a per-file source manifest and ship the license text.
- Keep these audio files as separable assets. If App Store technical protection might prevent recipients from exercising the licensed rights in the files, also publish the exact shipped CC audio asset set or a deterministic manifest pointing to the provider files through a non-DRM channel. Legal review should confirm the final distribution packaging; acquiring and testing the open files does not require procurement.
- Do not assume WaniKani's newer/current recordings share this license. Only use files present in the pinned open repository.

### Kanji Alive open audio

Kanji Alive's official data/media repository expressly includes 10,187 example-word pronunciation files recorded by native Japanese speakers, in Opus, AAC, Ogg, and MP3 formats, and applies CC BY 4.0 to the repository work. [Kanji Alive data and media repository](https://github.com/kanjialive/kanji-data-media)

Pin repository commit [`2d2a4931eec6e0cb532d5102766273c2323f96db`](https://github.com/kanjialive/kanji-data-media/tree/2d2a4931eec6e0cb532d5102766273c2323f96db). The provider's audio instructions map each kanji's ordered example list to filename suffixes and publish downloadable archives, including an iOS-friendly AAC archive. [Kanji Alive audio instructions](https://github.com/kanjialive/kanji-data-media/blob/2d2a4931eec6e0cb532d5102766273c2323f96db/examples-audio/README.md)

Kanji Alive's credits page lists four categories excluded from the general CC BY 4.0 release: mnemonic hints and graphics, supported-dictionary references, supported-textbook organization, and commercial-font images. Pronunciation audio is not one of those exceptions and is explicitly included in the repository's licensed media description. [Kanji Alive credits and exceptions](https://kanjialive.com/credits/) The repository license requires attribution under CC BY 4.0. [Kanji Alive repository license](https://github.com/kanjialive/kanji-data-media/blob/2d2a4931eec6e0cb532d5102766273c2323f96db/LICENSE.md)

Practical compliance:

- Use the provider's AAC archive and `ka_data.csv` mapping.
- Attribute Kanji Alive, name and link CC BY 4.0, link the pinned source, and identify any modifications.
- Retain a per-file source manifest and license text.
- Do not ingest the four excluded content categories.

### Simple tap-to-play contract

Use a single app-owned behavior instead of reverse-engineering Nihongo's private routing:

1. Resolve a pronunciation by normalized written form plus reading.
2. Prefer a locally bundled Tofugu/WaniKani clip; otherwise use a locally bundled Kanji Alive clip.
3. If neither exists, speak the kana reading through `AVSpeechSynthesizer` using a Japanese voice. Do not infer undocumented Nihongo voice IDs, rates, or pitch settings.
4. A tap while idle starts playback. A tap during playback restarts that pronunciation from the beginning. Starting another pronunciation stops the current one and starts the new one.
5. If neither a licensed clip nor an available Japanese system voice can start, show a short nonblocking “Audio unavailable” state; never leave a visible Play button that silently does nothing.

Apple documents `AVAudioPlayer` as the basic API for playing a local file or buffer and `play()` as asynchronous playback. [Apple `AVAudioPlayer`](https://developer.apple.com/documentation/avfaudio/avaudioplayer) Apple documents `AVSpeechSynthesizer` and `AVSpeechUtterance` as the system APIs for speaking supplied text and selecting a voice; if no voice is specified, the system default is used. [Apple `AVSpeechSynthesizer`](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer) [Apple utterance voice behavior](https://developer.apple.com/documentation/avfaudio/avspeechutterance/voice)

Bundling the selected human clips makes those paths work offline. System-speech fallback depends on an appropriate local voice being available, so the app should test availability rather than promise that every possible entry has offline audio.

### Blocker disposition

- `PROVENANCE-GAP-HUMAN-AUDIO-SOURCE-RIGHTS`: downgrade from a stakeholder/procurement blocker to a routine asset-ingestion and attribution task for the pinned open releases. Final App Store packaging of the CC BY-SA assets merits legal review, but no provider negotiation or payment is required for the published files.
- `PROVENANCE-GAP-SPEECH-SYNTHESIS-IMPLEMENTATION`: close as an exact-reference blocker. Zenbu should own the simple fallback contract above; exact Nihongo API, voice, rate, caching, and interruption choices are not requirements.
- Exact Nihongo clip-to-control routing and exact clip identity should remain explicitly out of scope. Source each Zenbu clip directly from its pinned provider release and manifest it.

## 4. Dictionary entries: pin Zenbu's own JMdict snapshot

### Official source and license boundary

EDRDG describes JMdict as a multilingual lexical database generated daily from a source database that is updated almost every day. The project's current-download link always points to the latest file. [EDRDG JMdict project](https://www.edrdg.org/jmdict/j_jmdict.html)

For Lookup's English dictionary content, import the official [`JMdict_e.gz`](https://www.edrdg.org/pub/Nihongo/JMdict_e.gz) export rather than a third-party conversion. Using the English-only export avoids importing other-language translations whose copyright may be held separately by their compilers. The JMdict DTD defines `ent_seq` as the unique numeric sequence number for an entry and documents the kanji, reading, sense, part-of-speech, field, miscellaneous, loan-source, and gloss structure. [JMdict DTD](https://www.edrdg.org/jmdict/jmdict_dtd_h.html)

The EDRDG general license applies to JMdict and data derived from it. It is CC BY-SA 4.0, permits commercial use and bundling in a paid smartphone app, explicitly says software using the files does not need to be open source, and does not require a separately signed contract. For a smartphone app, EDRDG requires source acknowledgement on a reachable About/Sources-style screen and copies of or links to the documentation and license. It also requires a procedure for regularly updating incorporated dictionary data and gives monthly updates for web dictionaries as its example cadence. [EDRDG general dictionary license](https://www.edrdg.org/edrdg/licence.html) EDRDG publishes sample acknowledgement language for software packages. [EDRDG sample acknowledgements](https://www.edrdg.org/edrdg/sample.html)

### App-owned import contract

Every JMdict import should create an immutable provenance record containing:

- the exact official download URL;
- fetch timestamp in UTC, HTTP `Last-Modified` and `ETag` values, compressed-file byte count, and SHA-256;
- detected DTD/schema revision;
- included languages (`eng` only for the initial feature);
- source `ent_seq` for every output record;
- the import-tool revision and a machine-readable transform manifest;
- counts of retained, rejected, and merged source entries, with reason codes;
- the prior snapshot and a row-level add/change/delete report.

Zenbu may normalize source fields into its own schema, build search indexes, compute display groupings, and add app-owned ranking data, but the EDRDG-derived artifact and transformation manifest should remain separately identifiable under CC BY-SA 4.0. The proprietary app code and independently authored ranking logic do not need to adopt that license, consistent with EDRDG's explicit software exception.

Run an automated upstream check at least monthly, build and test a candidate refreshed artifact when the source changes, and record why a candidate was promoted or held. Shipping a frozen historical snapshot indefinitely is inconsistent with EDRDG's update condition.

### Why Nihongo's snapshot is nonblocking

Nihongo's private snapshot, edits, deletions, derived fields, and search transformations are neither needed nor available from EDRDG. Zenbu's source-of-truth contract is the pinned official export plus its own disclosed transforms. Observed Nihongo screens remain product-reference evidence for which fields and interactions are useful, not authority for database contents or ranking.

### Blocker disposition

- `PROVENANCE-GAP-JMDICT-SNAPSHOT`: close as an exact-reference blocker. Replace it with a nonblocking implementation task to create the importer, immutable snapshot manifest, source acknowledgements, transform report, and monthly update check. No user, provider, procurement, or additional legal authority is needed under the published EDRDG license.

## 5. Example sentences: deterministic Tatoeba text selection

### Official exports and license boundary

Tatoeba publishes weekly exports every Saturday and provides sentence IDs, language codes, text, direct translation links, Japanese indices, detailed sentence metadata, user reviews, and separate audio metadata. Its download page says the main text files are CC BY 2.0 FR, with a subset also available under CC0 1.0, and notes that many Japanese and English sentences originate in the public-domain Tanaka Corpus. [Tatoeba downloads](https://tatoeba.org/en/downloads)

Tatoeba's terms make text attribution contributor-specific: the default text license is CC BY 2.0 FR, reuse must cite the author, and the reuser remains responsible for retaining the applicable license. Audio is different: each contributor selects a license, and some recordings cannot be reused commercially, modified, or reused outside Tatoeba. [Tatoeba terms of use](https://tatoeba.org/en/terms_of_use)

The initial Lookup source set should therefore contain text only:

- `jpn_sentences_detailed.tsv.bz2` for Japanese sentence ID, text, contributor, and timestamps;
- `eng_sentences_detailed.tsv.bz2` for linked English sentence metadata;
- `jpn-eng_links.tsv.bz2` for direct Japanese-to-English translation links;
- `jpn_indices.tar.bz2` for the Japanese indexing/annotation records used to associate vocabulary with sentence pairs;
- optional `users_sentences.csv` and tags for deterministic quality exclusions.

These are published through Tatoeba's [official export host](https://downloads.tatoeba.org/exports/) and [Japanese per-language export directory](https://downloads.tatoeba.org/exports/per_language/jpn/). Do not ingest `sentences_with_audio` or download audio files for this route; pronunciation audio is already covered by the separately licensed providers in section 3.

### App-owned selection and ordering contract

For every import, retain export timestamp and SHA-256 for each compressed input. Preserve both sentence IDs, both contributor usernames, both source URLs, the text license, and the exact unmodified texts in the output provenance manifest.

Use this deterministic initial policy:

1. Keep only direct Japanese-English links for which both sentence records exist in the same pinned export.
2. Associate Japanese sentences to JMdict entries using the pinned Japanese-index record and explicit written-form/reading evidence; do not infer associations from Nihongo's ordering.
3. Exclude pairs marked for deletion or correction and pairs with a negative review; record each exclusion reason.
4. Deduplicate identical Japanese/English text pairs while retaining every source sentence ID and contributor attribution.
5. Prefer an exact indexed reading match, then a positive review, then shorter Japanese text, then ascending Japanese sentence ID. This makes ordering reproducible without pretending it matches Nihongo's private ranking.
6. Display a general Tatoeba attribution in Settings and retain a reachable per-sentence source record containing sentence URLs, contributors, and CC BY 2.0 FR. If a sentence is imported from the CC0 subset, retain that per-item license instead.

If product quality later needs manual curation, store allow/deny/reorder decisions as app-owned overlay records keyed by stable Tatoeba sentence IDs, with author, reason, and timestamp. Never edit the upstream text in place without marking the change and reviewing the resulting attribution/license obligation.

### Why Nihongo's selection is nonblocking

Nihongo's historical Tatoeba snapshot, filters, associations, edits, and ordering explain its exact visible corpus but do not define Zenbu's product correctness. Lookup needs useful, attributable example sentences with deterministic behavior. A pinned official export plus an explicit Zenbu selection policy satisfies that need and is independently reproducible.

### Blocker disposition

- `PROVENANCE-GAP-TATOEBA-SELECTION`: close as an exact-reference blocker. Replace it with a nonblocking importer/curation task implementing the pinned text-only export, per-sentence provenance, deterministic filters and ordering, and attribution UI. No user or provider authority is needed. Tatoeba audio remains excluded rather than blocked.

## 6. Kanji, radicals, components, and stroke order

### KANJIDIC2 for kanji metadata

EDRDG's KANJIDIC2 project provides an XML database covering kanji from JIS X 0208, JIS X 0212, and JIS X 0213 and documents fields such as radical classification, stroke counts, grade, frequency, variants, readings, meanings, and dictionary/query codes. The data is updated from time to time, so consumers should not treat its structure or content as immutable. [EDRDG KANJIDIC2 project](https://www.edrdg.org/kanjidic/kanjd2index_legacy.html) Use the official [`kanjidic2.xml.gz`](https://www.edrdg.org/pub/Nihongo/kanjidic2.xml.gz) export.

KANJIDIC2 falls under the same EDRDG CC BY-SA 4.0 license, smartphone attribution requirements, commercial-use permission, and update procedure as JMdict. Its special conditions identify third-party contributors for several fields. The KANJIDIC project page separately identifies SKIP codes as CC BY-NC-SA 4.0. [EDRDG KANJIDIC copyright and permissions](https://www.edrdg.org/wiki/KANJIDIC_Project.html#Copyright_and_Permissions)

For a commercial Lookup build, omit `query_code` values with `qc_type="skip"` and the associated SKIP misclassification fields. The initial artifact should retain only fields needed for the visible product: Unicode literal, radical values, accepted and variant stroke counts, grade/classification, frequency where used, variants, Japanese readings, and English meanings. Keep each retained field's source path in the transform manifest and avoid unrelated proprietary dictionary-reference indices and descriptor codes.

### RADKFILE/KRADFILE for radical lookup

EDRDG describes KRADFILE as a mapping from each of 6,355 JIS X 0208 kanji to visible components and RADKFILE as its inversion for multi-radical lookup. The project explicitly warns that these visible elements are not the same as the classical 214 radicals. Both files are available under the EDRDG license. [EDRDG RADKFILE/KRADFILE](https://www.edrdg.org/krad/kradinf.html)

Pin both official exports, [`kradfile.gz`](https://www.edrdg.org/pub/Nihongo/kradfile.gz) and [`radkfile.gz`](https://www.edrdg.org/pub/Nihongo/radkfile.gz), with fetch metadata and SHA-256. Treat KRADFILE as the canonical source record and generate the app's inverted picker index from it; compare the generated inversion to RADKFILE as an integrity check. Label this UI as component/radical lookup without claiming every picker element is a classical radical.

### KanjiVG for paths and animation

KanjiVG supplies SVG path geometry, stroke direction and order, component groups, radical annotations, stroke types, and optional stroke-number positions. Its format documentation also calls out inconsistent or undocumented fields, including portions of phonetic and position metadata, so Zenbu should consume only documented fields it tests. [KanjiVG project](https://kanjivg.tagaini.net/) [KanjiVG SVG format](https://kanjivg.tagaini.net/svg-format.html)

Pin the latest stable release rather than a moving branch or pre-release: [`r20250816`](https://github.com/KanjiVG/kanjivg/releases/tag/r20250816), commit `bd13ffbcc9d85cb86ae98bbbf001d9069220b901`. The project's README recommends the `main` release archive for consumers who need immediately usable non-variant SVGs. [KanjiVG release-format documentation](https://github.com/KanjiVG/kanjivg/blob/r20250816/README.md)

KanjiVG is CC BY-SA 3.0. Its license permits reproduction, collections, and adaptation, but requires attribution, license notice/link, identification of modifications, ShareAlike for adaptations, and no effective technological restrictions on the licensed work. It explicitly says including the unmodified work in a collection does not force the rest of the collection under the same license. [KanjiVG license](https://github.com/KanjiVG/kanjivg/blob/r20250816/COPYING)

Keep the source SVGs and Zenbu-derived path/animation artifact separable from app code, publish the exact shipped KanjiVG-derived asset set through a non-DRM channel if App Store packaging would otherwise restrict recipients, and retain the release tag, commit, source file, character code point, modification flag, and license in the asset manifest. Generate diagrams and animation timing with app-owned code; KanjiVG supplies ordered paths, not Nihongo's private timing values.

### App-owned ontology and conflict policy

Build one versioned `KanjiReferenceData` artifact with separate source namespaces:

- `edrdg.kanjidic2` for kanji metadata and classification;
- `edrdg.kradfile` for visible-component membership;
- `kanjivg` for component group hierarchy and ordered stroke paths;
- `zenbu` for display labels, picker grouping, normalizations, corrections, animation timing, and conflict decisions.

Key records by Unicode code point and represent variant/component relationships explicitly. Do not silently merge disagreements. For example, keep KANJIDIC2 radical values, KRADFILE visible elements, and KanjiVG's `general`, `jis`, `nelson`, or `tradit` radical annotations as distinct typed assertions. Each Zenbu override should identify the upstream assertion, chosen value, reason, author, and date.

### Why Nihongo's sources are nonblocking

The user-visible requirement is kanji metadata, component-based lookup, and stroke-order presentation. It does not require Zenbu to reproduce Nihongo's undisclosed ontology, corrections, paths, or diagram generator. The public upstreams above provide a complete declared implementation boundary; differences from Nihongo become testable product choices recorded in the Zenbu overlay rather than missing authority.

### Blocker disposition

- `PROVENANCE-GAP-KANJI-RADICAL-STROKE-SOURCES`: close as an exact-reference blocker. Replace it with nonblocking ingestion tasks for pinned EDRDG and KanjiVG releases, excluded SKIP fields, source-separated assertions, deterministic conflict handling, attribution, update checks, and a KanjiVG asset-distribution review. No user or provider permission is needed under the published licenses.

## Authority still genuinely required

No stakeholder authority is required to continue implementation with the recommended boundary.

Authority is required only for optional future choices:

- A product decision to pursue broader CJKI/JPD coverage, followed by authority to send product requirements, receive a quote, negotiate redistribution/offline/derivative rights, and approve spend.
- A product decision to reproduce or adapt Shinjigen expression or images, followed by authority to request and accept KADOKAWA's permission terms.
- Legal approval of the final App Store packaging strategy for CC BY-SA audio or vector assets if the release uses Tofugu/WaniKani or KanjiVG files.

Those optional decisions should not block the initial Lookup implementation based on UniDic, a pinned JMdict English export, deterministic Tatoeba text selection, pinned EDRDG/KanjiVG kanji sources, independently sourced etymology content, open human-audio releases, and an app-owned speech fallback.
