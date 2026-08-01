# Media Analysis

Status: landscape definition established; detailed result design deferred

## Role

Media Analysis helps a learner evaluate the Japanese contained in a larger bounded work so they can decide what material or vocabulary cohort to focus on.

It analyzes a work as one entity rather than handling the single-image Image
Text Flow.

## MVP boundary

Media Analysis MVP ends after:

- importing a larger bounded work from a text-based source
- extracting its Japanese text
- analyzing the work as one entity
- presenting the analysis
- letting the learner explicitly discard the transient work or save its source
  and analysis as a Media Entry

Interactive media-consumption experiences are outside this MVP.

The exact initial input methods and file formats remain a later product
decision. Text-based is the current boundary; it does not yet commit MVP to
PDF, EPUB, subtitle, URL, image, audio, or video ingestion. Captionless video
transcription is a feasibility candidate and possible first expansion rather
than a shipping MVP requirement.

## Deferred related experiences

- **Watch** may later provide Migaku-style video playback with timed, interactive subtitles.
- **Reader** may later provide a purpose-built interactive manga-reading experience.
- **Listen** may later provide synchronized audio and lyrics or transcripts.

These experiences may reuse Media Analysis data later, but they require their own product definitions and are not generalized in advance.

The single-image OCR and translation flow proven by the earlier TestFlight
prototype belongs to the Image Text Flow, not to the future Reader.

## Inputs

MVP accepts a larger bounded work through a text-based input. A later decision
will select the exact input methods and formats, such as pasted text, plain-text
files, or structured text formats. Input-specific ingestion normalizes the
source into ordered Japanese text segments for analysis.

Image, audio, and video extraction are later input families. Supporting them
requires their own feasibility and lifecycle decisions and is not implied by
the shared analysis pipeline.

## MVP analysis

A Media Analysis can report:

- resolved dictionary-form words
- word occurrence counts and concentration
- unique vocabulary
- JLPT distribution
- general and domain-specific frequency distributions
- difficulty or coverage views derived from enabled reference datasets
- contexts in which words occur

Completed analyses persist only as part of an explicitly saved, device-local
Media Entry. Discard retains neither the transient source nor its analysis.
MVP stores the completed result produced before Save and provides no reanalysis
workflow or analysis-version history. Later algorithm or dataset changes do not
silently alter a saved result.

The analysis engine is local, offline, reproducible for the same installed
algorithm and dataset versions, independent of its presentation UI, and does
not require generative AI. Dashboards, charts, and other visualizations consume
its structured result without becoming part of the engine. Statistical or
machine-learning implementations may still be evaluated for focused operations
such as tokenization or disambiguation, provided analysis remains local and its
provenance is retained.

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

Media Analysis also does not provide passage-by-passage Learning
Interpretation. In-context furigana, romaji, definitions, pitch accent,
translations, and teaching commentary belong to the later Read, Watch, and
Listen Consumption Experiences. Media Analysis may expose source-backed word
details and occurrence contexts as part of inspecting its analytical result.

Media Analysis is also not:

- general-purpose file storage
- a public content catalog
- a community publishing system
- a requirement for Zenbu to continually create or curate content

## Open questions

- What should the whole-work result be called and which measures belong in its first Vocabulary Profile?
- Which exact text-based input methods and file formats belong in the initial MVP?

## Historical reference

The earlier Japanese Media Vocabulary Coverage MVP proved the initial workflow and data model:

- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-db/docs/0. Project Plan/PRD.md`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-db/docs/0. Project Plan/V2-Data-MVP.md`
