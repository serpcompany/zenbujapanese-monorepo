# Media Analysis

Status: evolving product contract

## Role

Media Analysis helps a learner evaluate the Japanese contained in a larger bounded work so they can decide what material or vocabulary cohort to focus on.

It analyzes a work as one entity rather than handling a single-shot Lookup Capture.

## MVP boundary

Media Analysis MVP ends after:

- importing a larger bounded work
- extracting its Japanese text
- analyzing the work as one entity
- presenting the analysis
- persisting the result locally in the User Library

Interactive media-consumption experiences are outside this MVP.

## Deferred related experiences

- **Watch** may later provide Migaku-style video playback with timed, interactive subtitles.
- **Reader** may later provide a purpose-built interactive manga-reading experience.
- **Listen** may later provide synchronized audio and lyrics or transcripts.

These experiences may reuse Media Analysis data later, but they require their own product definitions and are not generalized in advance.

The single-image OCR and translation flow proven by the earlier TestFlight prototype belongs conceptually to Lookup Capture, not to the future Reader.

## Inputs

Potential inputs include:

- pasted text
- text or subtitle files
- PDFs
- audio or video files
- URLs

Input-specific extraction produces Japanese text for the shared analysis pipeline.

## MVP analysis

A Media Analysis can report:

- resolved dictionary-form words
- word occurrence counts and concentration
- unique vocabulary
- JLPT distribution
- general and domain-specific frequency distributions
- difficulty or coverage views derived from enabled reference datasets
- contexts in which words occur

Completed analyses persist in the device-local User Library.

## Classification posture

MVP classifications come from external reference sources, such as:

- dictionary data
- JLPT vocabulary sources
- general Japanese frequency sources
- domain frequency sources such as YouTube, television, news, novels, or games

Frequency and difficulty are source-relative rather than one universal truth. Analysis should retain which source produced each classification.

## MVP exclusions

Media Analysis does not use a learner's known, learning, or unknown vocabulary state for personalized readiness scoring in MVP.

Personalization may be layered on later through a separate Learning Profile capability without becoming part of the core Media Analysis pipeline.

Media Analysis is also not:

- general-purpose file storage
- a public content catalog
- a community publishing system
- a requirement for Zenbu to continually create or curate content

## Open questions

- What should the whole-work result be called and which measures belong in its first Vocabulary Profile?

## Historical reference

The earlier Japanese Media Vocabulary Coverage MVP proved the initial workflow and data model:

- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-db/docs/0. Project Plan/PRD.md`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-db/docs/0. Project Plan/V2-Data-MVP.md`
