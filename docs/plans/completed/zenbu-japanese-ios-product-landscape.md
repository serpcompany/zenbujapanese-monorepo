# Zenbu Japanese iOS app plan

Status: retired product-landscape source; migrated to Wayfinder

Last updated: 2026-08-01

## Retirement notice

This document is preserved only as migration evidence. Do not use it as an active plan or add decisions and implementation tasks here.

[Map the Zenbu Japanese iOS project foundation](https://github.com/serpcompany/zenbujapanese-monorepo/issues/1) is the canonical planning artifact. [Verify migration coverage of the legacy iOS plan](https://github.com/serpcompany/zenbujapanese-monorepo/issues/38) records where this document's decisions, open questions, research requirements, evidence boundaries, and workflow constraints moved.

This plan defines a new native iOS implementation informed by the previous [prototypes](../../../../prototypes/) without treating any one prototype as the complete product specification or target architecture.

Zenbu Japanese is one primary installed iOS product containing several connected **Product Experiences**. A Product Experience is planned as a coherent area but is not assumed to be a separate app or top-level tab.

## Current product landscape

### Lookup

Lookup is the dictionary and limited-content lookup Product Experience for words, phrases, sentences, kanji, and single-shot image content.

- Nihongo Pro is the product authority.
- The target is complete parity across screens, features, navigation, behavior, data behavior, and the underlying language stack.
- Zenbu uses its own branding, colors, typography, logos, icons, and visual identity.
- Camera, Photo Library, and Files OCR are part of Lookup rather than Media Analysis or Reader.
- MVP adds a coherent natural English translation of the Japanese recognized across the image while preserving Nihongo-style interactive OCR lookup.
- AI-generated explanation using broader image context is a future, post-MVP feature.
- The existing screenshots and prototype audit are preliminary references only. An exhaustive current product and language-stack inventory is required before implementation planning.

See [Lookup](../../product/lookup.md).

### Translator

Translator covers sentence translation, larger text translation, and real-time conversation translation.

- English and Japanese are the MVP language pair.
- Google Translate is the strongest overall UI/UX reference, but Zenbu will select a smaller surface rather than pursue exact parity.
- Existing screenshots are preliminary; a fresh current-app audit must support explicit adopt, adapt, or exclude decisions.
- Google Translate's Japanese output and translation stack are not quality authorities.
- Continuously listening, hands-free two-person conversation is a required MVP outcome.
- Live translation includes visible bilingual transcription and translation, audible playback, speaker mode, silent mode, and per-language headphone assignment.
- Each turn uses the prior context from the current session; context resets between sessions by default.
- Conversation history stores bilingual transcripts and minimal metadata durably on-device without retaining source audio.
- A future opt-in conversation container may carry context across multiple sessions.
- Camera/photo/file translation reuses the same shared OCR, lookup, and natural-translation flow exposed by Lookup.
- Sentence-shaped Lookup queries can hand off to Translator with their text preserved.

See [Translator](../../product/translator.md).

### AI Sensei

AI Sensei is an accounted-for post-MVP Product Experience: an in-app, Japanese-specialized contextual LLM chat available directly and eventually through **Ask Sensei** handoffs from other areas.

- It is not part of the initial MVP.
- It is conversational rather than a course engine or duplicate of Dojo.
- Its domain relevance should come from Zenbu's app-owned LLM application layer, context, Japanese reference capabilities, and evaluations rather than a generic model wrapper.
- Detailed features, memory, persistence, handoffs, and technical design remain deferred until it is deliberately scheduled.

See [AI Sensei](../../product/ai-sensei.md).

### Media

Media begins with **Media Analysis**: importing a larger bounded work, extracting its Japanese, analyzing the work as one entity, presenting the results, and persisting the analysis locally.

Potential inputs include pasted text, subtitles, scripts, PDFs, audio, video, and URLs. The purpose is to show vocabulary, occurrence concentration, frequency, difficulty, JLPT distribution, and source-relative coverage so a learner can choose what to focus on.

Media Analysis MVP:

- stores durable analysis results in the device-local User Library
- does not make Zenbu a file-storage service
- does not require an account, sync, public catalog, community publishing, or Zenbu content curation
- uses reference classifications rather than personalized learner-readiness scoring
- ends at import, analysis, presentation, and local persistence

Read, Watch, and Listen are separate deferred **Consumption Experiences**, not part of Media Analysis MVP:

- Watch may later provide Migaku-style timed, interactive subtitles.
- Reader may later provide a purpose-built interactive manga experience.
- Listen may later synchronize audio with lyrics or transcripts.

See [Media Analysis](../../product/media-analysis.md) and [User Library](../../product/user-library.md).

### User Library

The User Library is the learner's private, device-local collection of saved Lookup Capture results and Media Entries. It stores the durable value produced by Zenbu's tools, not a managed copy of every imported file.

Learners may create and name their own Collections. Public catalogs, community publishing, curated content, account sync, and backup are possible later layers rather than MVP requirements.

### Dojo

Dojo is the still-undefined study Product Experience. Existing ideas include:

- premade topical learning cohorts such as people, places, counting, or clothing
- spaced-repetition study of premade, custom, or imported decks

Its landscape definition has not started, and these ideas are not yet an MVP commitment.

### KanjiMon

KanjiMon is the gamified Product Experience for encountering, collecting, and learning kanji in real-world context.

- It is excluded from the initial MVP and will receive its own later feature/sprint planning session.
- It belongs in the primary Zenbu Japanese iOS app for the current plan.
- It may be architected so a separate KanjiMon app is possible later, but no separate app is planned now.
- It should reuse shared kanji lookup, saved-item, and learning capabilities rather than create a disconnected profile or duplicate kanji system.

See [KanjiMon](../../product/kanjimon.md).

### Learning Profile, settings, and navigation

A connected Learning Profile may later unify saved material, encounters, activity, and progress across Product Experiences. Media Analysis MVP does not depend on personalized Learning Profile scoring.

Settings, account behavior, navigation grouping, and the exact menu/drop-up presentation remain to be defined. The list above is a product map, not a final navigation hierarchy.

## Preserved evidence and boundaries

- The strongest existing full-product UI and Zenbu visual-direction reference is `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-app-v2/_archive/nextjs-app`.
- The working TestFlight single-image OCR flow lives under `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-app-v2`. Its OCR interaction is preliminary Lookup reference material, and its natural translation is a required Lookup MVP addition.
- The TestFlight flow's latency and network dependency remain technical problems to investigate later. The desired direction is fast local or offline processing wherever evaluation shows it is feasible; no concrete implementation has been selected.
- The previous single-image flow is not the definition of the future Reader. Reader will be reconsidered later as an interactive manga Consumption Experience.
- The earlier whole-work media-analysis MVP lives under `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-db`.
- Prior audits, screenshots, research, and implementations are evidence. They do not become authoritative merely because they are detailed or already implemented.

## Planning workflow

Use a breadth-first product landscape pass before detailed feature design or implementation planning.

For each Product Experience:

1. inspect existing plans, prototypes, and code for discoverable facts
2. resolve one product decision at a time
3. provide a recommended answer with each question
4. update no more than one focused document after a decision is confirmed
5. record unresolved detail under that feature's `Open questions`
6. stop when the feature's purpose, MVP boundary, ownership, exclusions, and important references are clear

Do not select concrete libraries, datasets, providers, or implementation order during the landscape pass. It is valid to record a product-imposed target—such as matching Nihongo's language stack—but identification, licensing, evaluation, and final technical selection belong to later passes. Later passes will reconcile prototype behavior, evaluate technical solutions, and create execution issues.

## Current checkpoint

The Media Analysis landscape pass is sufficiently defined for now:

- it analyzes a larger bounded work as one entity
- it is distinct from single-shot Lookup Capture
- MVP produces durable, device-local analysis in the User Library
- MVP uses reference classifications rather than learner-personalized scoring
- MVP does not include file storage, public catalogs, community publishing, curated content, or interactive consumption experiences
- Watch, Reader, and Listen remain separate deferred product definitions
- the exact Vocabulary Profile remains an open question

The Lookup landscape pass is sufficiently defined for now:

- Nihongo Pro is the product authority; the target is complete screen, feature, behavior, data, and language-stack parity
- Zenbu uses its own branding and visual identity
- single-shot camera, photo-library, and file OCR belong to Lookup
- MVP adds a natural English translation of the recognized image content
- AI-generated contextual image explanation is a post-MVP feature
- existing audits are preliminary references; an exhaustive current parity and language-stack inventory is required before implementation planning
- unidentified, unavailable, or unlicensable Nihongo stack components must be recorded as explicit gaps or approved deviations

The Translator landscape pass is sufficiently defined for now:

- it provides natural English–Japanese text and real-time conversation translation
- Google Translate is its current UI/UX reference but not an exact parity or translation-quality target
- continuous hands-free conversation remains inside MVP even though it will require smaller development proof milestones
- active-session context, local transcript history, and per-language audio-routing outcomes are required
- image translation is a shared Lookup/Translator flow rather than a duplicate implementation
- detailed mode behavior, language-direction detection, audio feasibility, and provider selection are deferred

AI Sensei is accounted for as a post-MVP contextual LLM Product Experience. Its detailed feature definition is intentionally deferred.

Dojo remains a low-confidence future area. Its existing placeholder is sufficient; do not create a detailed Dojo specification until its priority increases.

KanjiMon is accounted for as a post-MVP Product Experience that will receive a separate feature/sprint planning session. It must reuse shared Lookup and kanji capabilities rather than duplicate them.

The breadth-first product landscape is sufficiently mapped for this stage. Continue next with a **cross-product reconciliation pass** focused on ownership, shared capabilities, and handoffs. Do not select concrete technology or create implementation issues yet.

## Current planning sources

- [Domain glossary](../../../CONTEXT.md)
- [User Library](../../product/user-library.md)
- [Media Analysis](../../product/media-analysis.md)
- [Lookup](../../product/lookup.md)
- [Translator](../../product/translator.md)
- [AI Sensei](../../product/ai-sensei.md)
- [KanjiMon](../../product/kanjimon.md)
- [Language capability boundaries](../../adr/0001-language-capability-boundaries.md)
