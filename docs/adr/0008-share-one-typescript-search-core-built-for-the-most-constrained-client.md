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
runs the website's core in a service that supplies Sudachi, so the website gets sentence search,
and nothing is precomputed for it. The conformance suite skips cases the app records as sentence
search for a client without it.

ADR 0006 left TypeScript or Rust to whichever passed the conformance suite. TypeScript wins
because the website and the extension run JavaScript and the app already embeds JavaScriptCore.
The costs are that search on iOS runs in JavaScriptCore, whose speed issue 481 measures, and
that the website has no sentence search (until ADR 0009, whose service supplies it).

The discussion is in [issue 481](https://github.com/serpcompany/zenbujapanese-monorepo/issues/481)
and [PR 478](https://github.com/serpcompany/zenbujapanese-monorepo/pull/478). This decision
refines [ADR 0006](0006-share-language-data-as-a-versioned-artifact.md).

## Amendment: the app's search runs the core

The first step of
[issue 481](https://github.com/serpcompany/zenbujapanese-monorepo/issues/481) moved the app's
search retrieval, its lookup of a linked text's words, and a kanji's words onto the core, and
removed the Swift that did them. The app loads a bundle of the core into JavaScriptCore and
gives it one function, which answers the core's SQL from the app's own connection as JSON
([`dictionary-core.md`](../agents/dictionary-core.md), Embedded;
[`ios.md`](../agents/ios.md), The dictionary core in the app). The rest of the app's dictionary
logic (examples, word and kanji detail, and the results screen) is still Swift the core ports,
and moves the same way.

Three choices that aren't obvious from the code:

- **The core answers IDs, and the app reads its own entries.** JavaScriptCore runs without its
  JIT inside an app, on the Mac as on iPhone, so the interpreter should carry only what it ranks
  with. An entry is read once, natively, for the results that are shown. The Swift search decoded
  every candidate's whole entry, which is why broad queries got faster, not slower.
- **It runs inside the lookup actor, not on a thread of its own.** Every read is synchronous, so
  a call settles before it returns, a cancelled task stops at the next row as it did, and one
  connection serves the core and the app's own entry reads without a lock. A search that needs a
  sentence's words returns to Swift to await Sudachi, then goes on.
- **The bundle is checked in.** The app builds without Node, and the core's tests fail when the
  file isn't what the source builds.

Measured on 2026-10-10 against the Swift it replaced, in optimized builds, on a Mac and on an
iPhone Simulator with JavaScriptCore's JIT turned off, as it is on a device (the Simulator's JIT
makes JavaScript several times faster and holds several times the memory):

| | Mac, Swift | Mac, core | Simulator, Swift | Simulator, core |
| --- | --- | --- | --- | --- |
| 45 uncached searches | 8.4 s | 5.4 s | 9.2 s | 7.2 s |
| 1,000 entries read by ID | 51 ms | 41 ms | 84 ms | 67 ms |
| 8 kanji's words | 323 ms | 321 ms | 338 ms | 366 ms |
| 200 example sentences linked, first time | 117 ms | 129 ms | 473 ms | 255 ms |
| The same sentences linked again | 72 ms | 59 ms | 391 ms | 59 ms |
| An abandoned search out of the next one's way, at the median | 6 ms to 49 ms | 2 ms to 7 ms | 6 ms to 40 ms | 3 ms to 8 ms |
| Memory after the searches | 222 MB | 111 MB | 54 MB | 53 MB |
| Memory at its highest | 293 MB | 257 MB | 223 MB | 249 MB |

Forty of the 45 searches were as fast or faster on the Mac, every broad one among them (い 2.6 s
to 1.7 s, go 440 ms to 100 ms, see 344 ms to 16 ms), and five were 0.1 ms to 1.6 ms slower. One
word looked up alone, outside a text, costs about 0.5 ms where the Swift took 0.4 ms.
`SearchLatencyTests` repeats the measurement
([`ios.md`](../agents/ios.md), The dictionary core in the app). No iPhone was measured.
