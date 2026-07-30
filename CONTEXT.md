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
A single-shot image capture used to identify, look up, or translate a limited piece of Japanese content. It is transient unless the learner saves it to the Library.
_Avoid_: Media import, Reader import

**Learning Profile**:
The connected record of a learner's saved material, encounters, activity, and progress across Product Experiences.
_Avoid_: User area, central profile area

**Media Item**:
A larger bounded work, such as a book, manga, movie, show, song, or game script, whose Japanese content is processed and analyzed as one entity.
_Avoid_: Lookup Capture, Reader item, watch item

**Library**:
The learner's private, unified collection of saved Lookup Captures and Media Items. It persists on the learner's device without requiring an account.
_Avoid_: Media Library, Reader library, capture library

**Library Sync**:
An account capability that backs up and synchronizes a learner's Library across devices.
_Avoid_: Library access, saving

**Collection**:
A learner-created and learner-named grouping of items in their Library.
_Avoid_: System category, media type

**Media Mode**:
A way of working with a Media Item: Analyze, Read, Watch, or Listen. A Media Item can support more than one Media Mode without being duplicated.
_Avoid_: Media app, separate media library

**KanjiMon**:
The gamified Product Experience for encountering, collecting, and learning kanji in real-world context.
_Avoid_: Capture
