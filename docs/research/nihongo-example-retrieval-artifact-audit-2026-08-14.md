# Nihongo Example Sentence Retrieval artifact audit

Issue: #149. Parent research: #147. Behavioral evidence: #148.

## Outcome: Fingerprint only

A lawfully accessible shipped Nihongo `1.33.1` (`9587`) artifact deterministically
identifies **SQLite FTS4 with the built-in Porter tokenizer** as the index
technology for `ExampleSentenceTarget` text:

```sql
CREATE VIRTUAL TABLE ExampleSentenceTarget_text_FTS
USING fts4(content="ZEXAMPLESENTENCETARGET", ZTEXT, tokenize=porter)
```

This is a direct artifact fact, not a behavioral inference. SQLite documents
that its FTS3/4 `porter` tokenizer applies the Porter stemming algorithm so
related English forms reduce to a common root. It is not evidence of the
separate Snowball package. [SQLite FTS3/FTS4 tokenizers](https://www.sqlite.org/fts3.html#tokenizer)

The finish-line status remains **Fingerprint only**, rather than Identified,
because:

1. the embedded database is from `1.33.1`, while the accepted iPhone reference
   is `1.34.3` (`9792`);
2. the artifact links the OS-provided `/usr/lib/libsqlite3.dylib` and does not
   pin a SQLite semantic release; and
3. the final query construction, post-match filters, limit, duplicate policy,
   and ranking code are not present in accessible unencrypted modules.

The result supports SQLite FTS4 Porter as the strongest candidate technology
for compatibility research. It does not authorize copying proprietary code or
replacing Zenbu's app-owned Match/Ranking policy with an inferred private one.

## Evidence chain

| Surface | Fact |
|---|---|
| Exact reference device metadata | CoreDevice `477.30` revalidated Nihongo `1.34.3` (`9792`) on the authorized iPhone reference. Device identifiers remain private. |
| Accessible shipped artifact | App Store-installed iOS-on-Mac wrapper, Nihongo `1.33.1` (`9587`), bundle `com.serpentisei.studyjapanese`. |
| Acquisition | Preserved at `2026-08-14T14:25:40Z`; copied read-only from `/Applications/Nihongo.app` with `ditto --rsrc --extattr`; source and preserved-copy deterministic tree hashes matched. |
| Preserved artifact | 1,175 regular files; 458,348 KiB allocated; tree SHA-256 `1232990d6ed3eea92b5901bc95675745f223351353aac694413ee6360edfb212`. |
| Main executable | arm64, 8,691,376 bytes, SHA-256 `266e4276f4c756479745264f6e12118dcee79ca1b189690d5bd03cd2ee97a150`. |
| Dictionary database | 332,681,216 bytes, SHA-256 `374ca944196e84031cbb65b98943b71f62a182fd601ac6433edde535ba3ec993`. |
| Private storage | Durable local-only `private-evidence/zenbujapanese/issue-149/`; directories mode `0700`, manifest and CoreDevice records mode `0600`. |

Tools: Xcode `26.0` (`17A324`), CoreDevice `477.30`, llvm-otool /
cctools `1030.6.3`, and host sqlite3 CLI `3.51.0`. The host sqlite3 version is
an inspection-tool version, not the shipped iOS SQLite runtime version.

## Supported acquisition surfaces

`devicectl device info apps` exposes installed-app metadata for the exact
`1.34.3` reference. `devicectl device copy from` exposes only the documented
`temporary`, `appDataContainer`, `appGroupDataContainer`, and
`systemCrashLogs` domains—not an installed-app-bundle domain. A scoped
`appDataContainer` probe for an application-bundle path failed before transfer
with CoreDevice error `-1` and underlying `ContainerLookupErrorDomain` error
`3`. No app bytes or container contents were copied from the iPhone.

No owned IPA, Mobile Applications cache, or Apple Configurator cache was
available. The separate iOS-on-Mac installation was exposed by the OS and was
preserved before inspection.

The [current App Store listing](https://apps.apple.com/us/app/japanese-dictionary-nihongo/id881697245)
was also checked. It describes conjugated search and credits JMDict/Tatoeba,
but does not identify retrieval libraries or algorithms.

## Bundle inventory

- The inner app contains 45 embedded frameworks, three app extensions, two
  compiled Core ML models, settings acknowledgements, Core Data models, and
  SQLite stores.
- The main executable has an embedded Apple signing identity and
  `LC_ENCRYPTION_INFO_64` with `cryptid 1` over a 4,096-byte region. Its bundle
  declares FairPlay scheme `v2`. No decryption or bypass was attempted. Its
  stripped status is deliberately not claimed: accessible symbol/load-command
  metadata cannot characterize the encrypted implementation region.
- The preserved wrapper's legacy resource envelope does not pass current
  `codesign -v` verification (`obsolete custom omit rules`). The three focused
  unencrypted frameworks below each pass `codesign -v`; artifact hashes are the
  immutability authority for this audit.
- `Info.plist`, non-identifier entitlement keys, framework load commands,
  encryption commands, exported Swift/Objective-C metadata, resource names,
  model metadata, Core Data model versions, SQLite schema, acknowledgements,
  and package/build markers were inventoried. Private entitlement values and
  identifiers are excluded from Git.

### Focused modules

| Module | Artifact facts | Retrieval-role conclusion |
|---|---|---|
| `DictionaryFramework.framework` `1.0` (`1`) | First-party bundle `com.serpentisei.DictionaryFramework`; arm64; `cryptid 0`; embeds `Dictionary.sqlite`; does not dynamically link `Tokenizer.framework`. | Its signed resource contains the direct Example Sentence FTS schema. The framework's exported surface does not reveal the final query/rank path. |
| `Tokenizer.framework` `1.0` (`1`) | First-party bundle `com.serpentisei.Tokenizer`; arm64; `cryptid 0`; links Apple NaturalLanguage and CoreML. Exported Swift metadata names Japanese tokenization, JMdict POS conversion, dictionary-backed lattice/path-cost tokenization, and deconjugation. | Deterministically a Japanese parsing technology. No accessible dependency edge ties it to English Example Sentence Match or Ranking. |
| `FMDB.framework` `2.7.5` | Bundle `org.cocoapods.FMDB`; arm64; `cryptid 0`; links OS `libsqlite3.dylib`. The encrypted main links FMDB, DictionaryFramework, Tokenizer, and OS SQLite. | Exact bundled database-wrapper identity, but no accessible evidence proves which final retrieval query it executes. |

### Core ML metadata

`Tokenizer.framework` embeds a compiled `JapaneseTagger` word-tagger model.
Readable metadata declares one String `text` input, Japanese part-of-speech
class labels, and token/tag/location/length sequence outputs. The author field
names [a publicly documented Serpenti Sei cofounder](https://www.bennington.edu/academics/faculty/justin-vasselli),
supporting first-party—not third-party package—classification. The binary imports `NLTagger`,
`NLTokenizer`, and Core ML model classes.

This model is evidence for Japanese tokenization/deconjugation. Its interface
does not expose English query stemming, example eligibility, or ranking.

## Example Sentence index map

The database has one FTS row per target row:

| Store fact | Value |
|---|---:|
| `ZEXAMPLESENTENCE` rows | 205,886 |
| `ZEXAMPLESENTENCETARGET` rows | 202,079 |
| `ExampleSentenceTarget_text_FTS` rows | 202,079 |
| Case-folded duplicate target-text groups | 20,435 |
| Duplicate target rows beyond the first | 25,296 |

`ZEXAMPLESENTENCETARGET` links a target string and language discriminator to an
example row. `ZEXAMPLESENTENCE` retains the Tatoeba identifier and Japanese-text
length; word associations are stored separately. There is no unique constraint
on normalized target text, so the store itself does not prove UI duplicate
handling.

Related schema facts:

- English/example target text: FTS4 `tokenize=porter`.
- Dictionary combined glosses: FTS4 `tokenize=porter`.
- Parsed Japanese example text: FTS4 `tokenize=character`.
- The main and FMDB load commands reference OS `libsqlite3.dylib` with Mach-O
  current version `377.0.0`; that load-command value is not a SQLite semantic
  release number.
- The store has app `user_version` `3674`, which is an app migration marker,
  not a SQLite version.

No accessible SQL statement, FTS `matchinfo` weighting, BM25 expression,
post-filter predicate, `ORDER BY`, or `LIMIT` for the UI path was found in the
unencrypted modules/resources. FTS4 does not impose the final product ranking
by itself.

## Discriminating read-only probes

These probes ran against the preserved `1.33.1` store with a quoted FTS phrase;
they test the declared index, not the encrypted app's unknown SQL string:

| FTS phrase | Candidate rows |
|---|---:|
| `"scared you"` | 3 |
| `"scare you"` | 3 |
| `"red you"` | 0 |
| `"startle you"` | 1 |
| `"startled you"` | 1 |

The equal `scared`/`scare` sets and rejection of `red you` are expected from
Porter stemming plus phrase boundaries and align with part of #148. But #148's
`1.34.3` UI returns four rows for each scared/scare probe and distinguishes
`startle you` (one) from `startled you` (zero). That counterexample proves the
raw FTS phrase alone is not the complete current eligibility contract.

The FTS store exposes document IDs and ordinary record metadata but no persisted
ranking score. Default FTS row order also differs from the observed UI order.
Final ordering therefore remains app-owned and undiscovered.

## Licenses and candidate fingerprints

The two Settings acknowledgement plists enumerate bundled OSS/data sources,
including FMDB and Tatoeba/JMDict, but no Snowball, Lindera, MeCab/IPADIC,
Sudachi/SudachiDict, Kuromoji, or upstream tokenizer package for this path.

Candidate-name scans were treated cautiously:

- `snowball`, `Lindera`, and `sudachi` byte hits inside the dictionary store are
  ordinary corpus/dictionary words (for example plant/species names and
  snowball sentences), not package fingerprints;
- `UniDic` appears in public-facing Settings copy as a pitch-accent data source,
  not Example Sentence Retrieval technology; and
- no comparable shipped region justified an upstream binary-hash comparison.

SQLite's own primary documentation and source identify `porter` as a built-in
FTS3/4 tokenizer. No evidence supports substituting the separately maintained
Snowball package name for that artifact fact.

## Continuity and unresolved edges

The artifact contains Core Data model versions through `StudyJapanese 228`;
model hashes for `ExampleSentence` and `ExampleSentenceTarget` are unchanged
between embedded models 227 and 228. This establishes only local model-history
continuity inside `1.33.1`. It does not prove that `1.34.3` ships the same FTS
schema or final query logic.

Unresolved within authorized means:

1. the exact SQLite semantic runtime version used on the iPhone;
2. continuity of the FTS4 Porter schema from `1.33.1` to `1.34.3`;
3. the exact `MATCH` expression and escaping/token-joining rules;
4. eligibility filters, language/link validation, duplicate handling, limits,
   and fallback paths; and
5. ranking weights and tie-breakers.

Resolving those from the exact current executable would require an unavailable
supported bundle surface or prohibited FairPlay circumvention. Neither is
authorized. #147 should therefore retain compatibility wording and use this
fingerprint as a candidate to test, not as a license to clone private behavior.

## Reproduction commands

```sh
xcrun devicectl help device copy from
otool -l Nihongo
otool -L Nihongo
otool -L Frameworks/Tokenizer.framework/Tokenizer
nm -gU Frameworks/Tokenizer.framework/Tokenizer | xcrun swift-demangle
plutil -p Frameworks/Tokenizer.framework/JapaneseTagger.mlmodelc/metadata.json
sqlite3 -readonly Frameworks/DictionaryFramework.framework/Dictionary.sqlite \
  "SELECT name,sql FROM sqlite_master WHERE name LIKE '%_FTS' ORDER BY name;"
sqlite3 -readonly Frameworks/DictionaryFramework.framework/Dictionary.sqlite \
  "SELECT count(*) FROM ExampleSentenceTarget_text_FTS WHERE ZTEXT MATCH '\"scared you\"';"
```

Paths above are artifact-relative. Private command JSON/logs, device identifiers,
app bytes, database bytes, and model bytes remain outside Git.
