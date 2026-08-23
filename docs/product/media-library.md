# Media Library

Status: evolving product contract

## Role

The Media Library is the Product Experience for privately browsing and managing media the learner has retained in Zenbu Japanese. Its first lightweight surface presents Encounter Media saved while learning words. Larger imported works remain distinct Media Entries with attached Media Analysis. It is not general-purpose file storage.

An uploaded file or entered URL begins as a transient analysis input. After
reviewing the result, the learner explicitly chooses whether to discard it or
save it as a Media Entry. Saving succeeds only for a supported source Zenbu can
copy into app-owned storage; MVP does not create reference-only Media Entries.

Lookup history and Saved Language Items do not live in the Media Library. Lookup owns its own history. Encounter Media appears here because the library owns the retained image once, while Lookup owns the word association represented by each Encounter Example.

## User-facing boundary

The Media Library lets a learner:

- browse Encounter Media and see every associated word
- open an Encounter Media image at useful size
- delete Encounter Media and all of its word associations
- browse and manage previously imported media
- add supported media for analysis
- open a Media Entry
- run or revisit Media Analysis
- inspect analysis results without consuming the media inside Zenbu
- launch an applicable deferred Consumption Experience when one exists

The version 1 implementation is intentionally light: a native list, image detail, associated words, and deletion for Encounter Media. It does not implement larger-work import or Media Analysis. Media Analysis is a Media Library-owned workflow and result, not a separate Product Experience; its detailed import types, Media Entry screens, analysis presentation, and handoffs require later specification and prototypes.

Read, Watch, and Listen are separate deferred Consumption Experiences with purpose-built interfaces. A compatible Media Entry may launch one of them, but the Media Library remains useful without them.

## Analysis records

The Media Library can retain:

- Encounter Media, stored once even when associated with several words
- the learner-provided title and source kind
- an app-owned copy of the imported source
- extracted and segmented Japanese text
- resolved dictionary words and occurrence contexts
- JLPT, frequency, difficulty, and coverage results
- learner-selected cohorts or focus areas

Larger works produce a **Media Entry** with a **Media Analysis** covering the work as one entity. Examples include a movie script, subtitle file, song, video, PDF, book, manga, or game script.

The single-image Image Text Flow remains separate from larger Media Analysis,
even though both can reuse the same underlying language-analysis capabilities.

## Encounter Media retention

- Opening a recognized word from Image Text creates an Encounter Example and retains its source image as Encounter Media.
- Adding an image from Word Detail creates the same association without running Image Text recognition.
- Reopening the same word from the same image is idempotent.
- The same word may accumulate many images, and the same image may be associated with many words.
- Remove from Word deletes only the selected association. It deletes the media bytes only when no other association remains.
- Delete in Media Library removes the Encounter Media, every association, and its app-owned bytes.
- Encounter Media participates in normal system-managed device backup and is never uploaded by this capability.

## Source retention

- Processing alone creates no durable record. Discard removes both the
  temporary source and its derived working analysis.
- Save copies the supported source into app-owned storage and creates a Media
  Entry containing that source and its completed analysis. Moving, renaming, or
  deleting the original has no effect on the saved entry.
- A Media Entry's source is immutable in MVP. It cannot be replaced, relinked,
  or deleted independently, and importing different media creates a new entry.
- MVP stores the completed analysis produced before Save and offers no
  reanalysis workflow or analysis-version history.
- Deleting a Media Entry permanently deletes its app-owned source, attached
  Media Analysis, and Collection memberships. Independently created Saved
  Language Items and Encounter Examples remain.
- Zenbu does not evict a saved source independently to reclaim storage. A
  missing or corrupt app-owned source is an integrity failure: any readable
  analysis may remain available, but MVP offers deletion rather than relinking.
- Zenbu does not become a general-purpose drive merely because saved Media
  Entries retain their sources.
- Future Watch, Listen, or Read experiences may use the app-owned source.
- Durable records and non-recreatable app-owned sources participate in the iPhone's normal system-managed backup. Custom sync, backup controls, and storage-limit policy remain later decisions.

## Collections

- Learners can create and name their own Collections of Media Entries.
- Collections organize analyzed entities without imposing system-defined subject categories.
- A Media Entry exists independently of Collection membership.

## MVP ownership and persistence

- Completed analyses persist locally on the learner's device.
- Analysis history and offline access do not require an account.
- Analysis records are private by default.
- MVP does not require account sync, a public catalog, community publishing, or Zenbu-curated content.

Custom sync, user-facing backup controls, publishing, and shared catalogs are deferred possibilities rather than MVP requirements; normal system-managed device backup remains required.

## Historical reference

The earlier Japanese Media Vocabulary Coverage MVP proved shared analysis across scripts, subtitles, lyrics, and other media:

- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-db/docs/0. Project Plan/PRD.md`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-db/docs/0. Project Plan/Reader.md`
