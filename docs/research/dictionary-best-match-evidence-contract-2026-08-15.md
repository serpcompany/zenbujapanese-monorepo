# Dictionary Best Match evidence contract research

> **Authority status:** The revealed compatibility fixtures came from genuine
> Nihongo 1.34.3 and remain historical evidence. Their current-version parity
> meaning and the resulting implementation handoff are provisional pending
> #168's 1.34.4 replay. See
> [Nihongo reference authority](../clone-discovery/nihongo/REFERENCE-AUTHORITY.md).

Date: 2026-08-15
Issue: [#164](https://github.com/serpcompany/zenbujapanese-monorepo/issues/164)
Status: proposed contract; no production implementation

## Result

Zenbu needs a distinct Dictionary Match and Dictionary Ranking contract. The current lookup query collapses English-gloss and romaji evidence to one minimum tier, while the importer collapses form-scoped JMdict priority evidence to one Boolean and one maximum score. A direction-specific candidate policy that retains every evidence lane and the full normalized priority profile selects the revealed references for [`set`](https://github.com/serpcompany/zenbujapanese-monorepo/issues/156), [`light`](https://github.com/serpcompany/zenbujapanese-monorepo/issues/157), and [`はし`](https://github.com/serpcompany/zenbujapanese-monorepo/issues/161) and preserves six existing lookup fixtures: **9/9 pass** in the deterministic research benchmark.

This is an app-owned compatibility proposal, not recovered Nihongo behavior. The lawful [#149 artifact audit](nihongo-example-retrieval-artifact-audit-2026-08-14.md) found no accessible final query or rank expression in the inspected modules; it did not establish a dictionary-entry frequency-field inventory. No private bytes, schema, query, provider entry/export/result order, database row order, or provider identifier is used for Ranking.

## Primary sources and boundaries

- The pinned [official JMdict English export metadata](../../apps/ios/LanguageData/Sources/JMdict_e-2026-08-10.source.json) identifies the EDRDG [JMdict project](https://www.edrdg.org/jmdict/j_jmdict.html), [official export](https://www.edrdg.org/pub/Nihongo/JMdict_e.gz), DTD revision 1.09, snapshot checksum, and [EDRDG licence](https://www.edrdg.org/edrdg/licence.html).
- The DTD embedded in that official export defines `ke_pri` and `re_pri` as relative-priority evidence associated with particular written forms/readings. It defines `news1/2`, `ichi1/2`, `spec1/2`, `gai1/2`, and `nf01...nf48`; an `nf` number is a 500-word frequency band, with `01` the first band.
- The official [JMdict project format](https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html) says glosses are ordered with the most common first. The [JMdictDB editor help](https://www.edrdg.org/jmwsgi/edhelp.py?svc=jmdict) says entered sense numbers are not significant but senses are renumbered in their displayed occurrence order. The embedded DTD defines multiple senses as distinctly different meanings, `pos` as sense-specific part-of-speech evidence, and `stagk`/`stagr` as restrictions to the lexeme represented by a particular written form or reading. Together these sources support preserving authorial sequence and applicability, but only gloss order has documented commonness semantics; sense order is not claimed as frequency or importance.
- Zenbu's [JMdict importer](../../apps/ios/Tools/import_jmdict.py) currently uses the presence of any priority marker to choose the first prioritized display form, then retains priority only as display-form `is_common` plus an entry-wide maximum `rank_score`. It also joins individual gloss atoms with commas inside each retained sense. The [import manifest](../../apps/ios/LanguageData/Generated/JMdict_e-2026-08-10.import.json) nevertheless describes the raw priority fields as retained source inputs.
- [LookupClient](../../apps/ios/Modules/Sources/SearchExperience/LookupClient.swift) unions romaji-form and English-gloss candidates, then groups each entry with `MIN(match_tier)`. Ranking therefore cannot tell which lane matched or whether two lanes corroborated one entry.
- [ADR 0001](../adr/0001-language-capability-boundaries.md) requires app-owned models with source provenance separate from provider schema. [ADR 0002](../adr/0002-example-sentence-retrieval-contract.md) owns Example Sentence Match/Ranking separately; this work does not alter it.

## Deterministic facts

The pinned export has 218,382 entries. A streaming count found:

| Fact | Count |
|---|---:|
| Entries with priority evidence | 30,151 |
| Written/reading forms with priority evidence | 56,127 |
| Individual priority facts | 119,614 |
| Individual English gloss atoms | 441,826 |
| Senses / part-of-speech facts | 253,020 / 321,141 |
| Sense-form restriction facts / restricted senses | 1,929 / 1,667 |

The exact LFS-restored archive and checksum produced 1,929 `stagk`/`stagr` facts across 1,667 senses. Those directly measured values differ from the earlier review estimate of 1,926/1,664 and are the reproducible authority for this snapshot.

The six revealed competing entries demonstrate the lossy transform:

| Query | Candidate | Raw priority evidence | Current normalized fields | Exact gloss relation |
|---|---|---|---|---|
| `set` | `セット` | `gai1`, `ichi1` | common, 95 | first sense begins `set (` |
| `set` | `課する` | `news1`, `nf14` | common, 90 | sole sense has a later `to set` gloss |
| `light` | `光` | `ichi1`, `news1`, `nf01` | common, 95 | first gloss is exactly `light` |
| `light` | `灯す` | `ichi1` | common, 95 | first gloss begins `to light (` |
| `はし` | `端` | `ichi1`, `news1`, `nf05` on reading `はし` | common, 95 | not applicable |
| `はし` | `箸` | `ichi1`, `news1`, `nf19` on reading `はし` | common, 95 | not applicable |

The raw profile explains `端` over `箸`, but not the complete homograph family: `橋` also has `ichi1`, `news1`, and `nf05` on `はし`. A separate, explicit ambiguity tie-break remains necessary; provider sequence, SQLite row order, and opaque ID order cannot fill that gap.

## Falsified simpler policies

Disposable one-variable probes through the real `LookupClient.live.search` to `primaryEntry` seam rejected these general policies:

- English exactness alone promoted an unmarked loanword for `think`.
- Global noun preference changed `set` to a romaji-prefix noun and regressed `hello`.
- Global sense-count preference changed English results and regressed `think` and `hello`.
- Selected-reading exactness, current commonness, current maximum score, headword length, and POS do not separate `端`, `橋`, and `箸` sufficiently.
- Priority-first ranking promotes incidental high-priority gloss-token occurrences; relation-first ranking promotes unmarked exact-gloss entries. Neither is sufficient alone.

The smallest passing candidate is therefore direction-specific and preserves corroborating evidence instead of reducing it.

## Proposed provider-independent contract

### Typed evidence

A `DictionaryMatch` contains all applicable evidence, never a single minimum tier:

- form evidence: `writtenExact`, `writtenPrefix`, `writtenContains`, `readingExact`, `readingPrefix`, `readingContains`, `romajiExact`, `romajiPrefix`, or `romajiContains`;
- gloss evidence: `exactGloss`, `qualifiedGloss`, `exactInfinitive`, `qualifiedInfinitive`, or `glossToken`, with Canonical Sense and Gloss Order, normalized sense POS, and normalized `stagk`/`stagr` written/reading applicability retained as evidence;
- corroboration: a strong gloss relation plus an exact/prefix romaji relation for the same entry;
- priority evidence: a form-scoped app-owned `LanguageReferencePriorityProfile` containing primary/secondary special, learner-list, news-corpus, and loanword-corpus markers plus an optional news-frequency band. Gloss-only ranking uses the displayed form's profile; it does not merge independently selected written/reading profiles.

These are normalized capability types. Canonical Sense and Gloss Order preserves the source's authorial sense sequence and, within each sense, the sequence of retained English gloss atoms. Earlier JMdict gloss order carries documented editorial commonness; earlier sense order is only a versioned Zenbu structural tie-break. Raw `spec`, `ichi`, `news`, `gai`, and `nf` strings remain adapter inputs and provenance facts, not public ranking vocabulary.

### Eligibility

- ASCII input admits an entry when at least one applicable individual English gloss atom contains the normalized query as a token or a normalized romaji form contains it. A sense restricted by `stagk` or `stagr` supplies gloss evidence only when the actual displayed written/reading pair satisfies the corresponding restriction; an alternate form elsewhere on the entry cannot make the sense applicable. Existing general deinflection runs only when direct strong-gloss and exact/prefix-romaji evidence are absent.
- Japanese input admits an entry when a normalized written or reading form contains the query. Exact/prefix/contains and written/reading remain distinct.
- Empty input remains ineligible. Example Sentence eligibility, source membership alone, provider IDs, and query-specific maps never create a Dictionary Match.

### Ranking v1 candidate

Lower values sort first. English input uses:

1. strong semantic gloss, token-only gloss, then romaji-only evidence;
2. corroborated strong-gloss plus exact/prefix-romaji before one-lane evidence; within the romaji-only lane, exact before prefix before contains;
3. earlier canonical sense order as an explicit Zenbu structural tie-break, not a frequency claim;
4. marked priority profile before entirely unmarked profile;
5. exact gloss, qualified gloss, exact infinitive, then qualified infinitive;
6. normalized priority profile: the existing recognized maximum-marker compatibility groups, a newly explicit weakest categorical group for currently unscored `gai2`, then lower `nf` band and broader primary-marker support;
7. earlier canonical gloss order, which preserves JMdict's documented editorial commonness order;
8. shorter displayed headword; and
9. a SHA-256 fingerprint of canonical, provenance-free lexical content.

Japanese input uses:

1. exact written, exact reading, prefix written, prefix reading, contained written, then contained reading;
2. the matched form's normalized priority profile;
3. greater sense breadth only for an otherwise tied form relation/profile;
4. shorter displayed headword; and
5. the same provenance-free semantic fingerprint.

Sense breadth is deliberately narrow. It is not a frequency claim and is never applied globally or to English ranking. Here it separates `端` from the otherwise tied `橋`; broader homograph review is required before accepting the ADR.

Dictionary Best Matches are the leading presentation group before the total-order-only steps. A downstream route obtains the Primary Dictionary Entry from the first total-ordered member. Entries form one presentation equivalence class only when canonical headword, reading, written/reading forms, meanings, every Dictionary Sense's POS/applicability/order, and every individual gloss atom boundary/order/text are identical. The benchmark verifies that otherwise identical entries with different restrictions or split-versus-joined gloss atoms remain non-equivalent. Retained source provenance may be plural, but it cannot affect visible order. This prohibition covers provider entry sequence, export sequence, query/result order, database row/insertion order, and identifiers—not normalized lexical evidence whose source semantics and adapter contract are explicit.

## Benchmark

The disposable real-seam baseline reproduced the three issue failures and preserved six current fixtures:

| Query group | Current real seam |
|---|---|
| `set`, `light`, `はし` | 3/3 deterministically red |
| `think`, `hello`, `tabeta`, `makasete`, `問題`, `ねこ` | 6/6 green |
| adjacent discovery `食べた` | pre-existing red: `食`, not `食べる` |

The adjacent `食べた` failure is Japanese Text Analysis/deinflection before Dictionary Ranking and is not silently absorbed into this policy.

The committed [benchmark](tools/issue164_dictionary_best_match_benchmark.py) streams the pinned raw priority/gloss facts, joins them to the normalized artifact only in the offline adapter, ranks without provider coordinates, and asserts semantic headword/reading results. A source record coordinate is used solely for the offline source-to-artifact join and is never emitted or compared.

```sh
python3 docs/research/tools/issue164_dictionary_best_match_benchmark.py \
  --database apps/ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3
```

The exact 10,542,518-byte [JMdict archive](../../apps/ios/LanguageData/Sources/JMdict_e-2026-08-10.gz) is committed through Git LFS under the existing [EDRDG attribution](../../apps/ios/LanguageData/Sources/EDRDG-ATTRIBUTION.md). Both tools resolve that stable repository path and enforce the hard-coded SHA-256; the rolling upstream URL is provenance, not restoration. Two complete runs with `PYTHONHASHSEED=1` and `PYTHONHASHSEED=8675309` were byte-identical: benchmark stdout SHA-256 `5bcc57e3da274109d2b13f9a4f9795d3b9a371aedd51e6f22788439bbdc348e6` with `PASS 9/9`, and inventory stdout SHA-256 `a9611ab34c3897beb89a2da1bfbdf947b89ebe0fec955a8787dd6b5195724ca4`. Each tool embeds its expected stdout digest and fails on drift; the inventory also fails unless all 1,929 restriction facts and 1,667 restricted senses are retained. The benchmark additionally asserts that displayed `この間 / このあいだ` excludes the `このかん`-restricted “meanwhile” sense while the displayed `この間 / このかん` pair admits it. The fixture is intentionally revealed regression evidence, not a replacement sealed holdout. Independent review and a broader public homograph set remain gates before production.

## Migration, size, provenance, and failure behavior

Production work should rebuild the complete bundled artifact offline under a new transform and Dictionary Ranking policy version. It should add:

- one form-priority profile row for each tagged normalized written/reading form, retaining reading restrictions needed to validate a displayed written/reading pair;
- one ordered English-gloss atom row for each retained source gloss;
- canonical sense order and within-sense English-gloss order on each retained gloss atom;
- one typed sense-evidence row retaining normalized POS, plus written/reading applicability rows for every normalized `stagk`/`stagr` fact;
- profile/gloss row counts, schema and policy versions, source/importer checksums, and deterministic mapping checksums to metadata; and
- import failures for an unknown priority marker, out-of-range `nf` band, missing source-to-entry mapping, duplicate form profile, lost sense/gloss/restriction evidence, or semantic-fingerprint collision between unequal lexical payloads including sense applicability and gloss-atom boundaries.

The committed [inventory and size probe](tools/issue164_jmdict_inventory.py) verifies the same pinned checksum, streams the complete source, and builds disposable `WITHOUT ROWID` tables:

```sh
python3 docs/research/tools/issue164_jmdict_inventory.py --baseline-bytes 342433792
```

It measured 2,162,688 bytes for 56,127 normalized form profiles, 327,680 bytes for 6,201 normalized reading restrictions, 18,694,144 bytes for 441,826 gloss atoms, 16,543,744 bytes for 253,020 sense/POS rows, and 69,632 bytes for 1,929 sense-form restrictions: 37,797,888 table bytes combined, or 11.04% of the current 342,433,792-byte artifact. Production must measure the integrated database, indexes, package compression, launch query plan, and cold lookup latency before acceptance; this probe is a schema budget, not a shipped-size promise.

The shipped database remains read-only. Snapshot/schema/policy changes replace it atomically in a later app build; there is no first-launch construction or user-data migration. Durable notes continue to use semantic note identity rather than rank position.

A replacement Language Data Source adapter must preserve documented authorial sense sequence, gloss-order semantics, sense POS, and written/reading applicability when they exist. If a source lacks comparable evidence, its adapter exposes those typed fields as unavailable and Dictionary Ranking uses a separately versioned absence rule; it must not fabricate JMdict-like ordinals, POS, or applicability. Import validation rejects a restriction that does not name one of the entry's normalized forms, duplicate evidence keys, lost senses/glosses/restrictions, and count or checksum mismatches. Snapshot or adapter replacement therefore rebuilds artifact metadata/checksums and replays Ranking regressions before acceptance.

JMdict priority and gloss normalization is an additional documented adaptation of the already selected JMdict component. It does not add a Language Data Source, runtime library, or package. Existing EDRDG attribution and CC BY-SA 4.0 treatment remain; the transform description and modification notice must name the new profile/gloss normalization. The SBOM should keep one pinned JMdict data component with its snapshot hash and licence and relate the rebuilt Language Reference Data artifact as generated from it. It must not add Nihongo, DictionaryFramework, FMDB, or another ranking package.

## Domain and decision consequence

The existing glossary defines Example Sentence Match/Ranking but has no dictionary-entry equivalents, and “Best Matches” is a plural presentation group while `primaryEntry` selects one downstream entry. The proposed [CONTEXT additions](../../CONTEXT.md) resolve that ambiguity with Dictionary Match, Dictionary Ranking, Dictionary Best Matches, and Primary Dictionary Entry.

This boundary is hard to reverse after artifact migration, surprising because corroborating lanes must not collapse, and the result chooses among real trade-offs. A proposed [ADR 0003](../adr/0003-dictionary-best-match-contract.md) is therefore warranted. It remains proposed until independent Standards/Spec review accepts the narrow sense-breadth rule, total-order equivalence behavior, integrated size/performance evidence, and the absence of regressions beyond these nine revealed fixtures.
