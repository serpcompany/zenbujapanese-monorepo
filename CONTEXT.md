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

**Lookup Capture**:
A single-shot image capture used to identify, look up, or translate a limited piece of Japanese content. It is transient unless the learner saves its result to the User Library.
_Avoid_: Media import, Reader import

**Learning Profile**:
The connected record of a learner's saved material, encounters, activity, and progress across Product Experiences.
_Avoid_: User area, central profile area

**Media Entry**:
The durable User Library record representing one larger bounded work. It connects the work's source reference, Media Analysis, and applicable Consumption Experience without implying that Zenbu stores the original file.
_Avoid_: Stored media file, Media Analysis

**Media Analysis**:
The whole-work vocabulary, frequency, difficulty, coverage, and cohort analysis attached to a Media Entry.
_Avoid_: Media Entry, personalized readiness score

**User Library**:
The learner's private collection of saved Lookup Capture results and Media Entries. It persists on the learner's device without requiring an account.
_Avoid_: Library, Media Library, public catalog

**Collection**:
A learner-created and learner-named grouping of records in their User Library.
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
