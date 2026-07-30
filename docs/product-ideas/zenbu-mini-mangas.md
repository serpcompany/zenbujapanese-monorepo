# Zenbu Mini Manga

Short, funny illustrated stories that turn levelled Japanese word banks into
memorable reading, listening, and vocabulary lessons.

## Prototype

**Live POC:** https://zenbu-mini-manga.devinschumacher.chatgpt.site

**Local implementation:**

```text
../PROTOTYPES/jvs_dataset_analysis/
  docs/mini_manga_template.md
  docs/mini_manga_lessons.json
  docs/mini_manga_scene_01.md
  docs/mini_manga_scene_02.md
  scripts/generate_mini_manga_audio.rb
  scripts/validate_mini_manga.rb
  mini-manga-web/
```

Detailed implementation documentation:

```text
../PROTOTYPES/jvs_dataset_analysis/mini-manga-web/README.md
../PROTOTYPES/jvs_dataset_analysis/mini-manga-web/docs/IMPLEMENTATION.md
```

The July 2026 POC proves the complete content loop with two Level 1 stories,
eight illustrated panels, word-level definitions, natural translation reveals,
two-character audio, and responsive learner UI.

## Product thesis

Beginner example sentences are easy to understand and easy to forget. A short
comic with a setup and visual payoff gives the same vocabulary a concrete scene,
emotion, and retrieval cue.

The learning unit should not be a disconnected sentence. It should be:

```text
levelled vocabulary
  + original mini-story
  + sequential visual context
  + inspectable words
  + natural translation
  + replayable character audio
```

The learner first understands the situation from the manga, reads the Japanese,
inspects only unfamiliar words, listens, and reveals English last.

## Learner experience

Each mini-manga contains 4–6 panels and supports:

- Japanese with furigana;
- kana-only and romaji fallback layers;
- hover, keyboard-focus, and tap word definitions;
- natural rather than word-for-word English;
- one audio clip per panel;
- one full conversation track;
- an expandable lesson word bank;
- responsive desktop and mobile reading order.

Possible future study modes:

- hide furigana until hover;
- known / learning / unknown word states;
- shadowing with playback speed and line loops;
- speech-bubble overlay;
- comprehension questions;
- cloze recall after reading;
- save and revisit difficult panels;
- unlock stories through a frequency-word curriculum.

## Content rules

### Make it a story

Every episode needs:

1. a recognizable hook;
2. a detail that creates expectation;
3. a turn;
4. a visual or verbal payoff.

The final panel should change the learner's interpretation of something earlier.
The joke should still be visible when dialogue is hidden.

Good tones include:

- absurd;
- cute;
- awkward;
- funny-spooky;
- surprising;
- clever.

Generic greetings and low-stakes small talk are not enough.

### Control the level

- Select one canonical vocabulary level.
- Aim for 8–14 target entries per episode.
- Record exact source provenance for every target.
- Keep content words within level.
- Allow names, particles, inflections, and ordinary connective grammar as
  scaffolding.
- Mark no more than two explicit stretch words.
- Keep lines short enough to pair cleanly with one panel.

The current POC uses the Japanese Vocabulary Shortcut frequency reference:

```text
resources/japanese-frequency-word-lists/
  japanesevocabularyshortcut-wordlist.csv
```

Conversation data may inform natural usage, but episode dialogue must be
original.

## Content object

The production source should be a structured lesson manifest rather than prose
documents or hardcoded UI.

Each lesson needs:

- stable ID, title, level, premise, and comic engine;
- character visual and voice identities;
- ordered panels with story beats;
- Japanese, kana, romaji, English, and clean TTS text;
- token-to-definition mappings;
- vocabulary source entries and levels;
- panel art, alt text, line audio, and full audio;
- generation and human-review status.

The existing POC manifest demonstrates this model:

```text
../PROTOTYPES/jvs_dataset_analysis/docs/mini_manga_lessons.json
```

## Content production loop

1. Select compatible targets from the levelled word bank.
2. Brainstorm multiple visual premises.
3. Choose the premise with the strongest final-panel image.
4. Write four short Japanese lines.
5. Audit vocabulary and simplify before allowing stretch words.
6. Add readings, kana, romaji, natural English, and clean TTS text.
7. Define characters and visible panel actions.
8. Generate text-free sequential art.
9. Generate per-panel and full-scene audio.
10. Validate provenance, formats, panel count, and media.
11. Human-review language, art continuity, joke quality, and pronunciation.

Art should not contain generated lesson text. Keeping language in HTML makes it
editable, accessible, searchable, and translatable.

## POC architecture

The current web prototype uses:

- React and Next-compatible components;
- vinext for Cloudflare-compatible output;
- OpenAI-generated manga illustrations;
- ImageMagick panel cropping;
- Japanese macOS TTS for preview voices;
- FFmpeg conversion and dialogue concatenation;
- OpenAI Sites private hosting.

The POC manually duplicates lesson records into the UI to make interaction
design fast. The next implementation should compile the canonical JSON manifest
into a generated typed module at build time.

## Product roadmap

### Milestone 1 — Content compiler

- JSON Schema for lessons.
- Build-time TypeScript generation.
- Token-to-vocabulary validation.
- Asset existence and audio-duration checks.
- Zero hardcoded story content in UI components.

### Milestone 2 — Learning loop

- known / learning / unknown vocabulary state;
- playback rate and line looping;
- shadowing mode;
- furigana reveal preferences;
- reading and listening completion state;
- lightweight recall after each story.

### Milestone 3 — Curriculum

- map the first 1,000 words into coverage groups;
- sequence stories by cumulative known vocabulary;
- cap new targets per lesson;
- recycle targets across later episodes;
- report coverage and retention by learner.

### Milestone 4 — Editorial tooling

- story and panel editor;
- vocabulary-level warnings;
- visual continuity references;
- audio regeneration and pronunciation review;
- publication states and revision history;
- mobile preview and accessibility checks.

## Success criteria

The concept is working if learners:

- finish a story without immediately opening every translation;
- remember target words through the visual payoff;
- replay Japanese lines voluntarily;
- correctly recognize recycled words in later episodes;
- prefer the mini-manga lesson to equivalent flashcards or dialogue tables;
- complete multiple episodes in one session.

Useful product metrics:

- translation reveal rate;
- per-line replay rate;
- vocabulary-card open rate;
- story completion;
- next-story continuation;
- delayed target recall;
- return rate by story tone and visual style.

## Open questions

- Should episodes share recurring characters and a connected world?
- Should speech bubbles be visible by default or remain in the learning panel?
- How many new targets per story maximizes comprehension without making stories
  linguistically bland?
- Which audio system provides the best balance of natural acting, licensing,
  consistency, and regeneration control?
- Should romaji disappear automatically after an onboarding period?
- How should visual humor, cultural context, and beginner readability be
  editorially reviewed?

## Related references

- Japanese Vocabulary Shortcut
- Devin's “1,000 words / 20 short stories” book concept
- Devin's “learn Japanese through simple manga” book concept
- [Word lists](./word-lists.md)
- [Japanese/English dictionary](./jp-en-dictionary.md)
