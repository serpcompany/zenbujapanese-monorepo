---
status: accepted
---

# Store JPDB research snapshots immutably in MySQL

JPDB public-frontend acquisitions are loaded into a MySQL 8.x research
warehouse as immutable, snapshot-scoped data. MySQL is an internal analysis and
validation target, not an application runtime dependency. The iOS app continues
to consume its app-owned SQLite artifacts.

Each load is identified by the checksum of its structured snapshot manifest. Source
responses, normalized facts, provenance, licensing, validation results, and
completeness evidence all belong to that snapshot. A new snapshot is loaded and
validated before one transactional pointer makes it current. Published rows are
never updated in place; loading the same checksums again is a no-op.

HTML and CSS are transport-only and are discarded immediately after
route-specific extraction. MySQL stores one content-addressed canonical JSON
document per extracted page, while source-resource rows retain the HTTP body
checksum and byte count for audit. Typed normalized tables cover the extractor's
current semantic fields; generic and unparsed diagnostic evidence remains in
the extracted JSON so parser gaps are explicit without mirroring markup.
Redistribution remains a separate authorization gate.

The warehouse uses versioned SQL migrations, InnoDB foreign keys, `utf8mb4`,
and binary Unicode collation for exact source identity. The loader uses the
installed MySQL CLI and deterministic staging files rather than adding an ORM
or an unmanaged Python database package.

If MySQL later becomes a production service consumed by an app, that is a new
delivery surface and requires a separate architecture and operations decision.
