# JPDB MySQL research warehouse

This internal tool loads a completed JPDB public-frontend snapshot and its
validated normalized SQLite artifact into MySQL 8.x. It does not make MySQL an
iOS runtime dependency.

The warehouse keeps snapshots immutable. A load inserts snapshot-scoped rows,
validates table counts and checksums, and switches `jpdb_current_snapshot`
inside the same transaction. Re-loading the same snapshot and artifact is
idempotent. HTML/CSS is transport-only: each response is immediately converted
to a content-addressed canonical JSON document and then discarded.
`jpdb_source_resources` retains the HTTP response checksum and byte count and
references that document. MySQL stores no response body.

The schema stores the complete extractor document plus normalized observations
for media/deck metrics, deck positions and duplicate vocabulary rows, external
links and images, vocabulary media appearances, kanji readings/attributes/
mnemonics/relations, and generic/unparsed diagnostics. Fields not yet promoted
to normalized tables remain explicit in document diagnostics.

## Requirements

- MySQL 8.x with an existing empty database.
- The `mysql` CLI on `PATH`.
- A completed structured snapshot, normalized SQLite artifact containing its
  extracted documents, and matching import manifest.
- `LOCAL INFILE` enabled only for the generated export directory.

Credentials are never accepted as ordinary tool arguments or written to the
export. Prefer a MySQL login path configured outside the repository:

```sh
mysql_config_editor set --login-path=zenbu-jpdb --host=127.0.0.1 --user=...
```

## Export deterministic staging files

```sh
python3 apps/ios/Tools/jpdb_mysql/warehouse.py export \
  --snapshot /absolute/external/jpdb-snapshot \
  --sqlite /absolute/external/JPDB.sqlite \
  --artifact-manifest /absolute/external/JPDB.import.json \
  --output /absolute/external/jpdb-mysql-export
```

The command verifies the SQLite, snapshot, and extraction manifests and every
canonical document checksum. It emits deterministic UTF-8 TSV, `manifest.json`,
and `load.sql.template`. Binary checksums are hex encoded only in staging files
and decoded by MySQL during load.

## Apply migrations

```sh
python3 apps/ios/Tools/jpdb_mysql/warehouse.py migrate \
  --database zenbu_jpdb \
  --mysql-arg=--login-path=zenbu-jpdb
```

Migration checksums are recorded in `schema_migrations`; changing an applied
migration fails closed. Add a new numbered migration for every schema change.

## Load and publish

```sh
python3 apps/ios/Tools/jpdb_mysql/warehouse.py load \
  --database zenbu_jpdb \
  --mysql-arg=--login-path=zenbu-jpdb \
  --export /absolute/external/jpdb-mysql-export \
  --extract-root-uri file:///absolute/external/JPDB.sqlite
```

The loader passes SQL over stdin to the installed CLI, acquires a named load
lock, bulk-loads connection-local staging tables, inserts immutable target rows,
checks per-table counts/manifests, and atomically publishes the snapshot. The
acquisition/load workflow writes no fetched HTML, CSS, response body, or
credential to MySQL or the repository (small synthetic HTML test fixtures are
versioned solely to verify extraction behavior).

## Verification

```sh
python3 -m unittest discover \
  -s apps/ios/Tools/jpdb_mysql/tests -p 'test_*.py' -v
```

These tests use no MySQL server. A live integration check additionally requires
a disposable MySQL 8.x instance with local infile enabled; run migrations,
load the fixture export twice, and verify the current pointer and all snapshot
row counts remain unchanged on the second load.
