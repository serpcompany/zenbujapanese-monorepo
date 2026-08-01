# Zenbu Japanese

Zenbu Japanese is a connected set of Japanese-learning experiences organized around one learning journey.

## Language

**Product Experience**:
A self-contained user-facing area with its own purpose, flows, and requirements. A Product Experience is not assumed to be a separately distributed app.
_Avoid_: App, feature app, standalone app

**Zenbu Japanese iOS App**:
The primary installed iOS product that brings multiple Product Experiences together.
_Avoid_: App suite, bundle of apps

**Shared Capability**:
Behavior or data used by multiple Product Experiences without being a user-facing destination of its own.
_Avoid_: Shared app, product area

**Language Reference Data**:
Canonical app-owned Japanese lexical, orthographic, pronunciation, and classification facts whose source provenance is retained independently of any provider schema.
_Avoid_: Provider data model, generated language fact

**Japanese Text Analysis**:
The Shared Capability that resolves Japanese text into app-owned segments, tokens, lemmas, language-item candidates, and occurrence mappings.
_Avoid_: Media Analysis, translation

**Image Text Recognition**:
The Shared Capability that extracts ordered text regions from a bounded image while retaining their spatial and recognition evidence.
_Avoid_: Lookup Capture, contextual image explanation

**Natural Translation**:
The Shared Capability that produces coherent Japanese–English meaning for bounded text or a conversation turn with explicitly supplied active-session context.
_Avoid_: Dictionary gloss, word-for-word substitution

**Language Explanation**:
An on-demand generated interpretation of bounded Japanese text that explains grammar, omitted elements, register, nuance, and translation choices without becoming an open-ended tutoring conversation.
_Avoid_: AI Sensei, contextual image explanation

**Speech Synthesis**:
The Shared Capability that produces spoken language from text for Product Experience-owned playback behavior.
_Avoid_: Pronunciation recording, audio routing

**Speech Transcription**:
The Shared Capability that turns spoken audio into text or timed utterance updates without owning capture, conversation, or media workflows.
_Avoid_: Audio routing, caption-generation workflow

**More**:
A secondary navigation entry point for utility and deferred destinations in the Zenbu Japanese iOS App. More does not own the destinations, histories, settings, or data reachable through it and is not a Product Experience.
_Avoid_: Product Experience, data owner, unified user area

**Cross-Product Flow**:
A user-facing flow that composes contracts owned by multiple Product Experiences and is coordinated by the Zenbu Japanese iOS App shell. Multiple Product Experiences may provide entry points into the same flow; leaving it restores the originating context. The shell coordinates the flow without owning its histories or durable records.
_Avoid_: Duplicate product flow, Shared Capability, shell-owned Product Experience

**Contextual Handoff**:
An app-wide convenience that supplies selected or origin-provided content to a chosen Product Experience, which handles it as ordinary input through the Zenbu Japanese iOS App shell's normal navigation.
_Avoid_: Cross-Product Flow, embedded Product Experience, special integration

**Image Text Flow**:
A Cross-Product Flow that turns one bounded camera, Photo Library, or image-file input into interactive recognized Japanese and, when requested or entered through Translator, a whole-content natural translation. It is distinct from importing a larger work into the Media Library.
_Avoid_: Lookup Capture, Media import, contextual image explanation

**Image Text Result**:
A learner-saved result from an Image Text Flow that retains its explicitly saved source image, recognized Japanese regions, and any generated whole-content translation. Saving it does not automatically save every recognized language item.
_Avoid_: Saved Language Item, Media Entry, automatic image history

**Learning Profile**:
The connected record of a learner's saved material, encounters, activity, and progress across Product Experiences.
_Avoid_: User area, central profile area

**Media Entry**:
The durable Media Library record representing one explicitly saved larger bounded work. It contains Zenbu's app-owned source copy and its Media Analysis and may connect that work to an applicable Consumption Experience.
_Avoid_: Transient import, Media Analysis

**Media Analysis**:
The Media Library-owned workflow and result for extracting and presenting whole-work vocabulary, frequency, difficulty, coverage, and cohort analysis attached to a Media Entry. A learner can inspect a Media Analysis without opening a Consumption Experience.
_Avoid_: Media Entry, personalized readiness score

**Media Library**:
The Product Experience for privately browsing and managing explicitly saved larger works, adding and analyzing media, and inspecting the Media Analysis attached to each Media Entry. It persists on the learner's device without requiring an account. A compatible Media Entry may launch a separate Consumption Experience. Lookup history, Image Text Results, and Saved Language Items do not live in the Media Library.
_Avoid_: User Library, universal user-content store, public catalog

**Saved Language Item**:
A word, kanji, phrase, sentence, or other language item the learner deliberately saves for later reference or study. Its final user-facing name, organization model, navigation placement, and relationship to future study experiences remain unresolved.
_Avoid_: Media Entry, Lookup history

**Encounter Example**:
A learner-preserved occurrence of a Saved Language Item in personally encountered context, optionally including surrounding text, a translation, and an explicitly retained source image. It remains distinct from provider-supplied example-sentence data.
_Avoid_: Canonical example sentence, Image Text history

**Collection**:
A learner-created and learner-named grouping of Media Entries in their Media Library.
_Avoid_: System category, media type

**Consumption Experience**:
The interactive Read, Watch, or Listen experience attached to a Media Entry. It reuses the same extracted and segmented Japanese as the entry's Media Analysis.
_Avoid_: Media Analysis, separate media app

**KanjiMon**:
The gamified Product Experience for encountering, collecting, and learning kanji in real-world context.
_Avoid_: Capture

**AI Sensei**:
The in-app, Japanese-specialized contextual LLM chat for open-ended questions and follow-ups about material encountered across Zenbu Japanese.
_Avoid_: Dojo, course engine, generic chatbot
