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

**More**:
A secondary navigation entry point for utility and deferred destinations in the Zenbu Japanese iOS App. More does not own the destinations, histories, settings, or data reachable through it and is not a Product Experience.
_Avoid_: Product Experience, data owner, unified user area

**Cross-Product Flow**:
A user-facing flow that composes contracts owned by multiple Product Experiences and is coordinated by the Zenbu Japanese iOS App shell. Multiple Product Experiences may provide entry points into the same flow; leaving it restores the originating context. The shell coordinates the flow without owning its histories or durable records.
_Avoid_: Duplicate product flow, Shared Capability, shell-owned Product Experience

**Lookup Capture**:
A single-shot image capture used to identify, look up, or translate a limited piece of Japanese content. It is distinct from importing a larger work into the Media Library.
_Avoid_: Media import, Reader import

**Learning Profile**:
The connected record of a learner's saved material, encounters, activity, and progress across Product Experiences.
_Avoid_: User area, central profile area

**Media Entry**:
The durable Media Library record representing one larger bounded work. It connects the work's source reference, Media Analysis, and applicable Consumption Experience without implying that Zenbu stores the original file.
_Avoid_: Stored media file, Media Analysis

**Media Analysis**:
The Media Library-owned workflow and result for extracting and presenting whole-work vocabulary, frequency, difficulty, coverage, and cohort analysis attached to a Media Entry. A learner can inspect a Media Analysis without opening a Consumption Experience.
_Avoid_: Media Entry, personalized readiness score

**Media Library**:
The Product Experience for privately browsing and managing imported media, adding media, and inspecting the Media Analysis attached to each Media Entry. It persists on the learner's device without requiring an account. A compatible Media Entry may launch a separate Consumption Experience. Lookup history and saved language items do not live in the Media Library.
_Avoid_: User Library, universal user-content store, public catalog

**Saved Language Item**:
A word, kanji, phrase, sentence, or other language item the learner deliberately saves for later reference or study. Its final user-facing name, organization model, navigation placement, and relationship to future study experiences remain unresolved.
_Avoid_: Media Entry, Lookup history

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
