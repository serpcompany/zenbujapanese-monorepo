# Owner-authorized JPDB acquisition

These tools acquire public JPDB pages into an immutable, content-addressed
structured-data snapshot and normalize that snapshot into an app-owned SQLite schema. They do
not bypass authentication, CAPTCHAs, or other access controls, and they do not
collect account, deck, review-history, or other private user data.

The checked-in authorization record permits internal acquisition and
evaluation. It does **not** permit app distribution. Keep
`redistributionAllowed` false and do not pass `--allow-redistribution` until a
separate written grant covers raw and normalized redistribution.

## 1. Discover the public inventory

The checked-in seed manifest enables `public-frontend-closure-v1` from the JPDB
home page. It follows the five linked difficulty indexes (anime, novels, visual
novels, web novels, and live action), every pagination link, every indexed
media and subdeck vocabulary list, and every vocabulary URL in those lists.
Kanji URLs are derived only from characters exposed in those vocabulary URLs;
public kanji-to-kanji links are then traversed recursively.

Every difficulty and vocabulary listing publishes `Showing A..B from N
entries`. The final report proves that all positions 1 through N were visited,
that N listing positions were observed, that all five index families were
present, and that every indexed media page exposed at least one vocabulary
list. Queue exhaustion alone is not considered complete.

This proves closure over the public indexed-media graph. It cannot prove that
the graph contains dictionary vocabulary unused by every indexed work, kanji
disconnected from discovered vocabulary/kanji, or media categories without a
public difficulty index. JPDB currently exposes no sitemap, browse-all
dictionary/kanji route, embedded JSON inventory, or frontend enumeration API
for those sets. Do not describe this scoped closure as a complete JPDB database.

## 2. Acquire outside the repository

```sh
python3 apps/ios/Tools/acquire_jpdb.py \
  --authorization apps/ios/LanguageData/Sources/JPDB.owner-authorization.json \
  --seeds /absolute/path/to/jpdb-seeds.json \
  --snapshot /absolute/path/outside-this-repository/jpdb-snapshot
```

The default is one request every five seconds, sequentially. `429` and `5xx`
responses use bounded retries and backoff. Re-running the same command resumes
from `checkpoint.sqlite`; completed URLs are not requested twice. The tool
honors `robots.txt` by default. Use `--no-respect-robots` only when the owner has
explicitly included those routes in the authorization record.

For a future accelerated run, use pooled HTTP with adaptive ceilings:

```sh
python3 apps/ios/Tools/acquire_jpdb.py \
  ... \
  --http-client httpx \
  --concurrency 3 \
  --requests-per-second 4 \
  --adaptive-start-concurrency 1 \
  --adaptive-start-rps 1
```

Adaptive throttling is enabled by default. The command above starts at one
worker / one request per second, treats 3 workers / 4 requests per second as
ceilings, halves the active rate and removes one worker after a
connection error, HTTP 429, or retryable 5xx, and adds only 0.5 requests per
second after 200 consecutive successes. The snapshot report records final rate,
active concurrency, reductions, and recoveries. Use `--no-adaptive-throttle`
only for controlled local fixtures. A 5 requests-per-second probe and a later
long-running 4.5 requests-per-second probe both produced an HTTP 500 followed
by a connection reset, so the documented ceiling is the last clean tier of
4 requests per second. Persisted backoff state—not the starting value—is
authoritative for a resumed crawl. Connection resets are a
backpressure signal, not a reason to increase retries or workers.

At the minimum adaptive setting, two consecutive connection-level failures open
a durable IP-cooldown circuit breaker. It pauses **all** new requests for 1,800
seconds by default. The wall-clock deadline, reason, consecutive-signal count,
trip count, and open/close events are stored in `checkpoint.sqlite`, so stopping
and restarting the crawler cannot evade the cooldown. A successful response or
an HTTP response resets the connection-signal streak; ordinary one-off `5xx`
responses continue to use normal bounded retry/backoff and do not open this
30-minute circuit. Configure this behavior with
`--circuit-breaker-cooldown-seconds` and
`--circuit-breaker-signal-threshold`, or disable it only for controlled fixture
testing with `--no-circuit-breaker`. `snapshot.json` records the final breaker
state and event history.

`--requests-per-second` limits request starts across the whole process.
`--concurrency` controls how many responses may be in flight so network latency
does not idle an owner-authorized crawl; it does not override the start-rate
limit. Start conservatively, inspect retries and failures, and increase these
values only within the owner's server-capacity limits.

For long crawls, install the pinned optional client from
`requirements-jpdb.txt` and pass `--http-client httpx`. It reuses HTTP/1.1
connections, reducing TLS overhead without increasing the configured request
start rate. The stdlib `urllib` client remains the dependency-free default.

HTML and CSS exist only in memory during a request. Route-specific extractors
immediately convert them into canonical JSON under `structured/sha256/`; the
JSON is zlib-compressed on disk and the markup is discarded. `snapshot.json`
records the canonical/final URL, retrieval time, HTTP byte count and checksum,
extracted-data byte count and checksum, ETag/Last-Modified values, and extractor
schema. Failures and attempts remain in the checkpoint database.

## 3. Normalize and validate

```sh
python3 apps/ios/Tools/import_jpdb.py \
  --snapshot /absolute/path/outside-this-repository/jpdb-snapshot \
  --authorization apps/ios/LanguageData/Sources/JPDB.owner-authorization.json \
  --zenbu-language-data apps/ios/Modules/Sources/SearchExperience/Resources/LanguageReference.sqlite \
  --output /absolute/path/outside-this-repository/JPDB.sqlite \
  --output-manifest /absolute/path/outside-this-repository/JPDB.import.json
```

The importer refuses incomplete snapshots by default, verifies every structured document,
builds normalized vocabulary/form/reading/meaning/POS/frequency/pronunciation,
kanji/component, example, media/deck, identifier, mapping, conflict, and
field-provenance tables, then runs SQLite integrity and foreign-key checks. If
the Zenbu database is supplied, JPDB/JMdict vocabulary IDs are classified as
mapped, ambiguous, or unmapped. The import report records source and artifact
checksums, table counts, completeness, mapping counts, storage size, and
distribution state. It also records categorized validation counts, deterministic
representative source-to-row comparisons, provenance coverage, and
measured import duration/row throughput. Deterministic JSONL sidecars next to
the import manifest contain the mapped, ambiguous, and unmapped Zenbu entries;
their row counts, byte counts, and SHA-256 checksums are pinned in the manifest.

The SQLite artifact is immutable and rebuilt from its checksum-pinned structured
snapshot when `artifactSchema` changes. It is not migrated in place. This is the
migration contract for research artifacts: keep the external snapshot and its
manifest, run the newer importer to a new output path, validate it, then promote
that artifact. MySQL uses the forward, checksum-enforced migrations documented
in the warehouse README.

`--allow-incomplete` exists for parser development only. An incomplete artifact
must never be promoted. `--allow-redistribution` is a deliberate second gate;
it must not be used under the current authorization record.

## 4. Load the research warehouse

After the scoped snapshot is complete and the SQLite artifact validates, use
[`jpdb_mysql/README.md`](jpdb_mysql/README.md) to migrate and atomically publish
the snapshot into MySQL 8.x. The warehouse retains every content-addressed
extracted document as well as normalized tables, provenance, licensing,
conflicts, validation findings, and frontend-closure evidence. It stores no
fetched HTML, CSS, or response body.

For a completed snapshot, the final audit, normalized build, MySQL staging
export, optional MySQL publication, and Frequency Pack v2 draft can be run as
one fail-closed operation:

```sh
python3 apps/ios/Tools/finalize_jpdb_pipeline.py \
  --snapshot /absolute/external/jpdb-snapshot \
  --authorization apps/ios/LanguageData/Sources/JPDB.owner-authorization.json \
  --language-data /absolute/path/LanguageReference.sqlite \
  --output /absolute/external/jpdb-final \
  --mysql-database zenbu_jpdb \
  --mysql-arg=--login-path=zenbu-jpdb
```

Omit the MySQL arguments to generate audited artifacts and staging files
without publishing them. The finalizer refuses incomplete snapshots and never
enables redistribution.

When MySQL is requested, finalization loads the identical warehouse export
twice. After each load it queries the current JPDB snapshot pointer, immutable
snapshot/checksum identity, stored per-table manifests, and actual
snapshot-scoped row counts. Completion fails unless both observations match the
export manifest and are identical to each other. This evidence is recorded as
`mysqlVerification` in `JPDB.finalization.json`; one successful load is not
sufficient for completion.

## Verification

```sh
python3 -m unittest discover -s apps/ios/Tools/tests -p 'test_*.py' -v
```

The fixture tests cover resumability without duplicate requests,
content-addressed structured storage, normalized extraction, deterministic
repeated
imports, SQLite integrity/foreign keys, field provenance, distribution gating,
and rejection of a tampered structured document. They use a local HTTP server
and make no requests to JPDB.

## Acceptance evidence and remaining proof

The import manifest is the machine-readable acceptance record:

- acquisition completeness is copied from the closure report as `expected` and
  `observed`;
- duplicate observations, conflicts, malformed/missing-field validation issues,
  and unparsed sections are summarized under `validationCounts`;
- `representativeChecks` compares deterministic vocabulary, kanji, and media
  samples directly with their extracted source documents;
- SQLite integrity and foreign-key results are recorded explicitly;
- `provenance.documentLocatorRows` proves each canonical extracted document is
  linked to its source resource, while normalized semantic fields retain bounded
  JSON locators such as `$.vocabulary.forms` and `$.kanji.meanings`; this provides field-level
  traceability through the immutable canonical document without expanding every
  listing leaf into another SQL row. `rowsPerStoredRow` is the scale guard;
- mapping report manifests distinguish mapped, ambiguous, and unmapped records;
- `storage` and `performance` record HTTP/extracted/artifact bytes, elapsed import
  time, stored rows, and throughput.

The fixture suite proves these contracts without contacting JPDB. Closing the
issue still depends on the completed live public-frontend crawl: run the final
audit/import, review all validation and unparsed counts, compare the reported
representative records, publish and idempotently reload the MySQL snapshot, and
record real storage/performance values. The public-frontend closure limitation
described above remains: unlinked dictionary or kanji records cannot be claimed
complete without an owner-provided inventory. App distribution remains disabled
until redistribution rights are separately recorded.
