# Media Library

Status: evolving product contract

## Role

The Media Library is the Product Experience for privately browsing and managing media the learner has imported into Zenbu Japanese. It owns adding media, presenting each durable Media Entry, and running and revisiting the Media Analysis attached to that entry. It is a learning and analysis system, not a universal store for everything the learner has encountered and not general-purpose file storage.

An uploaded file or entered URL begins as a transient analysis input. After
reviewing the result, the learner explicitly chooses whether to discard it or
save it as a Media Entry. A saved Media Entry retains the source when Zenbu can
own it, or a durable external reference when the source cannot be retained.

Lookup history and Saved Language Items do not live in the Media Library. Lookup owns its own history. The final name, organization model, navigation placement, and cross-product use of Saved Language Items require a separate prototype decision.

## User-facing boundary

The Media Library lets a learner:

- browse and manage previously imported media
- add supported media for analysis
- open a Media Entry
- run or revisit Media Analysis
- inspect analysis results without consuming the media inside Zenbu
- launch an applicable deferred Consumption Experience when one exists

Media Analysis is a Media Library-owned workflow and result, not a separate Product Experience. The detailed import types, Library layout, Media Entry screens, analysis presentation, and handoffs require later specification and prototypes.

Read, Watch, and Listen are separate deferred Consumption Experiences with purpose-built interfaces. A compatible Media Entry may launch one of them, but the Media Library remains useful without them.

## Analysis records

The Media Library can retain:

- the learner-provided title and source kind
- an external URL or local-file reference when applicable
- extracted and segmented Japanese text
- resolved dictionary words and occurrence contexts
- JLPT, frequency, difficulty, and coverage results
- learner-selected cohorts or focus areas

Larger works produce a **Media Entry** with a **Media Analysis** covering the work as one entity. Examples include a movie script, subtitle file, song, video, PDF, book, manga, or game script.

The single-image Image Text Flow remains separate from larger Media Analysis,
even though both can reuse the same underlying language-analysis capabilities.

## Source retention

- Processing alone creates no durable record. Discard removes both the
  temporary source and its derived working analysis.
- Save creates a Media Entry containing the analysis and the retained source
  when Zenbu can own it. Sources that cannot be retained use a durable external
  reference instead.
- Zenbu does not become a general-purpose drive merely because saved Media
  Entries retain their sources.
- Future Watch, Listen, or Read experiences may use the retained source or an
  available external reference.
- Exact copy, relinking, deletion, backup, sync, storage-limit, and unavailable-
  source behavior belongs to the durable-record and persistence decisions.

## Collections

- Learners can create and name their own Collections of Media Entries.
- Collections organize analyzed entities without imposing system-defined subject categories.
- A Media Entry exists independently of Collection membership.

## MVP ownership and persistence

- Completed analyses persist locally on the learner's device.
- Analysis history and offline access do not require an account.
- Analysis records are private by default.
- MVP does not require account sync, a public catalog, community publishing, or Zenbu-curated content.

Sync, backup, publishing, and shared catalogs are deferred possibilities rather than MVP requirements.

## Historical reference

The earlier Japanese Media Vocabulary Coverage MVP proved shared analysis across scripts, subtitles, lyrics, and other media:

- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-db/docs/0. Project Plan/PRD.md`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-db/docs/0. Project Plan/Reader.md`
