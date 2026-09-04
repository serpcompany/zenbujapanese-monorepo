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

**Language Data Source**:
An external, versioned collection used to construct Language Reference Data or an Example Sentence Corpus while retaining its identity, license, and provenance.
_Avoid_: Provider schema, retrieval behavior, matching technology

**Language Technology**:
A replaceable established library, model, or system component used to implement language analysis without owning the app's product contract or language data.
_Avoid_: Language Data Source, corpus, Product Experience, retrieval policy

**Dictionary Match**:
An evidence-backed relationship establishing that a Language Reference Data entry is relevant to a Search query.
_Avoid_: Result row, provider hit, source membership

**Dictionary Ranking**:
The app-owned ordering of eligible Dictionary Matches for presentation and downstream entry selection.
_Avoid_: Provider entry order, provider result order, database row order, provider rank, match eligibility

**Canonical Sense and Gloss Order**:
The app-owned preservation of a Language Data Source's authorial sense sequence and the documented editorial sequence of glosses within each sense as typed lexical evidence. It is distinct from provider entry, export, result, or database row order and from provider identifiers.
_Avoid_: Provider result order, insertion order, record ID order

**Dictionary Sense**:
A distinct meaning within Language Reference Data that retains its part of speech, Canonical Sense and Gloss Order, and any written-form or reading-form applicability. A Dictionary Sense contributes Match evidence only when the displayed written/reading pair satisfies that applicability.
_Avoid_: Flat gloss, provider sense row, unrestricted meaning

**Dictionary Best Matches**:
The highest-evidence group produced by Dictionary Ranking for presentation in Lookup. The group may contain more than one entry.
_Avoid_: Primary Dictionary Entry, all dictionary results

**Primary Dictionary Entry**:
The first ordered Dictionary Match when a downstream flow requires one Language Reference Data entry.
_Avoid_: First provider row, Dictionary Best Matches

**Public Dictionary Entry**:
The anonymous website representation of one exact Japanese Language Reference Data entry. Same-spelling entries remain separate rather than becoming one surface-form family page.
_Avoid_: Search result page, surface-form page, dictionary row

**App/Web Dictionary Parity**:
For the same declared dictionary-data and ranking-policy version, the iPhone app and public website expose the same visible entry identities, result order, and Dictionary Best Matches versus Additional Matches grouping. Platform presentation and runtime implementation may differ.
_Avoid_: Identical UI, shared runtime, approximate result parity

**Public Dictionary Search**:
The submit-first website flow that accepts Japanese, romaji, or the localized edition's language and presents relevant Japanese Dictionary Matches. Typing alone does not replace the submitted results page.
_Avoid_: Live search, autocomplete, English entry lookup

**Indexable Dictionary Search Results**:
A successful Public Dictionary Search page with at least one strong approved Dictionary Match, eligible to be optimized and indexed for the submitted query. Zero-result, retrieval-failure, and weak-only pages are not indexable; the page remains results rather than editorial translation content.
_Avoid_: Translation landing page, weak-only search page, dictionary entry

**Localized Website Edition**:
A public website presentation whose navigation and authored page copy use one supported locale. English is the unprefixed default edition; Japanese begins under `/ja`, and locale remains distinct from dictionary entry identity or search-input language.
_Avoid_: Dictionary language, query language, IP-targeted site

**Example Sentence Corpus**:
The canonical app-owned collection of source-backed Japanese–English example pairs and their retained provenance.
_Avoid_: Tatoeba database, Nihongo sentences, retrieval results

**Example Sentence Retrieval**:
The Shared Capability that accepts a Search query or dictionary entry, analyzes its language forms, establishes Example Sentence Matches, and applies Example Sentence Ranking to produce relevant ordered corpus records. It owns the retrieval policy while delegating language analysis to replaceable Language Technology.
_Avoid_: Data source, corpus, provider search, matching technology

**Example Sentence Match**:
An evidence-backed relationship establishing that an Example Sentence Corpus record is relevant to a Search query or dictionary entry.
_Avoid_: Substring hit, ranking score, source membership

**Example Sentence Ranking**:
The ordering of eligible Example Sentence Matches for presentation to the learner.
_Avoid_: Corpus order, source order, match eligibility

**Japanese Text Analysis**:
The Shared Capability that resolves Japanese text into app-owned segments, tokens, lemmas, language-item candidates, and occurrence mappings.
_Avoid_: Media Analysis, translation

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

**You**:
The personal and settings entry point in the Zenbu Japanese iOS App. You does not imply authentication or own the destinations, histories, settings, or data reachable through it, and it is not a Product Experience.
_Avoid_: More, Profile, Account, Product Experience, data owner, unified user area

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

**Encounter Media**:
A learner-retained image or other bounded source asset associated with one or more Encounter Examples. Zenbu stores identical media once, can associate it with several language items, and presents it once in the Media Library with those associations. Removing an association from one word does not delete shared media; deleting Encounter Media from the Media Library removes all of its associations.
_Avoid_: Word Image Attachment, temporary navigation image, Image Text Result, Media Entry, canonical dictionary image

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
The Product Experience for privately browsing and managing retained media. It presents lightweight Encounter Media separately from larger Media Entries and their Media Analysis. It persists on the learner's device without requiring an account. A compatible Media Entry may launch a separate Consumption Experience. Lookup history and Saved Language Items do not live in the Media Library.
_Avoid_: User Library, universal user-content store, public catalog

**Saved Language Item**:
A word, kanji, phrase, sentence, or other language item the learner deliberately saves for later reference or study. Its final user-facing name, organization model, navigation placement, and relationship to future study experiences remain unresolved.
_Avoid_: Media Entry, Lookup history

**Encounter Example**:
A learner-preserved occurrence of a Language Reference Data entry or Saved Language Item in personally encountered context, optionally including surrounding text, a translation, and associated Encounter Media. One language item may have many Encounter Examples, and one Encounter Media record may support examples for several language items. It remains distinct from provider-supplied example-sentence data.
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
