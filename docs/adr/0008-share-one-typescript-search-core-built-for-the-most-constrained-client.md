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

## Amendment: the app runs all of the core

The rest of [issue 481](https://github.com/serpcompany/zenbujapanese-monorepo/issues/481) moved
everything else the app's dictionary decides onto the core: the results screen with its
frequency re-sort, Sort By, and Filter; example sentences and linked words; the word, kanji,
and kanji element pages; furigana; a query's normalization; and the short meaning under a
linked word. The Swift that did them is gone, and so is the `Search parity` check that asked
for both sides of each to change together. The app's Swift keeps the screens, reads the files,
and decodes the core's answers ([`dictionary-core.md`](../agents/dictionary-core.md), The app's
side; [`ios.md`](../agents/ios.md), The dictionary core in the app).

The choices that aren't obvious from the code:

- **The core answers what a screen says, not only what it holds.** Titles, orders, labels,
  counts, and what VoiceOver reads are fields of the answer. A rule decided in a view would be
  decided again in the next client, which is what this issue ends.
- **Three engines, split by how long a call takes.** A search or a page of linked sentences
  takes tens of milliseconds and awaits, so each has an actor with its own engine and its own
  SQLite connection. A row's furigana or a page's model takes under a millisecond and is needed
  while a view is being built, so the third engine sits behind a lock and answers
  synchronously. One engine for all three would make a row wait behind a search.
- **Kuromoji runs in the text engine.** The core calls its `tokenize` directly, so linking a
  text is one call, with no trip back to Swift for each sentence's words. Sudachi, which a
  launch switch still compares, answers through the call instead. The core has since taken
  over the tokenizing itself ([Speed in an engine without a JIT](#speed-in-an-engine-without-a-jit)).
- **The kanji files stay with the host.** Parsed into an engine they are 16 MB of objects the
  collector walks on every pass. The host maps the files, scans them once for each record's
  place, and hands over a record's bytes when the core asks.
- **The Swift's answers were recorded before it was removed.** Beside the recorded suites, each
  part was compared with the core across the whole of the data: every kanji's page and every
  element's page, every entry's first meaning as a short gloss, and every headword, reading,
  and summary as a query. They agreed, apart from two things the core does by the standard and
  Foundation did not: it joins a halfwidth kana and its voiced mark (ｶﾞ is ガ), and lowercases a
  word's final Σ to ς. A new suite, `kanji-element.json`, holds what the Swift element page
  showed.

Measured on 2026-10-10 against the Swift it replaced, in optimized builds on a Mac, whose
JavaScriptCore runs without its JIT as a device's does. The first four rows are the recorded
suites run one at a time: each does everything its screen needs for every case, through the
clients the views use.

| | Swift | Core |
| --- | --- | --- |
| The results screen for 56 queries | 43.5 s | 31.8 s |
| Example Sentences for 67 queries, the first five sentences of each linked | 72.4 s | 35.6 s |
| Word Detail for 54 words, with their examples and every conjugated form's | 34.0 s | 27.5 s |
| Kanji Detail for 33 kanji | 2.28 s | 2.20 s |
| The example count a results screen waits for, 14 queries, none remembered | 1.76 s | 1.48 s |
| 200 example sentences linked, first time | 137 ms | 162 ms |
| The same sentences linked again | 65 ms | 12 ms |
| The kanji data read at launch | 175 ms | 14 ms |
| The first kanji page's reference | 160 ms to 230 ms | 0.7 ms |
| Memory after a session of searches, examples, linked sentences, and kanji pages | 308 MB | 280 MB |
| Memory at its highest in that session | 308 MB | 289 MB |

Search itself did not change (45 uncached searches: 5.7 s before and after), and the first
search after launch starts one more engine, which takes about 7 ms. A screen's model
costs the engine about a millisecond: a results screen 1.2 ms (1.5 ms sorted by a dictionary), a
word page 0.2 ms, a kanji page 0.6 ms, an element page 0.7 ms, and a word's furigana 0.04 ms
before it is remembered. The Swift's own time for each was not measured and will have been
shorter; none is a frame, and the screens are faster as a whole because their examples are.

One thing is slower: a sentence linked for the first time takes about 0.8 ms where it took
0.7 ms, since the engine reads each linked entry's forms to choose its furigana and the app
then reads the entry itself. Linked again, it takes 0.06 ms where it took 0.3 ms, because the
core remembers it. `SearchLatencyTests` repeats every measurement
([`ios.md`](../agents/ios.md), The dictionary core in the app). No iPhone was measured.

### The rules that were left in Swift

The first pass left a few rules in Swift because each was small or drew something: whether a
string is one kanji, decoding a stroke diagram, romaji, the radical panel, which handwriting
candidates are offered, which linked words count toward comprehension and which punctuation
stays with its neighbour on a line, when a radical pick narrows the results, reading a
zenbujapanese.com link, and choosing the entry a related or a saved word opens. They moved
too, on 2026-10-10, so that a client with no Swift (the website, a browser extension) answers
the same without writing them again. Each was compared with its Swift across the data first
([`dictionary-core.md`](../agents/dictionary-core.md), The app's side).

Romaji had been Foundation's transliteration, which no other client has. The core now holds
the same rules, read out of the system's ICU, and agrees with Foundation on every reading and
every example sentence in the bundled data. It leaves other writing systems as written, where
Foundation turned them to Latin letters too.

Measured the same way: 1,798 readings take the core 53 ms the first time (Foundation took
17 ms) and 0.5 ms once remembered; 200 linked sentences take 17 ms, then 0.4 ms, where the
Swift transliterated every word again on each redraw; the radical panel opens in 11 ms and
answers a pick in 1.7 ms (the Swift took 14 ms and 4.5 ms); a stroke diagram takes 0.2 ms; and
a kanji check 0.007 ms before it is remembered.

What stays in Swift is what needs the platform or belongs to the learner: reading files,
parsing a URL, drawing, the learner's stored data and its sync, the Player's handling of
YouTube's links and captions, and Apple's speech, recognition, translation, and Apple
Intelligence ([`ios.md`](../agents/ios.md), What stays native, and why).

### Speed in an engine without a JIT

After the move, a benchmark that ran the same inputs through the Swift as it was before issue
481 and through the core showed the core slower at six things: linking a sentence it had not
seen (0.94 ms where the Swift took 0.66 ms), a word's furigana the first time (0.10 ms where
it took 0.005 ms), a reading's romaji the first time, the kanji check, a query's
normalization, and looking up an exact form. All but the last came from running in
JavaScriptCore's interpreter, where an app has no JIT. On 2026-10-11 they were taken up one by
one, and each change was first compared with the code it replaced across the data
([`dictionary-core.md`](../agents/dictionary-core.md), Writing for an engine without a JIT, and
The tokenizer).

- **What a view asks is one call.** A flag, a string, or a small model that needs no waiting is
  returned by the call that asks for it. Starting a call object, settling a promise, and reading
  a JSON outcome back cost 8 microseconds a question, more than most of these answers take to
  work out.
- **The core is written for the interpreter.** A check over a string's characters is a regular
  expression or another native call, not a loop; what repeats is remembered (a kanji's reading
  forms, a kana word's romaji in pieces, a form in the other kana); and a cache hit costs one
  lookup.
- **The core tokenizes.** Kuromoji took half of every linked sentence in both the Swift app and
  the core, because kuromoji.js is itself interpreted. The core now has its own tokenizer over
  the same dictionary files, a port of kuromoji.js 0.1.2 that keeps its answers exactly, its
  mistakes included: every token agreed over all 232,774 example sentences, the 655,146
  headwords, readings, and summaries, and 1.7 million random texts. It tokenizes a sentence in
  0.09 ms where kuromoji.js took 0.38 ms, starts in 0.18 s where Kuromoji took 0.5 s, and
  holds no second copy of the word lists as objects. A native Swift tokenizer would be
  faster still, and was not written: it would be the app's alone, and the next client would
  need its own. The website's dictionary service, which ran kuromoji.js too, runs the core's
  tokenizer from the same change on, so there is one tokenizer. kuromoji.js's answers were
  recorded first (`tokenizer.json`), as the Swift's were, and it is no longer bundled.

Measured on 2026-10-11 in optimized builds on a Mac, each number a median of seven rounds,
across four runs of the Swift as it was before issue 481, two of the core as it merged, and
four of the core now, run in turn:

| | Swift | Core, as merged | Core now |
| --- | --- | --- | --- |
| 45 uncached searches | 8.6 s | 5.8 s | 5.5 s |
| 1,000 entries read by ID | 50 ms | 42 ms | 42 ms |
| 200 example sentences linked, first time | 260 ms | 304 ms | 199 ms |
| The same sentences linked again | 118 ms | 19 ms | 17 ms |
| 500 further sentences linked, first time | 330 ms | 471 ms | 250 ms |
| Those sentences again, after 5,000 others | 273 ms | 405 ms | 198 ms |
| 2,000 short glosses | 48 ms | 20 ms | 6 ms |
| 500 queries normalized, first time | 0.8 ms | 4.7 ms | 1.0 ms |
| The same queries again | 0.8 ms | 4.5 ms | 0.07 ms |
| 2,000 readings in romaji, first time | 7.2 ms | 65 ms | 14 ms |
| 2,000 more, their syllables seen before | 7.2 ms | 58 ms | 10 ms |
| The same readings again | 7.0 ms | 0.7 ms | 0.2 ms |
| 200 sentences in romaji, first time | 3.4 ms | 36 ms | 7.1 ms |
| The same sentences again | 3.2 ms | 0.5 ms | 0.2 ms |
| 500 words' furigana, first time | 2.3 ms | 48 ms | 24 ms |
| 500 more words, their kanji seen before | 3.6 ms | 50 ms | 10 ms |
| The same words again | 2.1 ms | 0.3 ms | 0.1 ms |
| 1,024 kanji checks, first time | 0.02 ms | 7.6 ms | 0.85 ms |
| The same checks again | 0.02 ms | 0.2 ms | 0.1 ms |
| 20 exact forms looked up | 8.1 ms | 11.3 ms | 11.4 ms |
| 8 kanji's words | 318 ms | 325 ms | 320 ms |

Starting the tokenizer takes 0.18 s where starting Kuromoji took 0.5 s, and a session of
searches, examples, linked sentences, and kanji pages now ends at 263 MB where the core as
merged ended at 280 MB and the Swift at 308 MB.

What is still slower is each small answer the first time it is asked, by microseconds: a
word's furigana takes 0.02 ms (0.05 ms when its kanji are new) where the Swift took 0.005 ms, a
reading's romaji 0.005 ms to 0.007 ms where Foundation took 0.004 ms, and the kanji check
0.0008 ms where a range comparison took 0.00002 ms. The Swift worked each out again on every
redraw, and read every kanji's readings before the first furigana to do so (177 ms, once a
launch); the core works a kanji's readings out when a word first shows it and remembers every
answer, so from the second time a row is drawn it is about 20 to 30 times faster than the
Swift was. An exact form's lookup, which only the explanation of text in an image asks for,
takes 0.57 ms where it took 0.4 ms: the statement is the same, and its rows cross into the
engine as JSON and are ranked there. Searches written in Japanese are within a millisecond
of the Swift's 40 ms to 50 ms either way, nearly all of it SQLite's scan of the forms; that
scan is now the largest cost of a Japanese search in either implementation, and an index for
it is the next thing to try. No iPhone was measured.
