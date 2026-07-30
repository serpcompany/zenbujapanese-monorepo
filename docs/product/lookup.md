# Lookup

Status: landscape definition established; exhaustive parity documentation deferred

## Role

Lookup is Zenbu Japanese's dictionary and limited-content lookup Product Experience.

## Product target

Lookup requires complete parity with the Nihongo Pro iOS app.

Complete parity includes its observed:

- feature set
- screen and navigation inventory
- user flows
- interaction behavior
- information hierarchy
- screen structure and visual layout
- functionality and data behavior

Nihongo Pro is the product authority for Lookup. A difference is not an implementation interpretation or optional simplification; it must be recorded as an explicit Zenbu deviation or addition.

Brand theming is the exception to parity: Lookup uses Zenbu's own colors, typography, logos, icons, and visual identity rather than cloning Nihongo Pro's branding.

## Language-stack parity

Lookup parity includes Nihongo Pro's underlying language data and processing behavior, not only screens displaying superficially similar fields.

The target is to identify and use the same data sources, libraries, and processing approaches Nihongo uses wherever they are obtainable, technically suitable, and legally licensable. This investigation includes at least:

- dictionary and example-sentence data
- search, ranking, parsing, tokenization, lemma resolution, and deinflection
- conjugation data and behavior
- pitch-accent data and matching behavior
- native pronunciation recordings
- text-to-speech voices, configuration, and readback behavior
- kanji, radical, stroke-order, and etymology data
- handwriting recognition
- OCR and recognized-text grouping

Equivalent output from an unrelated source is not automatically sufficient. If an exact Nihongo component cannot be identified, accessed, licensed, or used, the project must record that as an explicit unresolved gap or approved deviation. It must not silently substitute a convenient alternative while claiming complete parity.

The exhaustive Lookup audit must therefore include a source-by-source and capability-by-capability stack inventory. Each finding must distinguish:

- verified source or implementation
- evidence and date verified
- inferred but unconfirmed behavior
- unknown component
- license, attribution, redistribution, privacy, network, and offline constraints
- whether Zenbu can use the exact component
- any approved substitute and the measured parity gap

Preliminary research has identified possible or verified parts of the Nihongo stack, including JMdict-linked entries, CJK Dictionary Institute pitch-accent data, UniDic supplementation, attributed pronunciation recordings, English Wiktionary etymology, and Google Cloud Vision or OCR.space for Photo Lookup. This is not a complete stack inventory, and it does not yet establish Nihongo's full dictionary construction, parsing, search-ranking, or audio/TTS implementation.

Current preliminary research is preserved at:

- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/zenbu-japanese-app/docs/research/data-sources/source-notes/legacy-data-source-analysis.md`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/zenbu-japanese-app/docs/research/product/reference-apps/nihongo/`

## Zenbu image-lookup additions

The defined product deviation is within Nihongo Pro's Search flow for **Take Photo**, **Photo Library**, and **Files**.

Nihongo parity remains the baseline: the selected image is OCR-processed, recognized Japanese is interactive, and the user can select recognized items for Lookup.

### Required for MVP: natural English translation

In addition to the Nihongo behavior, Zenbu presents a coherent, natural English translation of the Japanese content recognized in the image. This is a translation of the content as a whole, not merely a list of isolated dictionary definitions. Interactive OCR items and their Lookup behavior remain available alongside it.

The existing `japanese-app-v2` prototype is implementation reference material for this addition, but it is not the final specification.

### Future: contextual image explanation

A later enhancement may provide an AI-generated contextual explanation that considers all useful information available in the image—not only the OCR transcript. It may explain how the recognized language relates to the depicted object or scene, intended meaning, phrasing, tone, or other relevant visual context.

This contextual explanation is explicitly outside MVP. Its precise content, presentation, provider, privacy behavior, and quality requirements must be defined before implementation.

Historical reference material exists in:

- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/zenbu-japanese-app/docs/research/history/legacy-doc-system/parity-map.md`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/zenbu-japanese-app/docs/research/product/reference-apps/owll/screenshots/owll-ocr-result-explainer.png`

These references preserve the earlier idea; they are not authoritative requirements for the future feature.

The existing prototype parity audit and reference screenshots are preliminary reference material only:

- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-app-v2/docs/reference/lookup-flow.md`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-app-v2/docs/screenshots/reference-apps/`

They are neither comprehensive nor an authoritative inventory of Nihongo Pro. Future developers and agents must not treat their contents, omissions, or implementation assumptions as the complete Lookup specification.

Before implementation planning, an AI agent must perform and document an exhaustive, current analysis of Nihongo Pro. This must include a screen-by-screen inventory, complete feature inventory, navigation and entry paths, interaction behavior, visible states and variations, settings, data presented, relevant edge and error states, and the language-stack inventory defined above. The resulting verified parity specification—not memory or the existing prototype audit—will become the implementation reference.

## Lookup Capture

Nihongo Pro's camera, photo, and file OCR flow is part of the Lookup target. It handles single-shot or limited-content lookup rather than whole-work Media Analysis.

## Deferred documentation

- Produce a current, exhaustive AI-agent parity analysis and verified inventory before Lookup implementation planning.
- Identify, verify, and clear the licensing and technical use of each Nihongo language-stack component; record unknown or unavailable components explicitly.
- Define the detailed presentation and acceptance criteria for the MVP natural English translation during the exhaustive Lookup specification.
- Define the contextual image explanation as a separate post-MVP feature before implementing it.
