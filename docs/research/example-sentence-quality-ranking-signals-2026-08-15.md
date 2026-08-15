# Example Sentence quality and Ranking signals

> **Authority status:** The revealed regressions came from genuine Nihongo
> 1.34.3. The negative signal measurements remain reproducible, but their
> current-version parity consequence is provisional pending #168's 1.34.4
> replay. See
> [Nihongo reference authority](../clone-discovery/nihongo/REFERENCE-AUTHORITY.md).

Issue: #163. Parent research: #147. Implementation contract: #151. Revealed regressions: #153–#155.

## Outcome: no safe general signal is currently available

No evaluated public, redistributable signal explains the three revealed direct-English Example Sentence Ranking regressions without damaging the accepted discovery behavior. The official Tatoeba review, tag, list, audio, original/translation, CC0, contributor-language, Japanese-index, creation-date, and modification-date metadata all fix **0/3** revealed rank-1 results. The strongest mature external comparator, `wordfreq` 3.0.2 whole-phrase Zipf frequency, fixes only RH02 and preserves only `30/1,095` frozen v1 positions.

Zenbu should not change Example Sentence Ranking from this evidence. In particular, it should not use source record IDs/order, contributor identity, query-specific maps, or a guessed combination of individually failing signals. A later implementation proposal needs a newly identified provider-independent signal, a versioned app-owned normalization boundary, and a new ADR before a replacement sealed holdout is selected or inspected.

This is a negative research result, not an assertion that the reference has no policy. The accepted evidence establishes that Zenbu does not yet possess the distinguishing signal.

## Scope and evidence boundary

The benchmark used exact `main` `917cbb7153457a79db117b5d536bbf60a7dfe519` and bundled database SHA-256 `248f9308662374c00dc597731ef085ee5ed87d9b703ec356be93ee9be8f03d4f`. Its committed, candidate-restricted snapshot contains exactly `9,479` app-owned pair IDs and no provider coordinates. It replays:

- RH01 `book`, RH02 `notebook`, and RH03 `looked after`, which are revealed regression evidence and no longer blind holdouts;
- all 20 accepted D01–D20 discovery contexts, including both empty contexts;
- all `279` accepted visible reference rows;
- all `7,871` v1 complete-candidate occurrences (`6,439` distinct app-owned pairs); and
- all `1,095` frozen v1 visible positions.

No new private or replacement-holdout context was opened. The report uses only public pair identities already revealed in #147/#152 and app-owned opaque IDs at the Retrieval boundary. Provider coordinates are used only to join the pinned public exports to retained provenance during offline research; they are never proposed as Ranking inputs.

The lawfully accessible #149 evidence remains bounded. It identifies a historical Nihongo 1.33.1 FTS4 Porter index, but found no persisted score or accessible final filter, weight, order, or limit. Its accepted public-safe report explicitly says that default FTS order differs and final Ranking remains undiscovered ([#149 artifact audit](nihongo-example-retrieval-artifact-audit-2026-08-14.md)). No proprietary SQL, encrypted implementation, or private ranking code was accessed for this research.

## Primary-source inventory

Tatoeba publishes the relevant files as weekly exports updated Saturdays at 06:30 UTC. Its own download page defines the detailed-sentence owner/date fields, original/translation base field, tags, user lists and membership, Japanese indices, audio metadata, self-reported language levels, and experimental `-1/0/1` user reviews. It also states that the files are CC BY 2.0 FR, that a subset of sentences is CC0, and that audio licenses are contributor-specific ([Tatoeba downloads](https://tatoeba.org/en/downloads)).

The official export SQL emits `sentences.created` and `sentences.modified` directly, without a link date, fallback, or normalization ([Tatoeba weekly-export SQL](https://github.com/Tatoeba/tatoeba2/blob/0fbb4506ce071827f85375bd4c8c8f9c7cf23d41/docs/database/scripts/weekly_exports.sql#L18-L22)). Both are nullable sentence-row `DATETIME` fields ([Tatoeba sentence schema](https://github.com/Tatoeba/tatoeba2/blob/0fbb4506ce071827f85375bd4c8c8f9c7cf23d41/docs/database/tables/sentences.sql#L4-L25)). Tatoeba attaches CakePHP's timestamp behavior to the sentence table, so `modified` records a sentence-row save, not necessarily a text correction ([Tatoeba sentence model](https://github.com/Tatoeba/tatoeba2/blob/0fbb4506ce071827f85375bd4c8c8f9c7cf23d41/src/Model/Table/SentencesTable.php#L102-L119), [CakePHP timestamp behavior](https://book.cakephp.org/4/en/orm/behaviors/timestamp.html)). The export strings have no timezone marker, and Tatoeba's UTC application default is environment-overridable, so this benchmark preserves and orders the strings without labeling them UTC ([Tatoeba timezone configuration](https://github.com/Tatoeba/tatoeba2/blob/0fbb4506ce071827f85375bd4c8c8f9c7cf23d41/config/app.php#L44-L49)).

The benchmark pins the export generation served with HTTP `Last-Modified: Sat, 08 Aug 2026`, matching the already accepted #140/#147 corpus snapshot:

| Official export | Compressed bytes | SHA-256 |
|---|---:|---|
| `users_sentences.csv` | 98,500,951 | `16338c24cf446b0faea040b2ebbb3c84284a732c91327cc4cfae2c30196e0cf3` |
| `sentences_base.tar.bz2` | 63,527,894 | `08c13e6d94e36fb7f42954bfc32e71f2b6b487c5d08235fc0156531e9b270230` |
| `sentences_in_lists.tar.bz2` | 40,786,007 | `b16e3797a45d799eb5855b40ed393e19935cb119069dc0ddd7cac46513f2a158` |
| `sentences_with_audio.tar.bz2` | 6,374,916 | `7c0835b4b9792fb49843766c41ce457abb42f5fc04cc538e52ee98614d8cd65a` |
| `tags.tar.bz2` | 4,871,147 | `44e07d94ecfb111b01c3633f3c4062207f203602ef7fac551434fe1e5af7afe0` |
| `user_languages.tar.bz2` | 819,603 | `cad063b6b1a0c65175f82e94ff0c648fbd04006100e5c23c85951f68d58a82f9` |
| `user_lists.tar.bz2` | 226,931 | `d3c60721631bf37d0fa00b46c4004ade9d3ae6535e72d8690808d4b4936a48d3` |

The seven additions are `215,107,449` compressed bytes and `32,955,028` rows when extracted. The benchmark also reuses the pinned English/Japanese detailed, CC0, and Japanese-index exports already recorded by #140/#147.

Public lists are user-created collections, not a universal quality taxonomy. The official list UI identifies list 907 as “Proofread Good English Sentences That CK Uses on His Projects,” while also exposing rebalanced, audio, vocabulary-level, subtitle, “to be checked,” and other independently curated lists ([Tatoeba public lists](https://tatoeba.org/en/sentences_lists/index?direction=desc&sort=numberOfSentences)). The benchmark therefore tests explicit list classes independently instead of treating arbitrary list count as an authoritative rating.

## Deterministic differential method

The committed read-only harness reconstructs the exact FTS4 Porter/terminal-boundary/exact-surface red loop for RH01–RH03, reads the committed complete v1 ranks for D01–D20, resolves public observation coordinates through retained database provenance, and applies exactly one normalized signal before the unchanged v1 order. A filter variant is evaluated only where the metadata could plausibly express exclusion. `Policy`, `RankTerm`, and `FilterTerm` records define every direction, missing-value rule, and predicate in executable form.

The committed normalized snapshot contains the `9,479` relevant app-owned pair IDs and only the fields required by these policies. It records the source snapshot, upstream input hashes, normalization meaning for each field, normalized-row hash, and quantized `wordfreq` scores; it contains no provider coordinates, text, contributor names, or private observations. The committed builder validates the production database, four fixtures, 12 exact official export artifacts, `wordfreq==3.0.2`, the English word-frequency asset, archive members, row schemas, candidate count, and normalized-row hash before writing. The benchmark harness separately fails closed unless the database, fixtures, snapshot file, normalized-row hash, row count, unique ID set, ID format, and timestamp format all match their pins.

Every policy is compared using the same measures:

- revealed reference ranks and rank-1 fixes;
- exact same-position agreement over all `279` accepted public rows;
- rank-1 agreement over the `18` non-empty contexts;
- exact observed prefixes over all `20` contexts;
- frozen-v1 same-position and exact-sequence preservation;
- complete-set removal count for filters; and
- per-context candidate/result/reference counts plus reference-prefix, frozen-prefix, and complete-sequence SHA-256 values.

Two complete builder runs were byte-identical and exactly reproduced the committed snapshot. Two complete harness runs were also byte-identical. Builder SHA-256 is `4cb444cb71a3601e282cbe88bb82c93d68f3e71ee8862da8187352698389b814`; harness SHA-256 is `eb4e6ac3881375abe199a009f6fa688a70d5184441f2cbe696a754b97e3a6ca1`; snapshot SHA-256 is `b311fadd833e3d57d9de65e2969f5fd17b4f5f6188634bb299898435016b9920`; normalized rows SHA-256 is `6131e8f29d8b15f90b8be30e8d525299decd857c72a612e4b7224616b63a74d5`; and result SHA-256 is `e7617ba533fab90c1dba0aff2d9013c93bc16ceeb5e2440aee248f674d23ada2`.

```sh
/tmp/issue163-wordfreq-venv/bin/python \
  docs/research/tools/issue163_build_signal_snapshot.py \
  --signal-dir /tmp/issue163-signals.liBJLq \
  --corpus-dir /tmp/issue-140-tatoeba-public \
  --wordfreq-asset \
    /tmp/issue163-wordfreq-venv/lib/python3.10/site-packages/wordfreq/data/large_en.msgpack.gz \
  --output /tmp/issue163-snapshot.json
cmp /tmp/issue163-snapshot.json \
  docs/research/fixtures/example-sentence-quality-signals-issue-163.json

python3 docs/research/tools/issue163_signal_benchmark.py > /tmp/issue163-a.json
python3 docs/research/tools/issue163_signal_benchmark.py > /tmp/issue163-b.json
cmp /tmp/issue163-a.json /tmp/issue163-b.json
cmp /tmp/issue163-a.json \
  docs/research/fixtures/example-sentence-quality-ranking-issue-163-results.json
```

The complete provider exports remain uncommitted. The candidate-restricted normalized snapshot is sufficient to replay every evaluated policy without redistributing the full exports or installing `wordfreq`.

## Revealed-case membership

The official signals describe RH01 in a useful direction but do not select it. RH02 and RH03 largely share the same signal values as their current v1 rank 1, so those signals cannot distinguish the rows.

| Case | Complete candidates | Reference signal difference from current v1 rank 1 | Result |
|---|---:|---|---|
| RH01 `book` | 2,885 | reference has 2 positive reviews, audio, list 907, and 14 list memberships; current has 0 reviews, no audio/list 907, and 2 lists | positive reviews still rank reference 47; list count 50; audio 277; list 907 299 |
| RH02 `notebook` | 80 | both have audio, one positive review, list 907, no negative review/tag, and no CC0; reference has 9 lists versus 5 | review/list-907/audio tie classes do not distinguish; `wordfreq` alone places reference first |
| RH03 `looked after` | 130 | both have audio, one positive review, list 907, no negative review/tag, and no CC0; current has 10 lists versus reference 6 | review/list-907/audio tie classes do not distinguish; list count prefers the wrong row |

The earlier Japanese-index supplement is also decisive: RH01 reference is outside `jpn_indices`, so membership cannot be a universal eligibility filter; membership-first fixed `0/3` and preserved only `14/1,095` frozen positions.

## Coverage

Coverage is measured on the complete D01–D20 candidate occurrences and distinct app-owned pairs, not just the visible top 100.

| Signal | Candidate occurrences | Distinct pairs | Interpretation |
|---|---:|---:|---|
| any user review | 5,232/7,871 | 4,216/6,439 | broad, but Tatoeba labels reviews experimental |
| positive review | 5,175/7,871 | 4,168/6,439 | broad enough to reorder heavily; not selective enough |
| pair row-update proxy | 5,155/7,871 | 4,051/6,439 | nullable sentence-row save metadata; not pair/link age |
| negative review | 45/7,871 | 35/6,439 | useful exclusion candidate, but fixes no revealed rank |
| list 907 | 4,581/7,871 | 3,685/6,439 | broad curated subset; not a final order |
| any audio | 4,121/7,871 | 3,260/6,439 | moderate coverage; licenses apply to audio bytes, which Zenbu does not need |
| Japanese sentence in `jpn_indices` | 4,056/7,871 | 3,486/6,439 | lexical annotation membership; not a pair-quality rating |
| owner skill known for both sides | 3,879/7,871 | 3,035/6,439 | self-reported, contributor-linked, and incomplete |
| pair creation proxy | 3,452/7,871 | 2,653/6,439 | maximum of both valid sentence creation values; not link age |
| either sentence marked original | 2,423/7,871 | 1,878/6,439 | provenance class, not quality |
| “GoodExample” public list | 1,281/7,871 | 1,036/6,439 | independent user curation; no revealed fix |
| NGSL level-1 list | 486/7,871 | 380/6,439 | learning-vocabulary subset; no revealed fix |
| positive tag | 113/7,871 | 89/6,439 | sparse and user-defined |
| CC0 on either side | 72/7,871 | 41/6,439 | license class, not quality; no pair has both sides CC0 |
| both sentences marked original | 57/7,871 | 49/6,439 | too sparse and semantically unrelated to quality |
| negative tag | 13/7,871 | 9/6,439 | too sparse to explain the ordering |

## Ranking and filter matrix

Ranks are RH01/RH02/RH03. “Positions” means exact same-position agreement with all 279 public discovery rows. Frozen preservation uses all 1,095 visible v1 rows.

| One-signal policy | Revealed ranks | Fixes | Positions | Top 1 | Frozen positions | Set loss |
|---|---:|---:|---:|---:|---:|---:|
| v1 control | 432/10/5 | 0/3 | 11/279 | 7/18 | 1,095/1,095 | 0 |
| positive-review count first | 47/15/14 | 0/3 | 9/279 | 2/18 | 8/1,095 | 0 |
| review score first | 47/15/14 | 0/3 | 9/279 | 2/18 | 8/1,095 | 0 |
| negative review last | 428/10/5 | 0/3 | 11/279 | 7/18 | 995/1,095 | 0 |
| filter negative reviews | 428/10/5 | 0/3 | 11/279 | 7/18 | 995/1,095 | 45 |
| positive tag first | 443/10/5 | 0/3 | 10/279 | 7/18 | 95/1,095 | 0 |
| negative tag last | 431/10/5 | 0/3 | 11/279 | 7/18 | 1,005/1,095 | 0 |
| list 907 first | 299/7/5 | 0/3 | 8/279 | 3/18 | 13/1,095 | 0 |
| filter to list 907 | 299/7/5 | 0/3 | 7/279 | 3/18 | 6/1,095 | 3,290 |
| public-list count first | 50/16/52 | 0/3 | 8/279 | 3/18 | 13/1,095 | 0 |
| NGSL level-1 list first | 74/10/12 | 0/3 | 11/279 | 7/18 | 498/1,095 | 0 |
| “GoodExample” list first | 789/27/24 | 0/3 | 8/279 | 2/18 | 7/1,095 | 0 |
| negative/filter-out lists last | 322/8/5 | 0/3 | **13/279** | 5/18 | 36/1,095 | 0 |
| OGTE level first | 1,005/3/11 | 0/3 | 7/279 | 3/18 | 40/1,095 | 0 |
| audio first | 277/6/3 | 0/3 | 7/279 | 4/18 | 25/1,095 | 0 |
| both original first | 438/11/5 | 0/3 | 10/279 | 7/18 | 372/1,095 | 0 |
| either original first | 781/22/12 | 0/3 | 9/279 | 5/18 | 37/1,095 | 0 |
| both CC0 first | 432/10/5 | 0/3 | 11/279 | 7/18 | 1,095/1,095 | 0 |
| owner language-skill first | 1,339/40/34 | 0/3 | 9/279 | 4/18 | 28/1,095 | 0 |
| `jpn_indices` membership first | 2,113/6/4 | 0/3 | 12/279 | 3/18 | 14/1,095 | 0 |
| filter to `jpn_indices` membership | filtered/6/4 | 0/3 | 10/279 | 2/18 | 8/1,095 | 3,815 |
| `wordfreq` whole-phrase Zipf first | 1,088/**1**/37 | 1/3 | 11/279 | 4/18 | 30/1,095 | 0 |
| pair creation proxy, oldest first | 1,027/28/17 | 0/3 | 9/279 | 2/18 | 22/1,095 | 0 |
| pair creation proxy, newest first | 1,027/28/17 | 0/3 | **13/279** | 6/18 | 27/1,095 | 0 |
| pair row-update proxy, oldest first | 100/49/3 | 0/3 | 5/279 | 2/18 | 17/1,095 | 0 |
| pair row-update proxy, newest first | 1,456/49/47 | 0/3 | 10/279 | 6/18 | 17/1,095 | 0 |

The largest public-position improvements are negative-list-last and pair-creation-newest-first (`13/279` versus `11/279`), but both fix no revealed context and cause broad unexplained churn. The date policy preserves only `27/1,095` frozen positions. Neither is evidence for adoption.

## Candidate disposition

### Tatoeba reviews, tags, and lists: reject for Ranking v2

Reviews are the most direct official quality field, but Tatoeba itself calls the export experimental and defines only per-user OK/unsure/not-OK values ([Tatoeba downloads](https://tatoeba.org/en/downloads)). Positive-count and net-score order fix none of the regressions and destroy discovery/frozen agreement. Negative-review exclusion has a defensible meaning, but its 45 removals fix no revealed rank; it may be reconsidered as an independently justified corpus-quality gate, not as the answer to #153–#155.

Tags and lists are useful annotations, but their names and owners show heterogeneous purposes. List 907 is genuine public curation; it is not selective enough to rank RH02/RH03, and filtering to it removes 3,290 of 7,871 candidate occurrences. Treating arbitrary list count as popularity is worse: list construction and bulk-generated collections dominate that count.

### Creation and modification dates: reject as age/quality proxies

The benchmark tests four bounded sensitivity arms inside the unchanged v1-eligible candidate sets. `pair_created_at` is the later of the two sentence creation strings when both are valid: it is a lower-bound proxy for when both sentence rows existed, not when their translation link was created. `pair_modified_at` is likewise the later row-update string, not a text-quality or link-age value. Missing, `\\N`, all-zero, and malformed values are normalized to missing and sort last; ties retain v1 order.

Creation is known for only `3,452/7,871` discovery occurrences, while row-update time is known for `5,155/7,871`. Oldest/newest creation and row-update ordering each fix `0/3`. Creation-newest reaches `13/279` public positions but preserves only `27/1,095` frozen positions; the other three preserve `17–22/1,095`. The timestamps therefore neither explain the reference nor justify the churn.

### Audio, original/translation, CC0, and contributor skill: reject as quality proxies

Audio presence indicates that somebody recorded a sentence, not that the Japanese-English pair is the best pedagogical match. The official export also attaches a contributor-selected license to each audio object and forbids reuse when that field is empty ([Tatoeba downloads](https://tatoeba.org/en/downloads)). Zenbu would need only a derived membership bit, but even that fixes no regression and causes large churn.

Original/translation and CC0 are provenance/license properties, not relevance or quality. Self-reported contributor skill is incomplete, personally linked, and fixes no regression. None should be converted into an opaque “quality score.”

### `wordfreq` 3.0.2: mature comparator, reject for this contract

`wordfreq` is established Language Technology for word-frequency estimates. Its documented `zipf_frequency` uses a logarithmic scale; for multi-token text it combines token frequencies with a half-harmonic mean and warns that uncommon combinations may be greatly overestimated ([wordfreq v3.0.2 README](https://github.com/rspeer/wordfreq/blob/v3.0.2/README.md)). That warning applies directly to treating a complete sentence as one phrase score.

The pinned experiment used `wordfreq==3.0.2`, the last tagged GitHub release, and the English large wordlist (`1,494,836` compressed bytes; SHA-256 `dffae8066b78dce0a6667cf5f58e567054f902674667090a7ac8a8a44628b05c`). The isolated Python environment was about 83 MiB because it also installed `ftfy`, `langcodes`, `msgpack`, `regex`, and `wcwidth`. The official project documents a Python package and no native Swift/iOS target; product use would require a reviewed port or an app-owned derived artifact.

That integration is also non-trivial legally. The pinned 3.0.2 README licenses the code under MIT, the included data under CC BY-SA 4.0, and enumerates additional attribution conditions for its constituent sources ([wordfreq v3.0.2 license and sources](https://github.com/rspeer/wordfreq/blob/v3.0.2/README.md#license)). Its maintainer also states that the frequency data is frozen around 2021 and will not be updated ([wordfreq maintenance note](https://github.com/rspeer/wordfreq/blob/master/SUNSET.md)). An SBOM would therefore need the exact port, data snapshot, MIT notice, data license/share-alike analysis, constituent-source attributions, and every runtime dependency.

Those costs might be warranted if behavior were strong. It is not: the comparator fixes only RH02, leaves discovery positions at `11/279`, lowers top-1 agreement to `4/18`, and preserves only `30/1,095` frozen positions. It is rejected before any iOS port or product dependency is proposed.

## Licensing, attribution, maintenance, and offline integration

No candidate is selected, so this issue adds no SBOM component or app notice. If later evidence supports a Tatoeba metadata signal, provider sentence/list/user IDs must remain offline-import provenance only. Runtime Ranking must consume app-owned pair identity and a typed, normalized value. The importer must collision-check pairs, reject missing or malformed metadata deterministically, and record coverage. The bundled database must record signal version, source hashes, normalized row count, and importer hash; release validation must replay complete-set ranks and fail closed on mismatch.

For Tatoeba data, the notices plan must preserve Tatoeba attribution and the applicable CC BY 2.0 FR terms; the existing corpus attribution cannot silently be assumed to cover a newly bundled metadata export. CC0 membership must remain a per-sentence license fact, not a replacement license for the pair. Audio bytes must remain excluded unless each recording's separate license and attribution are accepted. The [official Tatoeba download page](https://tatoeba.org/en/downloads) is the primary authority for those distinctions.

Weekly source churn is material. Reviews, list memberships, list meanings, tags, and contributor skill can all change each Saturday. Any future accepted signal must pin one complete weekly snapshot, normalize it offline, measure rank churn before updating, and never fetch it at app runtime. That preserves deterministic offline iOS behavior and avoids a network/privacy dependency.

## Decision and next research gate

1. Keep `ExampleSentenceRetrievalPolicy/v1` frozen. Do not implement a v2 from #163.
2. Keep #153–#155 open as revealed regressions. Their current blocker is a missing general selection signal, not missing corpus rows or missing official Tatoeba exports.
3. Do not combine failing signals or fit weights to three revealed rows. A weighted blend would be a new hand-built commonness model and query-led tuning.
4. Do not inspect or select a replacement sealed holdout yet. First identify a signal with an independently specified meaning and freeze its policy using public discovery evidence.
5. If a new authoritative source emerges, require primary-source license/maintenance evidence, a pinned artifact hash, app-owned normalization, complete-set replay, size/runtime measurement, SBOM/notices review, and a new ADR before implementation.

The present finish line is therefore: **no safe signal currently available**.
