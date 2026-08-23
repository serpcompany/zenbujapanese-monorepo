# Translator

Status: landscape definition established; detailed interaction and technical discovery deferred

## Role

Translator is the Product Experience for naturally translating text and supporting real-time conversations between English and Japanese in either direction.

English and Japanese are the MVP language pair. Broader language support is not implied by competitor references and requires a later product decision.

## Product reference

Google Translate is the strongest overall UI and interaction reference for Translator, including its live-conversation modes and per-language audio-routing experience, but it is not an exact parity target.

Zenbu should draw from Google Translate's interaction patterns, information hierarchy, and overall clarity while selecting a smaller product surface appropriate to Zenbu's needs. Google Translate contains more features and screens than Zenbu is expected to require for MVP.

Zenbu uses its own branding, colors, typography, logos, icons, and visual identity.

## Current-reference requirement

The preserved Google Translate screenshots and observations are historical reference material only. Their capture date and app version were not recorded, and the app has changed since they were collected.

Before detailed Translator design, an AI agent must perform a fresh, exhaustive audit of the current Google Translate iOS app. The audit must inventory its screens, features, navigation, modes, interactions, states, settings, and relevant edge behavior. It must then support an explicit **adopt, adapt, or exclude** decision for each relevant element rather than turning the entire current Google Translate product into automatic scope.

Historical Google Translate references exist in:

- `/Users/devin/dev/repos/github@zenbujapanese/zenbujapanese-monorepo/docs/research/product/reference-apps/google-translate/`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/zenbu-japanese-app/docs/research/product/reference-apps/google-translate/`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-app-v2/docs/design/design-workbench/translate/`

They are useful leads but are neither current nor comprehensive.

## Translation-quality authority

Google Translate's Japanese translation output and underlying translation stack are not quality authorities for Zenbu. Matching its UI must not imply copying its translations, provider choices, or linguistic behavior.

Zenbu's translation quality should be evaluated independently for Japanese. Quality evaluation must account for naturalness, meaning, register, tone, ambiguity, conversation context, and consistency across turns rather than accepting word-for-word or context-free output.

Owll Translator research, earlier Zenbu prototypes, and existing provider-comparison work are preliminary technical and product evidence. They may identify useful approaches, but they do not select the final translation, speech, conversation, OCR, or voice stack.

Relevant historical material includes:

- `/Users/devin/dev/repos/github@zenbujapanese/zenbujapanese-monorepo/docs/product-ideas/zenbu-translator.md`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-app-v2/docs/reference/translate-flow.md`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-app-v2/docs/reference/owll-translator-reference-stack-notes.md`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-app-v2/docs/product/features/translate.md`

## Image Text Flow

Camera, Photo Library, and image-file translation use the same Image Text Flow
as Lookup rather than a separate Translator-specific implementation.

Lookup and Translator may both provide entry points, but both open the same result experience. That experience combines:

- OCR-recognized, interactive Japanese with dictionary lookup
- a coherent natural translation of the recognized content as a whole
- later, an optional AI-generated explanation using broader image context

MVP must not create separate Lookup and Translator OCR pipelines, result
contracts, histories, or saved-record types. Entering through Translator
already expresses translation intent, so the flow requests whole-content
translation automatically; entering through Lookup requires an explicit
translation request.

The working source and result are transient at flow level until the learner
chooses Discard or Save. Opening a recognized word is the narrow exception: it
creates an Encounter Example associating that entry with retained Encounter
Media, without retaining the OCR regions or whole-content translation. An explicit flow-level save
creates one Image Text Result regardless of which Product Experience opened the
flow. Exact controls, emphasis, and navigation remain later UI decisions.

## Text handoffs with Lookup

Lookup and Translator both accept sentence-shaped input, but they answer different questions:

- Lookup searches dictionary entries and example sentences and helps the learner inspect the words.
- Translator produces a natural translation of the complete sentence.

Lookup retains complete Nihongo-style search-result behavior. A Contextual
Handoff may additionally send the exact typed query to Translator, where it is
handled like ordinary pasted input. The handoff sends no Lookup matches,
example sentences, analysis structures, or other Lookup-specific context.

The same app-wide pattern may offer destinations for selected content elsewhere
in Zenbu: **Lookup** or **Translate** in MVP, and a future **Ask Sensei** action
when AI Sensei is scheduled. The chosen Product Experience receives the exact
selected content and handles it normally; this does not require bespoke
tappable-word behavior, cards, modals, or destination-specific coupling.

The Zenbu Japanese iOS App shell prototype decides which actions appear in each
context, their labels and placement, and how ordinary screen navigation behaves.
Lookup and Translator continue to reuse the same underlying parsing,
tokenization, dictionary, and translation capabilities rather than implementing
separate language pipelines.

## MVP value and delivery posture

Continuously listening, hands-free live conversation is a required Translator MVP outcome and a primary source of the Product Experience's value. The Translator MVP is not complete if it supports only typed translation, isolated recorded phrases, or manually triggered turns.

The live conversation experience includes:

- two speakers, one speaking English and one speaking Japanese
- real-time source-language transcription visible in the UI
- a destination-language translation visible for the other speaker
- audible destination-language playback
- speaker mode, in which translated speech plays through the phone
- silent mode, in which translation remains visible without audible playback
- headphone audio routing, in which one or both languages can be assigned to connected headphones
- full conversation context supplied to translation so omitted subjects, pronouns, meaning, register, and terminology remain coherent across turns
- durable saved conversation history

Google Translate is the current UI/UX reference for live-conversation mode selection and per-language audio routing. Current screenshots show that each language can be muted, played on the device, or sent to connected headphones. They do not establish separate left-earbud and right-earbud routing or isolated audio for two people sharing one stereo pair.

Per-language audio routing is an MVP requirement. Japanese and English each
independently select mute, the iPhone speaker, or connected headphones; any
combination is allowed, so headphones may receive neither language, one
language, or both. Zenbu does not split a stereo pair by left and right earbud
and does not require separate output channels for separate listeners.

Google Translate must be tested directly, and Zenbu's simultaneous speaker and
headphone routing, system-selected microphone input, Bluetooth, device,
accessibility, and ordinary-headphone constraints require an explicit native
iOS feasibility proof. The proof evaluates how to satisfy this settled product
contract; it does not reopen the left/right-earbud model.

## Conversation context

Translation context is scoped to the active conversation session. Each new turn uses all prior turns from that session—including speaker and language direction, source text, and translations—so Japanese omissions, references, register, and terminology can remain coherent.

Ending a conversation closes that context boundary. Starting a new conversation begins with no prior-session context, and saved conversation history is not automatically supplied to later sessions.

If a long session exceeds a chosen model or provider's direct context limits, the implementation must preserve the meaning needed for subsequent turns and prove that behavior through translation-quality evaluation. A provider limit must not silently reduce the product requirement to context-free turn-by-turn translation.

### Future: persistent multi-session context

A post-MVP feature may let a user create a named conversation container and deliberately continue its context across multiple conversation sessions. This could support recurring conversations between the same two people or an ongoing topic that spans different times.

The final user-facing name is unresolved; **conversation**, **project**, **folder**, and **thread** are working possibilities only.

Persistent context must be explicitly selected by the user rather than inferred from saved history or silently applied across conversations. Its context model, participant representation, privacy controls, editing and forgetting behavior, retention, and relationship to saved transcripts require a separate product definition.

## Saved conversation history

Translator conversation history uses durable device-local persistence for MVP. A learner can return to saved bilingual conversations after an app restart without creating an account or enabling cloud sync.

MVP history retains the bilingual transcript and the minimal session metadata needed to identify and reopen it, such as its languages and date. Captured source audio is temporary processing input and is discarded after processing rather than saved with the conversation.

The history belongs to Translator for MVP rather than expanding the saved-material or Learning Profile contracts prematurely. Future account sync, backup, cross-device access, or study handoff may build on it later.

This product commitment does not require continuous conversation to be implemented as one undivided task. Typed translation, one recorded turn, and manual alternating turns can be used as development milestones, evaluation surfaces, and graceful fallbacks for the capabilities that live conversation depends on. Completing those milestones does not move continuous conversation out of MVP.

The later execution plan should expose and verify the difficult parts of live conversation early—including speech capture, turn detection, language direction, session context, translation latency and quality, translated speech playback, interruption, and failure recovery—before polishing supporting modes as if they were the final product.

## Deferred discovery

- Which current Google Translate elements should Zenbu adopt, adapt, or exclude?
- What is the narrow behavioral boundary of the first continuous live-conversation experience?
- Which supporting translation modes must ship as user-facing fallbacks rather than remain development and evaluation surfaces?
- How should language direction and speaker turns be detected without unnecessary biometric speaker identification?
- What participant, earbud, channel, device, and microphone behavior does Google Translate's per-language headphone assignment actually provide?
- What corresponding native iOS audio-routing and microphone behavior can Zenbu reliably deliver with ordinary headphones?
- What retention and deletion controls does local conversation history require?
- What translation-quality evaluation should gate provider and model selection?
- What should the future persistent multi-session conversation container be called and how should users control its carried context?
