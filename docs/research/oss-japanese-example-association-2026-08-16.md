# OSS Japanese dictionary-entry and Example Sentence association

Date: 2026-08-16

Issue: [#169](https://github.com/serpcompany/zenbujapanese-monorepo/issues/169)

Fixed product point: `1dabb8a2051dd74df9dc23c4526c56c534c7f14d`

## Outcome

Zenbu should not replace one guessed matching rule with another. The strongest new open-source input is the official **JMdict-with-examples** feed, `JMdict_e_examp`: its examples are attached to a particular JMdict entry and sense. This is direct source-declared association evidence, not a tokenizer inference.

On the exact 2026-08-10 snapshot aligned with Zenbu's pinned JMdict date, the normalized feed contains 32,083 entry/sense-to-example occurrences. Exact Japanese-English pair comparison finds 31,371 of those associations in Zenbu's current Example Sentence Corpus, covering 25,496 distinct app-owned corpus pairs, 28,334 JMdict entries, and 30,983 senses. This is a useful high-confidence association layer, although it covers only about 11% of Zenbu's 232,703 corpus pairs and does not include the public top-20 `食べる` or `猫` entry probes.

For the uncovered corpus, the accepted #165 choice remains sound: use pinned Sudachi.rs plus SudachiDict-small only at build time to generate candidates, then admit an association only when JMdict written-form, reading-form, POS, and sense-applicability evidence identify one entry. The mature Japanese-learning projects 10ten and Yomitan are valuable differential references for deinflection coverage, but their rules generate candidates rather than resolve ambiguous entry identity. Both deliberately propose the verb for the three disclosed `始め`/`はじめ` commands that #165 found ambiguous; neither supplies the missing contextual proof.

The recommended proof of concept is therefore layered:

1. import source-declared JMdict example-to-sense associations;
2. retain official Tatoeba Japanese-index annotations as separate, lower-coverage source evidence;
3. use Sudachi only to generate associations for the remaining unambiguous occurrences;
4. fail closed or route to versioned human review when several JMdict entries remain plausible; and
5. keep Example Sentence Ranking app-owned and independent of all four association-evidence lanes.

No production, ADR, device, holdout, or release state changed in this research.

## Capability boundary

The projects below solve different problems. Treating them as interchangeable caused the earlier confusion.

| Capability | Required output | What is not enough |
|---|---|---|
| Japanese tokenization and lemmatization | occurrence range, surface, dictionary/normalized form, reading, POS | token boundaries alone |
| Deinflection | one or more dictionary-form candidates plus grammatical reason and required POS | a suffix rewrite without dictionary validation |
| Dictionary-entry association | one app-owned `LanguageReferenceID` supported by written form, reading, POS, and sense applicability, or an explicit ambiguity result | a lemma string that belongs to several entries |
| Source-declared example association | a source-backed entry/sense-to-example relation normalized to app-owned IDs | source membership or a Tatoeba coordinate alone |
| Ranking | a deterministic ordering of eligible app-owned Example Sentence Matches | analyzer order, source order, dictionary row order, or provider ID |

This follows the vocabulary in `CONTEXT.md`: Language Technology may analyze text, while Example Sentence Retrieval owns Match and Ranking. It also exposes a required ADR review. ADR 0002 currently permits only form-derived dictionary-entry association and forbids provider coordinates as joins. A proof of concept may retain a Tatoeba/JMdict coordinate as provenance, but production adoption of source-declared sense associations needs an ADR amendment defining how the declared relation becomes app-owned evidence. The runtime table must join only app-owned pair and Language Reference IDs.

## Ranked shortlist

### 1. Official `JMdict_e_examp`: select for the first proof-of-concept lane

EDRDG publishes a JMdict variant whose examples occur at the end of the relevant sense. The official project discussion shows the XML structure and identifies the examples as a regularly generated optional JMdict release ([EDRDG example-sentence announcement](https://www.edrdg.org/jmdict_edict_list/2021/msg00042.html)). This is the only evaluated candidate that directly supplies entry identity, sense identity, Japanese example text, English example text, and source provenance in one maintained source.

The reproducible research input was the `scriptin/jmdict-simplified` release `3.6.2+20260810124713`, which converts the official 2026-08-10 `JMdict_e_examp` XML without inventing associations. The release records 218,382 JMdict entries, a 71,818,899-byte source XML, and weekly automated publication ([exact release](https://github.com/scriptin/jmdict-simplified/releases/tag/3.6.2%2B20260810124713)). Its 14,095,228-byte `jmdict-examples-eng` tarball has SHA-256 `78a72aa519478d00cbe89d8c3fd73c2a93a0db68ed42d5c97ba5b2ade29a23c9`; the extracted JSON is 128,942,673 bytes. The converter pins the decompressed official XML SHA-256 as `9077fa49a99444c742d19ad802d3159a601f644e8e379110d5c371b58fe1bd451` ([pinned upstream checksum](https://github.com/scriptin/jmdict-simplified/blob/0ab1bcf/checksums/JMdict_e_examp.xml.sha256)).

Measured normalized inventory:

| Measure | Count |
|---|---:|
| JMdict entries | 218,382 |
| entries with at least one example | 28,915 |
| senses with at least one example | 31,678 |
| entry/sense-to-example occurrences | 32,083 |
| distinct Tatoeba Japanese sentence IDs | 26,076 |
| exact occurrences present in Zenbu's corpus | 31,371 |
| distinct Zenbu corpus pairs covered | 25,496 / 232,703 |
| distinct JMdict entries represented in matched occurrences | 28,334 |
| distinct JMdict senses represented in matched occurrences | 30,983 |

The source is high-confidence but intentionally selective. Public fixture membership is D18 `1/20`, D19 `2/20`, D20 `4/9`, D21 `0/20`, and D22 `2/20`; the D22 rows belong to examples elsewhere in JMdict, not to the target `猫` entry. Target-entry coverage is therefore D21 `食べる` `0/20` and D22 `猫` `0/20`. The feed also contains three different examples for `始める` and three for noun `始め`, but none of the three disclosed ambiguous RH09 commands. It improves trustworthy coverage; it does not replace the general association builder.

The clean product boundary is to parse the official XML in Zenbu's existing deterministic importer rather than ship the third-party JSON converter or its 129 MB extracted file. Map JMdict `ent_seq` to the already normalized `entries.source_record_id`, map the exact Japanese-English pair to one app-owned corpus pair, validate that the declared example surface occurs in the Japanese sentence, then emit a compact association row containing app-owned IDs, sense order, evidence kind, and provenance digest. Provider coordinates stay on the provenance side and are not runtime keys.

EDRDG distributes JMdict under CC BY-SA 4.0, requires attribution and regular updates, and explicitly permits commercial software without requiring that software to become open source ([EDRDG license and attribution](https://www.edrdg.org/edrdg/licence.html)). The sentence text retains Tatoeba's CC BY 2.0 FR treatment already used by Zenbu. Adoption needs a source inventory entry, source and output hashes, EDRDG/Tatoeba notices, a documented at-least-monthly source-update procedure, and an SBOM/data-provenance relationship. No new iOS runtime library is required.

### 2. Sudachi.rs plus SudachiDict-small: retain for uncovered candidate generation

Accepted #165 already established the relevant qualities. Sudachi.rs exposes surface, dictionary form, normalized form, reading, POS, and multiple segmentation modes; its official Rust implementation and dictionary are Apache-2.0 ([Sudachi.rs `v0.6.11`](https://github.com/WorksApplications/sudachi.rs/tree/v0.6.11), [SudachiDict `v20260723`](https://github.com/WorksApplications/SudachiDict/releases/tag/v20260723), [dictionary legal notices](https://github.com/WorksApplications/SudachiDict/blob/v20260723/LEGAL)). The exact version compiled for arm64 iOS, but the selected boundary runs only in the importer. The 41,770,618-byte small-dictionary wheel expands to a 122,953,610-byte `system.dic`; neither should ship in the app.

Sudachi covered D21 dictionary forms `20/20` and RH09 `17/20` in #165. Its important limitation is unchanged: it classifies the three short `始め`/`はじめ` commands as noun occurrences, while JMdict contains distinct noun and verb entries. Sudachi is good Language Technology but does not itself create an Example Sentence Match. Zenbu still owns:

- mapping analyzer forms/readings/POS to JMdict written/reading pairs;
- applying `stagk`/`stagr` sense restrictions and displayed-pair applicability;
- rejecting homographs and conflicting candidates;
- merging source-declared and analyzer-derived evidence; and
- Ranking eligible matches.

### 3. Official Tatoeba Japanese indices: retain as supplemental declared evidence

Tatoeba's `jpn_indices` export carries Tanaka/WWWJDIC-style word annotations separately from sentence and translation rows. The annotations can include dictionary form, reading, surface form, sense number, and a checked marker. Tatoeba publishes the export and its CC BY 2.0 FR terms through its official download surface ([Tatoeba downloads](https://tatoeba.org/en/downloads)); the small MIT parser `tatoeba-json` documents the decoded fields and weekly build in executable form ([parser repository](https://github.com/mwhirls/tatoeba-json)).

This is genuine source association evidence, not analyzer inference, but #165 measured only `49/89` coverage over D18-D22: D18 `19/20`, D19 `18/20`, D20 `7/9`, D21 `0/20`, and D22 `5/20`. RH09 coverage was `10/20`. Headword plus optional reading/sense must still resolve unambiguously to one JMdict entry, and a checked marker is not universal. Use these annotations as a separate evidence lane; never filter the corpus to indexed rows or treat export order as Ranking.

The pinned 2026-08-08 archive measured 2,859,638 compressed bytes and 17,427,725 extracted bytes. Because Zenbu already imports the Tatoeba corpus, this adds build-time parsing and compact derived rows rather than an iOS runtime dependency.

### 4. 10ten Japanese Reader: use as a deinflection oracle, not production code yet

10ten is a mature Japanese-learning reader with more than 5,000 commits and current releases. It explicitly advertises irregular, colloquial, contracted, honorific, causative, passive, and other inflection handling ([10ten project and supported forms](https://github.com/birchill/10ten-ja-reader/tree/v1.27.2)). Exact release `v1.27.2` (`b9565acfbc9c24a6f83a979e6c3c9207758063b0`, 2026-05-08) contains 242 typed deinflection rules in a 30,970-byte TypeScript module ([deinflector](https://github.com/birchill/10ten-ja-reader/blob/v1.27.2/src/background/deinflect.ts)). Its word-search pipeline looks up every generated form in the dictionary and rejects deinflections whose required verb/adjective type does not match the JMdict entry ([dictionary validation](https://github.com/birchill/10ten-ja-reader/blob/v1.27.2/src/background/word-search.ts)).

The exact checkout's deinflection and word-search suites passed `32/32` tests in 705 ms after a frozen `pnpm` install. A public fixture sweep proposed a `食べる` candidate for D21 `20/20`. It also proposed `始める`/`はじめる` for all three disclosed ambiguous RH09 commands. That is correct candidate generation but insufficient association: the same surface also has a valid noun entry, and 10ten's lookup UI may show multiple dictionary results rather than prove which entry the sentence uses.

10ten is GPL-3.0 and packaged as a browser extension, not a small Swift or Rust library. Copying its rules or linking a port into Zenbu requires a legal and architecture decision. A separate build-time comparison executable is feasible and would add zero intended iOS runtime bytes, but the exact tool, source offer/distribution obligations, dependency lock, notices, and SBOM relationship would still need review. For the first proof of concept, run 10ten only as an independent differential oracle against Sudachi-derived candidates; do not copy or ship its rule table.

### 5. Yomitan: use as a second learning-ecosystem oracle

Yomitan is the maintained successor to Yomichan, with more than 5,000 commits and frequent stable/testing releases ([Yomitan project](https://github.com/yomidevs/yomitan)). Exact release `26.7.29.0` (`649cfb0bdfe7b156447202b151f049784e8468dc`) defines 54 Japanese transforms containing 834 rules and typed dictionary-form conditions ([Japanese transforms](https://github.com/yomidevs/yomitan/blob/26.7.29.0/ext/js/language/ja/japanese-transforms.js), [transform engine](https://github.com/yomidevs/yomitan/blob/26.7.29.0/ext/js/language/language-transformer.js)).

The public fixture sweep proposed `食べる` for D21 `20/20` and proposed the verb for all three disclosed ambiguous RH09 commands. Like 10ten, Yomitan generates and dictionary-validates lookup candidates; it does not perform contextual word-sense disambiguation or establish that an Example Sentence belongs to one entry. Its dictionary format and `jmdict-yomitan` builds are useful interoperability references, not a source of missing product policy ([Yomitan JMdict builds](https://github.com/yomidevs/jmdict-yomitan)).

Yomitan is GPL-3.0, JavaScript/browser-oriented, and not published as an iOS library. It should remain a differential oracle unless Zenbu separately approves GPL build tooling or a clean-room rule implementation based on non-code linguistic sources. Do not use the sunset Yomichan fork when the maintained successor exists.

## English-side retrieval

No new English component is justified by this research. ADR 0002's Apple-supplied SQLite FTS4 Porter remains a mature, offline, deterministic eligibility engine. Accepted #163 already showed that alternative public quality/commonness signals did not recover the revealed English Ranking. Yomitan, 10ten, Sudachi, and JMdict examples do not solve English sentence selection or ordering.

The JMdict example feed can add high-confidence entry-linked examples even when English direct search ranks differently, but it must not become an English Ranking shortcut. Direct English Search should continue to use FTS4 candidate generation and the app-owned Match/Ranking contract.

## Public benchmark reproducibility

The benchmark used only committed public fixtures and the public JMdict-example release. It did not open the sealed holdout. Inputs were authenticated before comparison:

| Input | SHA-256 |
|---|---|
| Zenbu Language Reference Data SQLite | `248f9308662374c00dc597731ef085ee5ed87d9b703ec356be93ee9be8f03d4f` |
| D18-D20 observation rows | `ffbad9f0a93843507058045f0820dec6f242c6041db224b0ec8e79574c5c7dbc` |
| D21-D22 entry-route probes | `c4db9dadba2720c9d47b72a72f9a085d23a5104235b63d596007d3a938e0ab9e` |
| `jmdict-examples-eng` archive | `78a72aa519478d00cbe89d8c3fd73c2a93a0db68ed42d5c97ba5b2ade29a23c9` |
| extracted `jmdict-examples-eng-3.6.2.json` | `6c7204699a7e1600520d4c855f1d935647192b4477fdee511f4bc23008b97f0d` |

The JMdict inventory iterated every `words[].sense[].examples[]` record, counted entry ID plus one-based sense position, and compared each exact Japanese-English text pair to `example_sentences`. Fixture coverage compared public `japanese_id` only to measure source membership; target-entry coverage separately restricted the example set to JMdict sequence `1358280` (`食べる`) or `1467640` (`猫`). Its five-line normalized output is:

```text
D18	curated-source-membership=1/20
D19	curated-source-membership=2/20
D20	curated-source-membership=4/9
D21	curated-source-membership=0/20
D22	curated-source-membership=2/20
```

Output SHA-256 is `6ed13a068ea31edce6b63bfdbba960079c934c3adf1aacb949cab46dd5955ddf`.

For 10ten, the exact checkout and frozen unit replay were:

```sh
git clone --depth 1 --branch v1.27.2 \
  https://github.com/birchill/10ten-ja-reader.git 10ten
test "$(git -C 10ten rev-parse HEAD)" = \
  b9565acfbc9c24a6f83a979e6c3c9207758063b0
cd 10ten
corepack pnpm@11.0.0 install --frozen-lockfile --ignore-scripts
corepack pnpm@11.0.0 exec vitest run --project unit \
  src/background/deinflect.test.ts src/background/word-search.test.ts
```

The public probe examined every substring of each D21 Japanese sentence, called the exact exported `deinflect` function, and looked for `食べる`; it repeated that operation on the three disclosed RH09 sentences, accepting `始める` or `はじめる` as the candidate spelling. The same exhaustive-substring procedure called Yomitan's exact `LanguageTransformer` with the `26.7.29.0` Japanese descriptor. Both produced this normalized four-line output, SHA-256 `0cc30d0233b0170007c4f916bb373cc353cb32fb4b4d073503b9ca00a7c9c64e`:

```text
D21	food-target=20/20
始め！	begin-verb-candidate=true
よし始め。	begin-verb-candidate=true
演技はじめ！	begin-verb-candidate=true
```

This probe measures candidate generation only. It intentionally does not label the three RH09 commands as verb associations, because the public JMdict/analyzer evidence also supports noun `始め`.

## Rejected or deferred candidates

| Candidate | Reason |
|---|---|
| Jitendex | High-quality learning product and useful design reference, but its own README says the public rewrite is unfinished and current published dictionaries are still produced by unpublished legacy scripts. That fails Zenbu's reproducible-input requirement despite monthly releases ([Jitendex status](https://github.com/Jitendex/Jitendex#history)). Its flat data repository is CC BY-SA 4.0, but it does not improve on importing the official JMdict example source directly ([Jitendex data](https://github.com/Jitendex/jitendex-data)). |
| `jmdict-simplified` as a production dependency | Reliable weekly converter and excellent research normalization, but Zenbu already imports JMdict. Parse the official XML extension in the existing importer to avoid a second dictionary model and 129 MB intermediate JSON. Keep the exact release as the reproducible research fixture. |
| `tentoku-rs` | Technically relevant Rust port of 10ten with C FFI, 242-rule-style deinflection, JMdict SQLite, and tests, but the repository was created on 2026-03-02, has one star and no forks, and had no source push after its initial day when evaluated. GPL-3.0 plus immature independent maintenance makes it unsuitable as the primary component ([repository](https://github.com/eridgd/tentoku-rs)). |
| Jotoba | Mature open Japanese dictionary service, but AGPL-3.0 backend code and an online-service architecture add obligations and operational scope without evidence of sentence-to-JMdict-sense association ([repository](https://github.com/WeDontPanic/Jotoba)). |
| Lindera | Maintained and iOS-compilable, but #165 found no association advantage over Sudachi and a less direct normalized-form/dictionary boundary for this task. Keep only as a morphology comparator. |
| Vibrato / MeCab | Tokenizers, not JMdict association or sense-disambiguation systems. #165 already found weaker maintenance/integration evidence than Sudachi for this boundary. |
| Apple Natural Language | No Japanese lemma scheme on the tested platform in #165, so it cannot supply dictionary-form association. |
| Generic Lucene/Tantivy/FTS alternatives | Retrieve text candidates but do not establish Japanese dictionary-entry identity, sense applicability, pedagogical quality, or Ranking. |

## Concrete proof-of-concept plan

The proof of concept belongs in a later implementation issue after this report and ADR review. It should be build-time only.

1. **Pin the direct source.** Download the exact official `JMdict_e_examp` snapshot matching the pinned JMdict date, authenticate decompressed XML and compressed archive hashes, and retain a restorable artifact or immutable release locator. Parse it beside—not instead of—the existing JMdict source.
2. **Normalize declared links.** For each example attached to an entry sense, resolve `ent_seq` through `entries.source_identity/source_record_id`; resolve the exact Japanese-English text pair to one app-owned Example Sentence Corpus pair; validate example surface occurrence and sense/displayed-form applicability; emit an app-owned `source-declared-sense-example` association. Ambiguous or absent pair resolution fails closed.
3. **Import indexed annotations separately.** Normalize pinned `jpn_indices` headword, reading, surface, sense, and checked evidence. Resolve to one JMdict entry/sense or retain an explicit ambiguity diagnostic. Do not let it override a conflicting direct JMdict example relation silently.
4. **Analyze the remainder.** Run pinned Sudachi.rs/SudachiDict-small over corpus records without declared evidence. Join token dictionary/normalized forms and readings to JMdict forms, apply POS and `stagk`/`stagr` applicability, and emit an association only when exactly one entry remains.
5. **Differentially compare learning-oriented rules.** Run exact 10ten and Yomitan checkouts as non-shipping research or CI oracles over the public D21/D22 fixtures and a new public discovery set. Record where they find a candidate Sudachi misses, where they disagree, and where either produces multiple entries. Do not copy their GPL rule data into Zenbu.
6. **Keep ambiguity visible.** Produce counts for declared, indexed, analyzer-unambiguous, multiple-entry, no-entry, and conflicting-evidence rows. The three disclosed `始め`/`はじめ` commands must remain ambiguous unless a reviewed source explicitly resolves them.
7. **Measure the artifact.** Build a compact disposable SQLite association table and report row count, file-size delta, clean-build hash, importer wall time/RSS, and final iOS archive scan. Intended runtime analyzer/dictionary bytes and analysis latency remain zero.
8. **Replay without tuning.** Re-run all public D18-D22 and revealed RH classes, including set membership and entry association. Do not inspect or replace sealed evidence. Compare association coverage separately from Ranking; a larger correct set does not authorize a new order.
9. **Decide and document.** Amend ADR 0002 to admit or reject source-declared entry/sense evidence, define precedence/conflict behavior, version the association schema, and preserve provider coordinates only as provenance. Record EDRDG/Tatoeba update, attribution, notices, and SBOM/data-provenance requirements before production implementation.

## Acceptance gates for a later implementation

- Every shipped association is traceable to a source-declared relation, an unambiguous analyzer/JMdict proof, or an explicit reviewed record.
- Lemma equality alone cannot create an association.
- Displayed written/reading pair and sense restrictions are evaluated before a sense contributes evidence.
- Multiple plausible JMdict entries fail closed; no provider ID, source order, or query-specific exception resolves the tie.
- Source-declared, indexed, analyzer-derived, and reviewed evidence remain distinguishable in diagnostics.
- Example Sentence Ranking receives an eligible app-owned set and does not inspect provider coordinates or analyzer order.
- Clean rebuilds are byte-identical or have a documented deterministic normalization boundary.
- The final iOS archive contains no Sudachi, 10ten, Yomitan, Node, Rust analyzer, or morphology dictionary artifact.
- EDRDG/JMdict and Tatoeba attribution, update, source restoration, and SBOM/data-provenance checks pass.

## Bottom line

There is mature OSS worth using, but it should be composed rather than treated as one magic matcher. `JMdict_e_examp` supplies about 31,000 direct entry/sense associations already present in Zenbu's corpus. Tatoeba indices supply a second declared but incomplete lane. Sudachi supplies broad morphological candidates for the remainder. 10ten and Yomitan supply excellent Japanese-learning deinflection reference behavior, but their own output proves why candidate generation is not contextual disambiguation.

The smallest safe next move is a build-time association proof of concept using the official JMdict example feed plus the already selected Sudachi boundary. It can materially improve entry-linked examples without shipping a large NLP library, copying GPL rules, inventing ambiguous links, or changing Ranking.
