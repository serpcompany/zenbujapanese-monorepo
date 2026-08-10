# Lookup

Status: implementation-ready discovery dossier complete; implementation not begun

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

The completed Lookup discovery dossier identifies the observable language behavior, approved Language Reference Data sources, Shared Capability boundaries, licensed substitutes, and prohibited exact-parity claims required for implementation. Exact undiscoverable Nihongo internals are not implementation blockers where the approved Zenbu-owned boundary satisfies the learner-facing contract.

The canonical implementation inputs are:

- `../clone-discovery/nihongo/implementation-handoff.md`
- `../clone-discovery/nihongo/parity-inventory.jsonl`
- `../clone-discovery/nihongo/scope.json`
- `../clone-discovery/nihongo/final-audit-report.json`

The final audit disposition is `READY_FOR_IMPLEMENTATION`. Clone and test status remain `unknown` and `not_run` until implementation supplies current evidence.

Earlier exploratory research is preserved at:

- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/zenbu-japanese-app/docs/research/data-sources/source-notes/legacy-data-source-analysis.md`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/zenbu-japanese-app/docs/research/product/reference-apps/nihongo/`

## Zenbu Image Text Flow additions

The defined product deviation is within Nihongo Pro's Search flow for **Take Photo**, **Photo Library**, and **Files**.

Nihongo parity remains the baseline: the selected image is OCR-processed, recognized Japanese is interactive, and the user can select recognized items for Lookup.

### Required for MVP: natural English translation

In addition to the Nihongo behavior, Zenbu presents a coherent, natural English translation of the Japanese content recognized in the image. This is a translation of the content as a whole, not merely a list of isolated dictionary definitions. Interactive OCR items and their Lookup behavior remain available alongside it.

Lookup does not request that whole-content translation merely because it has
recognized the image. The learner explicitly requests translation from the
Image Text Flow. Exact presentation remains a later UI decision.

The existing `japanese-app-v2` prototype is implementation reference material for this addition, but it is not the final specification.

### Future: contextual image explanation

A later enhancement may provide an AI-generated contextual explanation that considers all useful information available in the image—not only the OCR transcript. It may explain how the recognized language relates to the depicted object or scene, intended meaning, phrasing, tone, or other relevant visual context.

This contextual explanation is explicitly outside MVP. Its precise content, presentation, provider, privacy behavior, and quality requirements must be defined before implementation.

Historical reference material exists in:

- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/zenbu-japanese-app/docs/research/history/legacy-doc-system/parity-map.md`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/zenbu-japanese-app/docs/research/product/reference-apps/owll/screenshots/owll-ocr-result-explainer.png`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-app-v2/_archive/playground/zenbu/docs/features/ocr-camera.md`

The archived `japanese-app-v2` OCR Camera prototype is working evidence for the
value and feasibility of a rich image result. Its Gemini-backed
`/api/transcribe/ocr-explain` endpoint returned extracted text, natural
translation, a physical-context image overview, and phrase-by-phrase learning
explanations in one response; the corresponding UI lives at
`mobile/src/app/kanji-ocr.tsx`, and the endpoint implementation lives at
`backend/src/routes/transcribe.ts` within that archived prototype. This
mixed-purpose endpoint is reference material, not the production capability
boundary, provider selection, or an MVP commitment to contextual image
explanation.

These references preserve the earlier idea; they are not authoritative requirements for the future feature.

The existing prototype parity audit and reference screenshots remain supplemental historical reference material:

- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-app-v2/docs/reference/lookup-flow.md`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-app-v2/docs/screenshots/reference-apps/`

They are not the authoritative inventory of Nihongo Pro. Future developers and agents must use the canonical discovery dossier and must not promote historical prototype assumptions over its recorded evidence, variances, and exclusions.

The exhaustive current analysis is complete. It covers the approved Search-rooted surface graph, visible states, navigation and action edges, fixtures, language behavior, resources, design roles, assets, settings evidence, variances, and exclusions. Implementation must select an approved journey, consume its atomic ledger rows, and add clone evidence and passing tests before changing any row's status.

## Image Text Flow

Nihongo Pro's camera, photo, and file OCR behavior is part of the Lookup
target. Zenbu exposes it through the shared Image Text Flow, which handles one
bounded image or limited content rather than whole-work Media Analysis.

The working image and derived result are transient until the learner chooses
to save them. Discard retains neither. An explicit flow-level save creates one
reopenable Image Text Result containing its source image, recognized Japanese
regions, and any generated whole-content translation; it does not
automatically save every recognized word.

Nihongo-parity dictionary cards retain their save or bookmark behavior,
including the ability to attach an explicitly selected or captured source
image. A saved language item may preserve that personal context as an
Encounter Example.

## Text handoff to Translator

Lookup preserves Nihongo Pro's complete search-result behavior, including its
Best Matches, Additional Matches, and Example Sentences sections. A Contextual
Handoff may additionally send the learner's exact typed query to Translator as
ordinary input. It sends no Lookup matches, examples, analysis structures, or
other Lookup-specific context and does not replace or modify the parity result.

The exact action label, eligibility, placement, and navigation treatment belong
to the Zenbu Japanese iOS App shell prototype. Offline translation, dynamic
translation while typing, and unusual mixed-language input belong to later
Translator research and design rather than this handoff contract.

## Deferred documentation

- Define the contextual image explanation as a separate post-MVP feature before implementing it.
- Add implementation and verification evidence to the canonical parity ledger as each approved journey is built.
