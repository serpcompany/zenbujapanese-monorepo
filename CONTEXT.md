# Zenbu Japanese

Zenbu Japanese is an iOS app for looking up Japanese and retaining useful context encountered while learning.

## Language

**Product Experience**:
A substantial, self-contained user-facing area with its own purpose, flows, and requirements. A supporting screen or navigation destination is not automatically a Product Experience.
_Avoid_: App, feature app, standalone app

**Zenbu Japanese iOS App**:
The installed iOS product containing Lookup and its supporting screens and capabilities.
_Avoid_: App suite, bundle of apps

**Shared Capability**:
Behavior or data used by user-facing areas without being a destination of its own.
_Avoid_: Shared app, product area

**Lookup**:
The primary Product Experience for searching Language Reference Data and inspecting words, kanji, and Example Sentences. Its root is labeled Search in the iOS app and also opens the Image Text Flow.
_Avoid_: Search query, dictionary provider

**Language Reference Data**:
Canonical app-owned Japanese lexical, orthographic, pronunciation, and classification facts whose source provenance is retained independently of any provider schema.
_Avoid_: Provider data model, generated language fact

**Language Data Source**:
An external, versioned collection used to construct Language Reference Data or an Example Sentence Corpus while retaining its identity, license, and provenance.
_Avoid_: Provider schema, retrieval behavior, matching technology

**Language Technology**:
A replaceable established library, model, or system component used to implement language analysis without owning the app's product contract or language data.
_Avoid_: Language Data Source, corpus, Product Experience, retrieval policy

**Dictionary Sense**:
A distinct meaning associated with a Language Reference Data entry. It may include part of speech and restrictions on the written forms or readings to which it applies.
_Avoid_: Flat gloss, provider sense row

**Example Sentence Corpus**:
The canonical app-owned collection of source-backed Japanese–English example pairs and their retained provenance.
_Avoid_: Tatoeba database, Nihongo sentences, retrieval results

**Example Sentence Retrieval**:
The Shared Capability that finds relevant Example Sentence Corpus records for a Search query or dictionary entry. Its language-processing dependencies remain replaceable.
_Avoid_: Data source, corpus, provider search

**Japanese Text Analysis**:
The Shared Capability that resolves Japanese text into app-owned segments, tokens, lemmas, language-item candidates, and occurrence mappings.
_Avoid_: Translation

**Reading Aid**:
An optional learner-facing representation that supports pronunciation of Japanese text. Furigana and Romaji are distinct Reading Aid types with independent display preferences.
_Avoid_: Ruby setting, pronunciation mode

**Furigana**:
A Reading Aid that presents a kana reading with its associated Japanese surface text. Showing or hiding Furigana does not change the underlying reading evidence or the Romaji preference.
_Avoid_: Ruby, Romaji, phonetic spelling

**Romaji**:
A Reading Aid that presents a Japanese reading in Latin script. Showing or hiding Romaji is independent of Furigana and does not replace the Japanese surface text.
_Avoid_: Furigana, Ruby, English translation

**Image Text Recognition**:
The Shared Capability that extracts ordered text regions from a bounded image while retaining their spatial and recognition evidence.
_Avoid_: Image Text Flow, dictionary lookup

**Natural Translation**:
The Shared Capability that produces coherent Japanese-to-English meaning for bounded text.
_Avoid_: Dictionary gloss, word-for-word substitution

**Speech Synthesis**:
The Shared Capability that produces spoken language from text for Product Experience-owned playback behavior.
_Avoid_: Pronunciation recording, audio routing

**You**:
The personal and settings entry point in the Zenbu Japanese iOS App. You does not imply authentication or own the destinations, histories, settings, or data reachable through it, and it is not a Product Experience.
_Avoid_: More, Profile, Account, Product Experience, data owner, unified user area

**Image Text Flow**:
A Lookup flow that turns one or more camera, Photo Library, or image-file inputs into interactive recognized Japanese and, when requested, a whole-content Natural Translation. The session is temporary; opening a recognized word may retain its source image as Encounter Media.
_Avoid_: Image Text Recognition, saved image history

**Encounter Media**:
A learner-retained image associated with one or more words and available from the Media Library.
_Avoid_: Temporary Image Text input, provider-supplied example, canonical dictionary image

**Media Library**:
The supporting screen under You for browsing and deleting Encounter Media saved with words. It is not a Product Experience or a general-purpose file store.
_Avoid_: Product Experience, photo editor, cloud drive
