---
status: accepted
---

# Share one TypeScript search core, built for the most constrained client

Search retrieval becomes one TypeScript core that every client runs. It is written for
Cloudflare Workers, the most constrained client: 128 MB of memory, no large local files, and D1's
SQLite. Code that runs there runs on the browser extension and the app without cutting a feature
for lack of memory or CPU. The app moves to the core through JavaScriptCore, which already runs
Kuromoji ([issue 481](https://github.com/serpcompany/zenbujapanese-monorepo/issues/481)). Until
then, Swift and TypeScript change together, and the conformance suite checks both.

## Precompute what a Worker can't do, and make the rest a capability

Work too heavy for a Worker moves into the artifact as precomputed rows (ADR 0006), such as each
word's examples, each kanji's words, and example sentences split into words. What can't be
precomputed becomes a capability that a client supplies to the core.

Features that won't run on the constrained client are still welcome. They are built as
capabilities, so they run wherever the capability is supplied and are off where it isn't. A
client without a capability has that feature off and the rest of Search unchanged, as the app
already works when its analyzer is unavailable.

Sentence search is the first capability. Listing the words of a Japanese phrase that isn't one
dictionary word needs a morphological analyzer, and the app's, Sudachi, loads a 217 MB
dictionary. The website supplies no analyzer, so it has no sentence search and is a glossary of
words and kanji.
[ADR 0009](0009-serve-the-websites-dictionary-from-a-service-running-the-shared-core.md)
runs the website's core in a service that supplies Sudachi, so the website gets
sentence search, and nothing is precomputed for it. The conformance suite skips cases the app records as sentence search for a
client without it.

ADR 0006 left TypeScript or Rust to whichever passed the conformance suite. TypeScript wins
because the website and the extension run JavaScript and the app already embeds JavaScriptCore.
The costs are that search on iOS runs in JavaScriptCore, whose speed issue 481 measures, and
that the website has no sentence search.

The discussion is in [issue 481](https://github.com/serpcompany/zenbujapanese-monorepo/issues/481)
and [PR 478](https://github.com/serpcompany/zenbujapanese-monorepo/pull/478). This decision
refines [ADR 0006](0006-share-language-data-as-a-versioned-artifact.md).
