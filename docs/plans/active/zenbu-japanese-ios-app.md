# zenbu japanese ios app plan

This is another attempt to create our IOS app based on what we learned from creating all of the previous [prototypes](../../../../prototypes/) and previous attempts.

## Decisions

App sections will include:

1. Lookup - A dictionary. Word/phrase/sentence/kanji lookups tool. A clone of the Nihongo pro app is the target for MVP of the lookup.
2. Translator - A language translation app for sentences, text, and real-time conversations. A clone of Google Translate app as far as features and UI would be the target for MVP. However, their tech-stack is sub-par when it comes to translating japanese. We will reach for other discovered resources (like what we found with the Owll Translator stack) and protoypes in one of our previous attempts that had much better results. We will also add in some additional things to help optimize our translation (like giving the AI the full conversation context for every new translation in-convo so it has context to build on to make the Japanese more relevant and sensible).
3. Media - This will include:
   1. Read
   2. Watch
   3. Listen
4. Dojo - Study tools, like:
   1. Premade mini courses / cohort groups of "cards" to study (people, places, counting, clothing, etc.)
   2. Anki style spaced reptition of pre-made decks, or custom made decks, or user imported decks
5. Capture (KanjiMon)
6. Profile/Settings/Other


## Preserves & Revisits

- Best full-UI implementation and base 'theme/style/aesthic' we are going for that has been accomplished so far and followed: `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-app-v2/_archive/nextjs-app`
- Best working reader implementation so far: <!-- TODO: add in wherever the zenbu japanese testflight app working on my phone project is -->
  - 1. The capture-ocr-parse flow is too slow, and i think it relies on an internet connection. This should be acheivable fully offline. Otherwise, the ocr/parsing does work well.
  - 2. The parse-translate feature could be improved: parsing and displaying translations more like migaku/asbplayer/sugoku style where words are underlined and you can toggle furigana above, individual word translations below, and click to see a dictionary box above the word (currently its a slide up screen which is actually quite disruptive).
  - 3. The natural translation feature works great, and should be preserved.
  - 4. This entire functionality could also probably be rolled/folded into the "Lookup" area 'capture by camera, or photo/file upload" rather than in an entirely separate section. The Reader area (now a part of 'Media' should probably be used more for uploads of entire mangas, or TV show / game scripts / etc. rather than single 'capture-lookup' flows)

## Planning workflow

Use a breadth-first product landscape pass before detailed feature design or implementation planning.

For each Product Experience:

1. inspect existing plans, prototypes, and code for discoverable facts
2. resolve one product decision at a time
3. provide a recommended answer with each question
4. update no more than one focused document after a decision is confirmed
5. record unresolved detail under that feature's `Open questions`
6. stop when the feature's purpose, MVP boundary, ownership, exclusions, and important references are clear

Do not select concrete libraries, datasets, providers, or implementation order during the landscape pass. Later passes will reconcile prototype behavior, evaluate technical solutions, and create execution issues.

## Current checkpoint

The Media Analysis landscape pass is sufficiently defined for now:

- it analyzes a larger bounded work as one entity
- it is distinct from single-shot Lookup Capture
- MVP produces durable, device-local analysis in the User Library
- MVP uses reference classifications rather than learner-personalized scoring
- MVP does not include file storage, public catalogs, community publishing, curated content, or interactive consumption experiences
- Watch, Reader, and Listen remain separate deferred product definitions
- the exact Vocabulary Profile remains an open question

Continue next with the **Lookup landscape pass**. Start by reconciling Lookup's role as dictionary/search with its single-shot camera or image Capture flow. Do not begin implementation planning.

## Current planning sources

- [Domain glossary](../../../CONTEXT.md)
- [User Library](../../product/user-library.md)
- [Media Analysis](../../product/media-analysis.md)
- [Language capability boundaries](../../adr/0001-language-capability-boundaries.md)
