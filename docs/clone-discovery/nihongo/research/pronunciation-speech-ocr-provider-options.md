# Pronunciation, Speech Synthesis, and Image Text Recognition provider options

Research date: 2026-08-06

Wayfinder ticket: [Research pronunciation, speech, and OCR provider options](https://github.com/serpcompany/zenbujapanese-monorepo/issues/83)

Decision context: [Clear the Nihongo Lookup implementation-readiness blockers](https://github.com/serpcompany/zenbujapanese-monorepo/issues/77)

## Answer

None of the four owned blocker IDs needs Zenbu to discover Nihongo's private implementation. Zenbu can satisfy the relevant contracts through app-owned capability boundaries and independently licensed inputs:

- Use Apple's `AVSpeechSynthesizer` behind Zenbu's **Speech Synthesis** interface for the implementation baseline.
- Make human pronunciation recordings an optional, separately proven layer over Speech Synthesis. At launch, either omit that layer or ingest only pinned, attribution-complete open recordings; do not use or infer Nihongo's clips.
- Use Apple Vision behind Zenbu's **Image Text Recognition** interface as the on-device baseline.
- Treat online recognition as an optional, explicit user choice. If the product requires it, prefer Google Cloud Vision after privacy/cost approval; do not silently fall back from on-device processing to upload.

This follows [ADR 0001](../../../adr/0001-language-capability-boundaries.md): provider results normalize into app-owned language and recognition records, and neither provider identifiers nor response schemas become the Product Experience's model.

## Blocker disposition

| Blocker ID | Classification | Resolution and remaining decision |
| --- | --- | --- |
| `PROVENANCE-GAP-HUMAN-AUDIO-SOURCE-RIGHTS` | `DECISION_NEEDED` | Choose between (A) Speech Synthesis-only at launch, recommended, or (B) an independently licensed human-recording layer. This is not a dependency on identifying Nihongo's current providers or clips. If B is chosen, pin every source artifact and license and run the coverage/quality gate below. Commercial Forvo use would introduce a real subscription/procurement dependency, but the open-source options do not. |
| `PROVENANCE-GAP-SPEECH-SYNTHESIS-IMPLEMENTATION` | `NOT_BLOCKING` | Adopt `AVSpeechSynthesizer` as Zenbu's implementation. Exact Nihongo API, voice IDs, preprocessing, and fallback order are prohibited parity claims, not implementation prerequisites. Runtime voice availability and offline behavior remain test-matrix facts, not architecture decisions. |
| `PROVENANCE-GAP-ONLINE-OCR-CONFIG` | `DECISION_NEEDED` | Decide whether an online fallback is in launch scope. Recommended: on-device by default; Google Cloud Vision only after explicit user consent and privacy/cost approval. Nihongo's historical request parameters and the provider used for earlier captures need not be reconstructed. |
| `PROVENANCE-GAP-OFFLINE-OCR-COMPONENT` | `NOT_BLOCKING` | Adopt Apple Vision as Zenbu's on-device implementation. Exact identity of Nihongo's “On Device” component is unnecessary. Runtime-supported language interrogation and the fixture gate below determine the supported environment. |

There is therefore **no unconditional external dependency** among these four blockers. A Forvo contract or Google Cloud billing account becomes an external dependency only if the corresponding optional product choice is approved.

## Pronunciation recordings

### Lawful options

1. **No human recordings at launch (recommended).** Speech Synthesis covers every input for which the chosen Japanese system voice can synthesize output, avoids shipping a partially covered corpus, and leaves the user-visible audio control intact. Zenbu must describe it as synthesized speech and must not imply a native speaker recording.

2. **Pinned open corpora.** Tofugu publishes its older WaniKani vocabulary recordings in an official repository under CC BY-SA 4.0; the repository describes a Tokyo-accent male professional recording and a Kansai-accent female amateur recording and requires attribution to Tofugu and WaniKani ([Tofugu repository](https://github.com/tofugu/japanese-vocabulary-pronunciation-audio)). Kanji alive publishes 10,187 native-speaker recordings covering 6–12 common compounds for each of 1,235 kanji under CC BY 4.0, in Opus, AAC, Ogg, and MP3 ([Kanji alive repository](https://github.com/kanjialive/kanji-data-media)). These are viable *substitute inputs*, not proof of Nihongo's clip identity or coverage.

3. **Tatoeba sentence recordings, allowlisted per clip.** Tatoeba's audio has heterogeneous contributor-selected licenses, including recordings with no offsite license and noncommercial terms. Its official guidance requires checking each recording's license and recommends contributor attribution; audio is fetched per sentence rather than from a single current archive ([Tatoeba FAQ](https://en.wiki.tatoeba.org/articles/show/faq), [reuse guidance](https://en.wiki.tatoeba.org/articles/show/using-the-tatoeba-corpus)). It is acceptable only through a pinned allowlist that retains sentence ID, contributor, license, source URL, retrieval time, and hash. Exclude `NC` and no-offsite-license clips from a commercial build.

4. **Forvo API.** Forvo offers commercial API plans, but its API terms prohibit caching pronunciation audio and make generated audio links valid for two hours; each playback is counted as a request ([Forvo API terms](https://api.forvo.com/documentation/general-information/)). The listed small-business plan permits commercial use for 10,000 requests/day at USD 28.95/month, while corporate use is negotiated ([Forvo pricing](https://api.forvo.com/plans-and-pricing/)). This makes Forvo a network playback service, not a source for Zenbu-owned distributable clips. It adds availability, privacy, quota, recurring-cost, and procurement dependencies.

Current WaniKani API audio is not a suitable commercial source without a separate agreement. WaniKani's official API documentation says subject content cannot be used to build a for-profit product, even though its API exposes pronunciation URLs and voice-actor metadata ([WaniKani API reference](https://docs.api.wanikani.com/20170710/)). The separately published old-audio repository above has its own explicit open license and is the usable boundary.

### Recommended ingest and playback contract

- Store a `PronunciationRecording` only after matching its written form and reading to app-owned **Language Reference Data**; retain source name, upstream item ID/path, speaker description if supplied, accent/locale if supplied, license identifier, attribution text, artifact hash, encoding, and import revision.
- Do not merge two recordings merely because their written forms match. Reading and provenance remain part of identity.
- Prefer an eligible human recording when the product decision enables that layer; otherwise call Speech Synthesis. Never label synthesized output “native audio.”
- Cache and ship only when the source license permits it. Forvo audio must not be cached. Tatoeba clips must be admitted clip by clip. Preserve share-alike and attribution obligations for Tofugu assets and obtain a release/legal check before distribution.
- Prohibited claims: same provider, clip, speaker, accent, edit, mastering, coverage, or fallback order as Nihongo.

### Acceptance gate for a human-recording layer

Before enabling it, measure coverage by language-item kind and frequency band, manually review a stratified sample for reading correctness and clipping/noise, verify attribution rendering, verify source deletion/replacement handling, and prove deterministic fallback to Speech Synthesis. A partially covered open corpus is acceptable only if the fallback transition is invisible except for the disclosed voice/source difference.

## Speech Synthesis

Apple documents `AVSpeechSynthesizer` as a text-to-speech object with queued utterances, pause/stop/resume control, delegate events, audio routing, and buffer generation ([Apple `AVSpeechSynthesizer`](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer)). `AVSpeechSynthesisVoice` exposes the voices currently available on the device, including identifier, BCP 47 language, quality, and gender; the enhanced and premium qualities require a user download, while the default quality is available on the device by default ([Apple voice documentation](https://developer.apple.com/documentation/avfaudio/avspeechsynthesisvoice), [voice quality](https://developer.apple.com/documentation/avfaudio/avspeechsynthesisvoicequality)). `AVSpeechUtterance` exposes voice, rate, pitch, volume, delays, and IPA/SSML controls ([Apple utterance documentation](https://developer.apple.com/documentation/avfaudio/avspeechutterance)).

Recommended contract:

- Build a small `SpeechSynthesis` adapter whose input is text, BCP 47 language, optional app preference for a runtime voice identifier, and a Zenbu-owned rate preset.
- Enumerate installed voices at runtime. Prefer a saved, still-available Japanese identifier; otherwise ask the platform for a Japanese voice and record the actual identifier selected. Do not hardcode Nihongo's labels or assume an enhanced voice is installed.
- Feed a word's canonical reading—not an inferred spelling—to synthesis when **Language Reference Data** supplies it. Preserve sentence text for sentence playback. Add pronunciation overrides only as reviewed app-owned data.
- Keep one synthesizer for the playback scope so queue, stop, replay, and interruption behavior are explicit. A new playback request should stop or replace the current request according to the eventual interaction decision, not accidentally queue behind it.
- Do not redistribute system voice assets or persist generated buffers as a substitute corpus. Do not promise a particular speaker identity, byte-stable output, or exact parity with Nihongo.

Verification must enumerate voice identifiers/quality on every supported OS/device, test a default Japanese voice with networking disabled, test an absent enhanced voice and the fallback, and cover start/finish/cancel/interruption/route-change/replay behavior. The documentation proves the API boundary and default-vs-downloaded distinction; the device matrix—not an assumption—must prove the offline guarantee for each supported environment.

## On-device Image Text Recognition

Apple Vision is the direct baseline. Apple states that Vision text recognition supports real-time and offline cases and that processing happens on the user's device. The request supports fast/accurate paths, optional language correction and custom words, and runtime interrogation of languages supported by a request revision ([Apple text-recognition guide](https://developer.apple.com/documentation/vision/recognizing-text-in-images)). Apple introduced Japanese recognition in `VNRecognizeTextRequestRevision3` and advises querying `supportedRecognitionLanguages` rather than assuming a language list ([WWDC22: What's new in Vision](https://developer.apple.com/videos/play/wwdc2022/10024/)).

Recommended contract:

- At startup or first use, ask the selected request revision for supported languages. Enable the on-device Japanese route only when the returned identifiers include the required Japanese tag; retain OS version, request revision, recognition level, and returned list in test evidence.
- Begin with accurate recognition for a bounded still image. Compare automatic language identification with explicit Japanese-first recognition in the fixture study; select by measured output, not convention.
- Normalize observations into app-owned ordered regions containing recognized text, normalized image-space geometry, candidate confidence/evidence, recognition revision, and source-image transform. Provider observations never become the durable model.
- Process the smallest useful, correctly oriented image without lossy round trips. Preserve the original only when the user explicitly saves an **Image Text Result**.
- Never upload when the user selected On Device. Surface an offline-capability or unsupported-environment error instead of changing providers silently.
- Prohibited claims: same engine, model version, output ordering, vertical-text support, accuracy, or fallback behavior as Nihongo.

The implementation gate is a versioned fixture corpus covering horizontal/vertical Japanese, mixed Japanese/Latin text, furigana, low contrast, rotation, blur, handwriting, dense pages, and empty/no-text images. Measure character error rate, exact region text, region recall, reading order, geometry overlap, latency, memory, repeatability, and network isolation. Vertical Japanese remains unsupported until this gate passes; it must not be inferred from Japanese language support alone.

## Online Image Text Recognition

Online recognition is optional because it sends the selected image outside the device. If approved, Google Cloud Vision is the stronger documented choice:

- Google lists Japanese (`ja`, script `Jpan`) as a supported, regularly evaluated OCR language, including supported Japanese handwriting, and supports `TEXT_DETECTION` and `DOCUMENT_TEXT_DETECTION` ([language matrix](https://cloud.google.com/vision/docs/languages)).
- `DOCUMENT_TEXT_DETECTION` returns a page/block/paragraph/word/symbol hierarchy with bounding polygons, confidence, detected languages, and break information, which can normalize into Zenbu's ordered-region contract ([response schema](https://cloud.google.com/vision/docs/reference/rest/v1/AnnotateImageResponse)).
- For synchronous image operations, Google says image bytes are processed in memory and not persisted to disk; request metadata is temporarily logged, and submitted content is not used to train Cloud Vision ([data-usage FAQ](https://cloud.google.com/vision/docs/data-usage)). EU and US OCR endpoints are available if a regional processing boundary is selected ([OCR guide](https://cloud.google.com/vision/docs/ocr)).
- Current list pricing is per image: the first 1,000 OCR units each month are free, then Text Detection or Document Text Detection is USD 1.50 per 1,000 through five million units, subject to change ([pricing](https://cloud.google.com/vision/pricing)). Default text-detection quota is currently 1,800 requests/minute per project, also subject to change ([quotas](https://cloud.google.com/vision/quotas)).
- Google recommends about 1024×768 for OCR, warns that larger images may add latency/bandwidth without proportional accuracy, and documents file/request limits ([file guidance](https://cloud.google.com/vision/docs/supported-files)).

OCR.space is technically testable but is not the recommended default. Its official API documentation exposes Japanese (`jpn`), engine selection, orientation, scaling, overlay output, quotas, and paid plans ([OCR.space API](https://ocr.space/ocrapi)); its privacy policy says uploaded inputs are deleted after processing while request IP addresses are retained for one month ([privacy policy](https://ocr.space/privacypolicy)). It has a smaller public operational/compliance surface than Google and would still require the same explicit upload decision and evaluation corpus. Keep it only as a benchmark candidate unless it materially outperforms Google for Zenbu's fixtures.

Recommended online contract:

- Require a clear user opt-in before the first upload, explaining that the image leaves the device, identifying the selected provider and processing region, and offering On Device instead. Do not upload automatically after a local failure.
- Send only synchronous single-image OCR requests from a Zenbu-controlled backend; never embed provider credentials in the iOS client. Strip metadata, correct orientation locally, bound dimensions, and avoid Cloud Storage/public-URL indirection for private learner images.
- Start evaluation with `DOCUMENT_TEXT_DETECTION`; compare no language hint against a Japanese hint because Google says an incorrect hint can hinder recognition. Pin endpoint region and request fields after the corpus selects them.
- Do not persist source images or raw provider responses server-side. Return normalized ordered regions, provider/version/config identifiers, timings, and error class, then discard transient payloads. Saved source images remain governed by the **Image Text Result** contract on device.
- Use a short request deadline and at most one automatic retry for a safe idempotent request on `UNAVAILABLE`, with jittered backoff; do not automatically retry invalid input, authorization, quota exhaustion, or user cancellation. Google's API guidance identifies `UNAVAILABLE` as retryable and treats quota exhaustion as generally non-retryable ([AIP-194](https://google.aip.dev/194)). Surface a Retry action without switching providers.
- Apply the same fixture metrics used for Apple Vision, plus upload size, end-to-end latency, cost/image, transient-data audit, provider error/retry behavior, quota behavior, and deletion/logging-policy review.

## Consolidated stakeholder decision

One product decision can clear both `DECISION_NEEDED` records:

> **Recommended launch boundary:** ship Apple Speech Synthesis for all pronunciation playback and Apple Vision for on-device Image Text Recognition. Human recordings and online Image Text Recognition are optional post-baseline enhancements; they require their own explicit enablement decision and acceptance evidence, but do not block implementation of the baseline.

If stronger reference-like breadth is required at launch, approve the smallest addition:

- human audio: ingest pinned Tofugu/Kanji alive assets first; add only license-allowlisted Tatoeba sentence clips; use Forvo only after accepting network-only playback and procurement; and
- online recognition: approve Google Cloud Vision with explicit upload consent, selected processing region, a cost ceiling, and the fixture-derived request configuration.

Either path is clean-room compliant. Neither path permits claims about Nihongo's exact providers, clips, request parameters, system voice identifiers, private preprocessing, or fallback order.
