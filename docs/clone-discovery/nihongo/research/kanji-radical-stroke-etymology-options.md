# Licensed kanji, radical, stroke, and etymology options

Research date: 2026-08-06  
Decision ticket: [Research licensed kanji, radical, stroke, and etymology options](https://github.com/serpcompany/zenbujapanese-monorepo/issues/79)  
Scope: `PROVENANCE-GAP-KANJI-RADICAL-STROKE-SOURCES` and `PROVENANCE-GAP-ETYMOLOGY-REVISION-RIGHTS`

This note is a clean-room source-selection recommendation, not legal advice. It answers what Zenbu can independently use; it does not attempt to identify Nihongo's private snapshots, transformations, prose, or imagery.

## Recommendation

Adopt an app-owned **Language Reference Data** model with source-specific adapters and these source roles:

| Need | Recommended source | Role and boundary |
| --- | --- | --- |
| Canonical kanji identity and classification | KANJIDIC2 | Supply Unicode identity, classical/Nelson radical numbers, grade, stroke count, frequency, variants, readings, and meanings. Do not treat its dictionary cross-reference/search codes as Zenbu's domain model. |
| Visible components and stroke geometry | KanjiVG | Supply ordered Japanese SVG stroke paths plus its nested visual-element/radical annotations. Render the licensed paths with original Zenbu UI and animation code. |
| Multi-component lookup index | Derive from KanjiVG; optionally compare with KRADFILE | Prefer a reproducible index generated from the pinned KanjiVG component tree. KRADFILE may supplement validation or compatibility but is a flat, JIS X 0208-era visible-element relation, not a semantic ontology. |
| Etymology prose | Revision-pinned English/Japanese Wiktionary or original Zenbu authorship | The straightforward reusable lane is attributed CC BY-SA 4.0 text. A proprietary-text lane must be independently written from facts and separately cleared sources, with no Nihongo or Shinjigen expression. |
| Etymology imagery | Exclude initially | Add an image only after per-file provenance and license review, or commission original art from cleared factual references. Never inherit an image's rights from the containing Wiktionary page. |
| Shinjigen material | Exclude | Do not copy, translate, paraphrase closely, trace, or reproduce its prose, selection, ancient-character images, or layout without written permission from KADOKAWA. |

This is sufficient to implement the observable product roles without proving that Nihongo used the same upstreams. Exact upstream identity is therefore not an implementation-readiness requirement and must not be claimed.

## Why these sources fit

### KANJIDIC2: canonical classification, not decomposition or etymology

KANJIDIC2's current documentation makes its DTD the primary format documentation. It exposes Unicode identity, classical and Nelson radicals, Japanese school grade, accepted and alternate stroke counts, frequency, variants, readings, and meanings. These are appropriate inputs to Zenbu-owned records, with field-level source provenance retained. [KANJIDIC project fields](https://www.edrdg.org/wiki/KANJIDIC_Project.html)

The project files are licensed under CC BY-SA 4.0. EDRDG explicitly permits commercial software and says the software itself need not be open source, but requires source acknowledgement, license/documentation links in software, an accessible Sources/About screen for mobile apps, and a process for regular updates from current files. [EDRDG General Dictionary Licence Statement](https://www.edrdg.org/edrdg/licence.html)

Two implementation cautions follow:

- KANJIDIC2 is not a visual decomposition graph and is not an etymology source. Its radical fields and stroke counts should not be stretched into those roles.
- Some embedded search and dictionary-reference codes have third-party histories. For example, the SKIP rights-holder's page currently places the system and established codes under CC BY-SA 4.0 and permits commercial use with a specific Jack Halpern/KDPS attribution, while the EDRDG project page contains a contradictory `Attribution-Noncommercial` link label. The rights-holder page is the more direct authority, but Zenbu does not need SKIP for the recommended experience. Exclude all `query_code` and `dic_ref` fields by default; add one only after a field-specific license review. [KDPS SKIP conditions](https://www.kanji.org/dictionaries/skip_permission.htm) [EDRDG KANJIDIC copyright notes](https://www.edrdg.org/wiki/KANJIDIC_Project.html#Copyright_and_Permissions)

The production import should pin every acquired payload by retrieval timestamp, canonical URL, SHA-256, parser version, and emitted-record hash. As a reproducibility example—not a permanent selected release—the mutable HTTPS file retrieved on 2026-08-06 from `https://www.edrdg.org/kanjidic/kanjidic2.xml.gz` had SHA-256 `0b9f488381f40e4a374ae075ee00de304fa815ad83f3bd25fb7ae00555cf11f5` and an HTTP `Last-Modified` value of `Wed, 05 Aug 2026 02:35:04 GMT`.

### RADKFILE/KRADFILE: optional flat component search

EDRDG describes KRADFILE as 6,355 JIS X 0208 kanji mapped to visible elements and explicitly warns that those elements are not the classical 214 radicals. RADKFILE is the inverted lookup form. The relation is useful for multi-component search, but it is flat and based on typical glyph appearance; it should not become Zenbu's semantic element identity or decomposition hierarchy. [RADKFILE/KRADFILE documentation](https://www.edrdg.org/krad/kradinf.html)

The base RADKFILE/KRADFILE files fall under the same EDRDG CC BY-SA 4.0 statement as KANJIDIC2. The extended RADKFILE2/KRADFILE2 rights are separately held by Jim Rose, so the recommended import excludes those extended files unless their current terms are independently verified. [EDRDG licence scope](https://www.edrdg.org/edrdg/licence.html) [RADKFILE/KRADFILE copyright note](https://www.edrdg.org/krad/kradinf.html#Copyright)

Because KanjiVG already supplies a richer nested component structure, the lowest-complexity design is to derive Zenbu's lookup index from KanjiVG and use KRADFILE only as a non-authoritative comparison fixture. This avoids merging two element vocabularies before the product demonstrates a need.

### KanjiVG: stroke order and a visual component tree

KanjiVG provides Japanese-form SVG data: ordered stroke paths, stroke directions/types, nested component groups, radical annotations, and variant information. Its documentation says individual paths appear in stroke order and its group hierarchy describes elements and which strokes form radicals. It also documents known inconsistencies, including some component-position and phonetic annotations; adapters must preserve `unknown` rather than promote every annotation to canonical fact. [KanjiVG overview](https://kanjivg.tagaini.net/) [SVG format](https://kanjivg.tagaini.net/svg-format.html) [radical conventions](https://kanjivg.tagaini.net/radicals.html)

KanjiVG is CC BY-SA 3.0. The project recommends the `main.zip` release for non-variant SVGs; Zenbu needs the annotated form, not `stripped.zip`, because the latter removes radical and element attributes. [KanjiVG repository and release formats](https://github.com/KanjiVG/kanjivg) [KanjiVG files](https://kanjivg.tagaini.net/files.html)

Use the latest accepted stable release, not an unreviewed branch head or prerelease. As of this research, the latest stable release is `r20250816`; its official `kanjivg-20250816-main.zip` asset reports SHA-256 `69a2944ec1183086fdee5ba9c1f48bc306b867480a95b2f337f3203bf50689a3`. A newer `r20260714` release is explicitly marked prerelease and should enter only through the normal update-validation process. [KanjiVG releases](https://github.com/KanjiVG/kanjivg/releases)

The boundary is:

- The original SVG/path data and any adapted path data remain attributable under CC BY-SA 3.0.
- Zenbu owns its renderer, animation state machine, colors, timing, interaction, and surrounding UI; those should not be copied from Nihongo.
- Preserve KanjiVG's source identity per glyph and indicate modifications. Do not claim Zenbu authored the paths.
- Do not infer etymology or semantic composition solely from visual nesting. `kvg:element` is defined primarily as the character that physically represents a group; it is not automatically an etymological assertion. [KanjiVG `element` definition](https://kanjivg.tagaini.net/svg-format.html#element)

### Wiktionary: revision-addressable, share-alike etymology text

English Wiktionary says entry text may be reused under CC BY-SA 4.0 or the GFDL, subject to the applicable terms; Japanese Wiktionary likewise states that its documents are generally available under CC BY-SA 4.0 and GFDL while warning that imported content can carry different conditions. [English Wiktionary copyrights](https://en.wiktionary.org/wiki/Wiktionary:Copyrights) [Japanese Wiktionary copyright policy](https://ja.wiktionary.org/wiki/Wiktionary:%E8%91%97%E4%BD%9C%E6%A8%A9)

Use CC BY-SA 4.0 as the uniform text-reuse path. For every imported or adapted statement, retain:

- edition (`en.wiktionary.org` or `ja.wiktionary.org`), page title and canonical page ID;
- exact revision ID, revision timestamp, retrieval timestamp, source permalink, and content SHA-256;
- the extracted section and source language;
- whether Zenbu copied, translated, summarized, or added material;
- any imported-source notice visible in the page, history, or discussion page;
- CC BY-SA 4.0 license URI and the page/history link used to credit contributors.

MediaWiki's revision API can return revision IDs, timestamps, users, SHA-1 values, and content, so this ledger is automatable. Wikimedia's Terms of Use allow attribution by linking to the reused page because its history identifies contributors, require preservation of additional source notices, require modified text to be CC BY-SA 4.0 or later, and require a license notice plus license link or text. [MediaWiki Revisions API](https://www.mediawiki.org/wiki/API:Revisions) [Wikimedia Terms of Use, content reuse](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content)

Wikimedia-hosted images are not covered automatically by the page-text license. Each image needs its own description-page check for creator, source, public-domain rationale or license, attribution, and modification terms. The initial implementation should omit etymology imagery rather than silently generalize page licensing. [Wikimedia Terms of Use, non-text media](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content)

### Shinjigen: a consulted source is not a reusable source

KADOKAWA markets the 2017 *Kadokawa Shinjigen Revised New Edition* as a 1,968-page authored dictionary containing detailed origin explanations and about 9,000 ancient-character forms. Those prose and image assets are precisely the expressive materials Zenbu must not copy from Nihongo or from the book. [KADOKAWA product record](https://www.kadokawa.co.jp/product/201103000887/)

KADOKAWA's current policy rejects unauthorized use of its published books, text, and images and directs organizations to request permission. No open or app-redistribution license was found. [KADOKAWA copyright policy](https://www.kadokawa.co.jp/copyrightpolicy/)

Therefore:

- exclude Shinjigen text, translations, ancient-character imagery, selection, ordering, and distinctive explanatory structure;
- do not use Nihongo's statement that Shinjigen was “consulted” as permission or as provenance for Zenbu content;
- seek KADOKAWA permission only if a later product decision specifically requires Shinjigen expression. That optional route would become an external dependency; it is not required by the recommended route.

## Authoring boundary: facts, expression, and images

The U.S. Copyright Office states that individual plain facts are not protected, while original text/art and a compilation's original selection, coordination, or arrangement can be. That boundary does not make close paraphrase or reconstruction of a dictionary safe; it supports recording independently verified facts in an app-owned schema while avoiding the source's wording and expressive organization. [Copyright Office database guidance](https://www.copyright.gov/register/tx-databases.html) [Copyright Office compilation guidance](https://www.copyright.gov/register/tx-compilations.html) [Copyright Office Compendium §313.3(C)](https://www.copyright.gov/comp3/docs/compendium.pdf)

Maintain two explicit etymology lanes:

1. **Attributed adaptation:** import or translate revision-pinned Wiktionary text; publish the resulting etymology text and modifications under CC BY-SA 4.0 with contributor/source links.
2. **Independent Zenbu authorship:** a researcher records source-cited propositions without copying prose, imagery, or selection; a separate author writes original learner-facing text from that fact record; editorial review checks both factual support and expressive independence. Nihongo and Shinjigen may not be input materials for this lane.

Never label a text “Zenbu-authored” merely because it was machine-paraphrased or translated from a protected source. Translation and close paraphrase remain adaptations of expression.

## App-owned model and source isolation

Normalize the selected inputs behind ADR 0001 rather than retaining provider schemas in Product Experience code:

```text
KanjiRecord
  scalar facts: unicode, grade, frequency, acceptedStrokeCount
  radical assertions[]: system, radicalId, sourceRef, confidence
  visual decompositions[]: tree, glyphConvention, sourceRef
  stroke models[]: ordered paths, glyphConvention, sourceRef, licenseRef
  etymology assertions[]: proposition, sourceRefs, editorialStatus
  etymology presentations[]: locale, text, authoringLane, licenseRef
```

Every source-derived value should carry a `SourceRef` containing source name, release/revision, retrieval date, upstream locator, content hash, adapter version, license identifier, attribution text, and modification status. Conflicts remain parallel assertions until a documented Zenbu rule chooses presentation; adapters must not erase disagreement.

Keep separately licensed payloads in distinct generated artifacts and retain a source-to-output manifest. This makes ShareAlike scope, notices, updates, removal, and correction reproducible and avoids claiming copyright over EDRDG or KanjiVG material.

## Mobile distribution and attribution

Before production distribution, obtain a focused license review of the concrete packaging. CC BY-SA prohibits additional legal or effective technological restrictions on licensed material, and Creative Commons specifically notes that platform DRM can create a problem when it restricts recipients' licensed rights. [Creative Commons FAQ on effective technological measures](https://creativecommons.org/faq/#can-i-use-effective-technological-measures-such-as-drm-when-i-share-cc-licensed-material)

The conservative iOS design is:

1. Ship proprietary app code separately from generated data artifacts.
2. Publish the exact KANJIDIC2-derived, KanjiVG-derived, and Wiktionary-derived artifacts through a non-DRM HTTPS source endpoint, alongside hashes, licenses, attribution, modification notices, and any share-alike source form needed to exercise reuse rights.
3. Let the app download and verify those artifacts, or ensure any bundled copy has an identical unrestricted copy available and that release counsel approves the channel.
4. Expose an in-app Sources screen reachable from normal navigation. Include EDRDG/KANJIDIC2, KanjiVG/Ulrich Apel, page-level Wiktionary history links, license links, snapshot/release identifiers, modification status, and a link to the unrestricted artifacts.
5. Ensure Zenbu's terms do not purport to override the third-party licenses.

EDRDG additionally requires a regular-update procedure. Run a scheduled monthly check, import only after schema/license/coverage tests pass, retain the previous release for rollback, regenerate source and output hashes, and publish a data-change report. KanjiVG and Wiktionary updates should use the same staged process even where no monthly cadence is mandated.

## Acceptance tests for the selected stack

Before implementation readiness is declared, the eventual source-selection decision should require:

- schema validation and deterministic import from pinned inputs;
- uniqueness and referential-integrity checks for kanji, radicals, elements, paths, and source references;
- a declared fixture crosswalk covering simple, compound, variant, missing-classification, and high-stroke-count kanji;
- stroke count/order and terminal-render tests against pinned KanjiVG fixtures;
- conflict fixtures where KANJIDIC2 radical classification and KanjiVG radical annotations differ;
- proof that visual components are not presented as etymological facts without an etymology source;
- generated attribution/license inventory with no unreferenced derived artifact;
- a check that every Wiktionary presentation resolves to its exact revision and contributor history;
- a check that every non-text image has its own rights record;
- a prohibited-source scan for Nihongo and Shinjigen copied prose/assets;
- update/rollback and removed-upstream-record tests;
- review of the final App Store/data-delivery arrangement against ShareAlike and no-additional-restrictions terms.

## Blocker disposition

| Blocker | Classification | Resolution and remaining decision |
| --- | --- | --- |
| `PROVENANCE-GAP-KANJI-RADICAL-STROKE-SOURCES` | `DECISION_NEEDED` | Exact Nihongo upstreams are not blocking. Select the recommended KANJIDIC2 + KanjiVG stack, decide whether KRADFILE comparison adds enough value, approve the share-alike packaging, and record the source-selection decision. No provider permission is required for the recommended sources when their licenses are followed. |
| `PROVENANCE-GAP-ETYMOLOGY-REVISION-RIGHTS` | `DECISION_NEEDED` | Exact Nihongo revisions and Shinjigen use are not blocking. Choose attributed Wiktionary adaptation, independent Zenbu authorship, or both; exclude Shinjigen and unvetted imagery. KADOKAWA permission is an optional external dependency only if the product later insists on Shinjigen expression. |

Recommended decision: approve both source stacks, use revision-pinned CC BY-SA Wiktionary text for initial etymology coverage, exclude imagery and Shinjigen from the first implementation, and require the source-isolated delivery/attribution design above. This converts both discovery blockers into an explicit Zenbu source-selection decision rather than further Nihongo investigation.
