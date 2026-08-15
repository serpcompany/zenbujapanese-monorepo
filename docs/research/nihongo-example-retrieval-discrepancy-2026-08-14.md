# `scared you` / `startled you` retrieval discrepancy

> **Authority status:** This is genuine Nihongo 1.34.3 historical evidence,
> not current 1.34.4 acceptance. Its current-version behavior must be replayed
> under #168. See
> [Nihongo reference authority](../clone-discovery/nihongo/REFERENCE-AUTHORITY.md).

Issue: #148. Parent research: #147. This is an evidence-only record; it does not select or implement an Example Sentence Retrieval technology.

## Boundaries and environments

- Nihongo was inspected only through the accepted iPhone 17 Pro Max reference. CoreDevice independently reported Nihongo `1.34.3` (`9792`), bundle `com.serpentisei.studyjapanese`, on iOS `26.6` (`23G71`). Device identifiers remain in local private evidence only.
- Zenbu was built from exact commit `140b194b2f70458886b2f5569ceb41957e62448f` and run on the `Zenbu Issue 141 iPhone 16e` simulator, iOS `26.0.1`. Its bundle identifier was `com.zenbujapanese.dictionary`. This baseline did not emit `CFBundleShortVersionString` or `CFBundleVersion`, so the commit is the version authority.
- Zenbu executable SHA-256: `1e309599bf4677b90dcb874713e5fdb45e7480b56508725f334ab9b8d33fecb9`.
- Zenbu corpus SHA-256: `c5076ad2ae06ba4ca0c2976a00dfaad06af827d6ef0aac0424158d0b4dbe3cac`.
- Zenbu retrieval source SHA-256: `a281e45959f4fed52a139d61db10708d4966679e0ab4db36db092dfa5348b060`.
- Captures were made from 2026-08-14T12:21:34Z through 2026-08-14T12:29:55Z. The 18 issue/probe screenshots, one search-root baseline, and private CoreDevice metadata are retained outside git under `/Users/devin/dev/private-evidence/zenbujapanese/issue-148/`. The directory is mode `0700`; every evidence file and its local checksum manifest is mode `0600`.

Search results and Example Sentence rows are recorded separately below. A dictionary result count excludes the Example Sentence affordance.

## Reported exact queries: Search results

| Query | App | Ordered dictionary Search results | Example Sentence affordance |
|---|---|---|---|
| `scared you` | Nihongo | none | View 4 Example Sentences |
| `scared you` | Zenbu | none | View 1 Example Sentence |
| `startled you` | Nihongo | none | none |
| `startled you` | Zenbu | none; explicit accessible `No dictionary matches` state | none |

No dictionary Search-result presence or ordering discrepancy was observed for either exact query. The current `startled you` report did not reproduce: both apps had zero dictionary results and zero Example Sentence rows.

## Reported exact queries: ordered Example Sentence rows

### `scared you`

| Nihongo rank | Zenbu rank | Public Tatoeba pair IDs (Japanese:English) | Japanese | English | Relation to query | Classification |
|---:|---:|---|---|---|---|---|
| 1 | 1 | `108058:295628` | 彼は君に撃たれるのではないかとびくびくしていた。 | He was scared you would shoot him. | exact English phrase | shared eligible row; same rank |
| 2 | — | `12574578:12373614` | ごめん！怖がらせるつもりはなかったんだ。 | Sorry! I didn't mean to scare you. | `scare`/`scared` inflection relation plus exact `you` | missing Zenbu eligibility |
| 3 | — | `2409471:2396319` | ごめんね、怖がらせるつもりはなかったんだ。 | Sorry, I didn't mean to scare you. | `scare`/`scared` inflection relation plus exact `you` | missing Zenbu eligibility |
| 4 | — | `472836:473875` | もし私が君をこわがらせたいと思ってたら、数週間前に見た夢のことを話してたよ。 | If I wanted to scare you, I would have told you about what I dreamt about a few weeks ago. | `scare`/`scared` inflection relation plus exact `you` | missing Zenbu eligibility |

All four exact Nihongo pairs already exist in the Zenbu Example Sentence Corpus. Corpus membership and English-link availability therefore do not explain the three omissions. This is an Example Sentence Match eligibility discrepancy. The shared exact-surface row is rank 1 in both apps, so no independent rank discrepancy is observable among shared rows for this query.

### `startled you`

Both ordered lists are empty. There is no current eligibility, ranking, duplicate, or English-link discrepancy to classify for this exact query. This zero-row observation is retained as a frozen control instead of being rewritten into a bug claim.

Across the two reported exact queries, **4/4 unique visible Nihongo pairs** were traced to public Tatoeba IDs; all four came from `scared you`, because `startled you` was empty. Across the reported queries and all discriminating probes, **7/7 unique visible Nihongo pairs** were traced.

## Discriminating probes

The committed fixture is [`fixtures/example-sentence-retrieval-issue-148.tsv`](fixtures/example-sentence-retrieval-issue-148.tsv).

| Query | Nihongo | Zenbu | What it distinguishes |
|---|---|---|---|
| `scare you` | 4 rows: `12574578:12373614`, `2409471:2396319`, `472836:473875`, `108058:295628` | 4 rows: `12574578:12373614`, `12003639:5992837`, `2409471:2396319`, `472836:473875` | Nihongo moves the exact `scare you` forms ahead of the `scared you` row. Zenbu admits a different literal row and omits the inflected row. This falsifies corpus-order parity and simple identical set selection. |
| `red you` | 0 rows | 20 rows | Zenbu's current substring predicate admits fragments inside `appeared young`, `long-haired youth`, `ordered you`, `prepared your`, `scared you`, and other unrelated text. This is a direct substring-only false-positive control. |
| `startle you` | one dictionary result and one example `1804152:1804150` | the same dictionary result and the same example | A nearby query can reach the expected public pair without hard-coding `scared you`. It also proves the corpus contains the relevant `startle you` row. |
| `startled me` | 2 rows: `180017:18876`, `201898:39109` | the same 2 rows in the same order | The inflected word and a changed pronoun work when those exact phrases exist. This controls for a blanket inability to search `startled` phrases. |

The shared `startle you` dictionary Search result was `落ち武者は薄の穂に怖ず` (`おちむしゃはすすきのほにおず`), glossed “when you are in a state of fear, the smallest thing will startle you; a fleeing soldier takes fright even from a head of silver grass.” It appeared as the sole Best Match in both apps.

## Evidence-bounded conclusion

The current Zenbu implementation uses normalized literal substrings for direct English Example Sentence retrieval and orders eligible rows by Japanese sentence length then record ID. The observations prove that this public behavior is not compatible with Nihongo for these probes:

1. Nihongo admits `scare you` rows for the query `scared you`; Zenbu does not.
2. Nihongo changes the order between `scared you` and `scare you` so exact inflection/phrase rows lead.
3. Nihongo rejects `red you`; Zenbu returns 20 substring-only false positives.

The observations do **not** identify Nihongo's private tokenizer, lemmatizer, index, database query, or library. They support an observable retrieval contract for #147 and a benchmark for established Language Technology; they do not justify hand-written parsing or a claim that any candidate technology is identical to Nihongo's implementation.

## Private evidence hashes

| Capture | Captured at (UTC) | SHA-256 |
|---|---|---|
| `nihongo-scared-you-search.png` | 2026-08-14T12:21:34Z | `dd1909720910b1f86ef19f05a8f86884cf2b93356808dec0ce1a59c6614ad031` |
| `nihongo-scared-you-examples.png` | 2026-08-14T12:21:44Z | `db8ddaa013933af200e60f5bd321b18fc5e6c4956f1a06641027ff9b7d210f5d` |
| `nihongo-startled-you-search.png` | 2026-08-14T12:24:18Z | `ae8b86e9bdef3b674ca5057e112222ef14c1cc96bde66824dcaf0982beb38191` |
| `nihongo-scare-you-search.png` | 2026-08-14T12:24:44Z | `0ba5894ca0638d0eb7a859e6eaeb0f7ee2af232218abc04f1df643bd84f268a9` |
| `nihongo-scare-you-examples.png` | 2026-08-14T12:24:46Z | `a8d7bf095bd9f479fe2ff2eda9d010980bd673d3e459f1c60c56ebeaf4b39607` |
| `nihongo-red-you-search.png` | 2026-08-14T12:25:28Z | `7ef206181412f0373dc819999ebcf94b99713bddd6eb9dfb8aff45440440802e` |
| `nihongo-startle-you-search.png` | 2026-08-14T12:25:42Z | `b1bd13628368547394b18e52333ee11d930b4dd0d867ca1add18b550b6be8163` |
| `nihongo-startle-you-examples.png` | 2026-08-14T12:25:51Z | `b6bddda5557ae3a235e18bfe8d59db7f7b173948051c29fe6d8d191561dd90bc` |
| `nihongo-startled-me-search.png` | 2026-08-14T12:27:02Z | `9584b295871ba5435bbdce7bcbabf3d257b6e8bc04dea6a0a81b2700617bc8b7` |
| `nihongo-startled-me-examples.png` | 2026-08-14T12:27:12Z | `a41ec64c63cfe51052c383b0f4956efb32c4344d116222add9e7aa8eb10f3718` |
| `zenbu-startled-you-search.png` | 2026-08-14T12:28:45Z | `0a5eb988a545780c2b83650d04ede44e84f42a5fff8b75f53bac32474353bf54` |
| `zenbu-scared-you-search.png` | 2026-08-14T12:29:00Z | `e4038620a1870bb1082a17afee513d1f1a87340a7c056a83657d0de3aaa17a1a` |
| `zenbu-scared-you-examples.png` | 2026-08-14T12:29:03Z | `d2cececa9cc032b0c33ae98b8a0748e0dad855f3b2dba8b16b3891a31e716695` |
| `zenbu-scare-you-search.png` | 2026-08-14T12:29:13Z | `edef5b3a4b27e6485a7041d9fead8e43dcb887a7e7d8cb74dbad286601b17495` |
| `zenbu-scare-you-examples.png` | 2026-08-14T12:29:23Z | `8ffc7fdd8d57eacba7c7290e0eed60e243aacf571df62a881cb40064db5f5002` |
| `zenbu-startle-you-search.png` | 2026-08-14T12:29:33Z | `3dceae9bde7ae587d45945adf80fd7798be4cd7bc77db1a102441ab06ca02392` |
| `zenbu-red-you-search.png` | 2026-08-14T12:29:43Z | `e3e65452651fc5b5c72b5a4bc8d80eb9f17e03b9c57193ea32c1db81a1c00288` |
| `zenbu-startled-me-search.png` | 2026-08-14T12:29:55Z | `3fdb0fc909f2ad67dce07599866cbb803e562742a53ecd6fcc37ca1d3603f198` |

CoreDevice metadata and the screenshot files are retained in the durable local-only evidence directory above and verified by its local `CHECKSUMS.sha256` manifest. No private screenshot, device identifier, UI asset, app binary, or container is committed.
