---
status: accepted
---

# Share language data as a versioned artifact

Every Zenbu client, including iOS, the website, and the browser extension, uses the same
language data. A build pipeline converts the sources into versioned, platform-neutral SQLite
artifacts. Each artifact has a manifest giving its schema version and SHA-256. Clients download
an artifact and query it locally. No client sends dictionary lookups to a server, so clients
keep working offline. The website publishes pages from its own copy and is not a lookup service
([ADR 0007](0007-publish-the-dictionary-at-permanent-urls-from-the-websites-copy.md)). Data versions are independent of app versions: each client declares the
schema versions it can read.

JMdict is the dictionary for every client. The browser extension moves into this repository
as `apps/extension/` and replaces its Jitendex data with the shared artifact.

Artifacts are published to a public Cloudflare R2 bucket behind a Zenbu-owned domain, and
published objects are never overwritten. Only CI publishes. A build job with no credentials
produces the artifact, then a publish job runs from `main` behind a protected environment with
a token scoped to the bucket. Frequency-pack sources are still uploaded
with `publish_frequency_pack_sources.py` until this pipeline exists.

Amended (issue 463, step 3): the `language-data-release` environment has no required reviewer,
by the owner's decision, as for website production deploys; a reviewer can be added without
changing the workflow. The index of releases, `releases.json`, lives in the bucket beside them
rather than in the repository, and is only ever appended to. The bucket is
`zenbujapanese-language-data`; its public domain isn't set up yet. The layout and rules are in
[`language-data/README.md`](../../language-data/README.md).

## Language Reference IDs are permanent

A rebuild never changes or reuses a Language Reference ID. Anything a learner saves about a
word refers to it by Language Reference ID, so saved data and synced data survive dictionary
updates. Word notes and encounter media still use `WordNoteID`, which hashes a word's meanings
and so changes when JMdict edits them. They move to Language Reference IDs before any learner
data syncs.

## Precompute first, and hold clients to one conformance suite

Logic moves into the artifact as precomputed rows wherever it can, such as example links,
ranking inputs, and related words, so clients only run queries. Only the logic that can't be
precomputed needs a shared runtime. The choice between a TypeScript core and a Rust core is
treated as a tokenizer decision, made by whichever candidate passes the conformance suite.
[ADR 0008](0008-share-one-typescript-search-core-built-for-the-most-constrained-client.md) makes
search one TypeScript core, built for the most constrained client.

The suite is [`search-retrieval.json`](../../apps/ios/LanguageData/Conformance/search-retrieval.json).
Each case maps a query to the Language Reference IDs Search returns, in order, before
frequency evidence reorders them, along with its resolution, presentation, and reading
refinement. The suite pins the artifact SHA-256 it was recorded against. Every client must pass
it. On iOS, `SearchConformanceTests` checks it. After an intended change to Search or the
dictionary, record it again and review the diff. The suite starts with search queries. Text
inputs, such as full sentences, need the downloadable Japanese Text Analysis pack and are added
once tests can load it.

The discussion and reviewer answers are in
[issue 377](https://github.com/serpcompany/zenbujapanese-monorepo/issues/377). This decision
refines [ADR 0001](0001-keep-language-data-and-tools-replaceable.md) and
[ADR 0005](0005-keep-a-lightweight-product-family-monorepo.md). It does not choose the sync
backend, the artifact's exact schema, or the tokenizer.
