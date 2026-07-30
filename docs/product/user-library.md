# User Library

Status: evolving product contract

## Role

The User Library is the learner's private, device-local catalog of content Zenbu Japanese has analyzed. It is a learning and analysis system, not general-purpose file storage.

An uploaded file or entered URL is an input to analysis. The durable product value is the extracted Japanese, its language analysis, and the learner's activity—not a Zenbu-managed copy of the original source.

## Analysis records

The User Library can retain:

- the learner-provided title and source kind
- an external URL or local-file reference when applicable
- extracted and segmented Japanese text
- resolved dictionary words and occurrence contexts
- JLPT, frequency, difficulty, and coverage results
- learner-selected cohorts or focus areas
- related learning state and progress

Larger works produce a **Media Entry** with a **Media Analysis** covering the work as one entity. Examples include a movie script, subtitle file, song, video, PDF, book, manga, or game script.

Single-shot Lookup Capture behavior remains separate from larger Media Analysis, even though both can reuse the same underlying language-analysis capabilities.

## Original sources

- Original source files are temporary processing inputs or externally referenced resources.
- Zenbu does not act as a drive or managed media-file repository.
- Watch, Listen, or Read may use an available local file or URL.
- If an external source becomes unavailable, the learner can relink it while preserving the existing analysis.

## Collections

- Learners can create and name their own Collections of analysis records.
- Collections organize analyzed entities without imposing system-defined subject categories.
- An analysis record exists independently of Collection membership.

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
