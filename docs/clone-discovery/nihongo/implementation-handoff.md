# Lookup parity implementation handoff

Status: **LEDGER_COMPLETE_NOT_CODING_READY**

This is a discovery-only handoff for the approved Search-rooted Lookup graph. It contains no Zenbu implementation, scaffolding, dependency, service, or prototype work. The final recursive audit is recorded in `final-audit-report.json` with disposition `NOT_READY — DISCOVERY GAPS REMAIN`.

## Canonical sources

- `parity-inventory.jsonl` is the only mutable atomic observable-claim ledger.
- `parity-coverage-report.json` is generated from the ledger and canonical crosswalk.
- `parity-open-questions.json` is the generated blocker registry with owners and resume procedures.
- `reference-resource-crosswalk.json`, the crawl files, fixture matrices, and evidence index are source indexes; they do not compete with the ledger for row status.
- Regenerate and audit all four outputs with `node docs/clone-discovery/nihongo/generate-parity-ledger.mjs`.

## Exact denominator

The ledger has 329 atomic rows: 23 surfaces, 84 distinguishable states, 129 action edges, 35 fixture/behavior-class inputs, 19 observable language-behavior claims, 16 language-resource boundaries, 7 design-token families, and 16 asset/fixture records. All 329 rows are schema-complete; 284 are ready reference inputs, 4 are explicitly blocked, and 41 preserve approved exclusions. All clone statuses are `unknown` and all test statuses are `not_run`.

## Implementation-use contract

A later implementation agent must select an approved journey, locate all rows by `journey_ids`, reproduce each row from its `preconditions`, `fixture_ids`, and `action`, and implement immediate, settled, durable, failure, recovery, and relaunch behavior only to the boundary explicitly stated. It must retain app-owned Language Reference Data behind the focused Shared Capability boundaries in ADR 0001. It must add clone evidence and passed tests before changing any row from `unknown`; structural completeness is not runtime verification.

Reference evidence records the observed Nihongo baseline. The approved variances and nonblocking boundaries are canonical in `scope.json`; they include Zenbu-owned visual measurements, glyphs, accessible semantics, exact pitch-record matching, per-control pronunciation-source routing, and repeatability behavior. The whole-content Natural Translation is an approved Image Text Flow addition, not evidence of Nihongo behavior.

## Deterministic fixtures and fault injection

Fixture rows point to exact inputs and source matrices. Purpose-created image assets carry hashes in `asset-index.json`. Future tests must restore the recorded state between runs and inject offline, denial, cancellation, interruption, retry, and recovery only where named rows require them. A neighboring environment or fixture never inherits a pass.

## Blocking handoff limits

3 distinct gaps block coding readiness. They include remaining runtime action/state capture, offline/failure behavior, audible audio and timing evidence, and language-source/provenance/licensing boundaries. Each blocker’s exact owner, completed independent work, affected rows, and resume procedure lives in `parity-open-questions.json`.

Do not claim exact internal algorithms, provider record identity, clip routing, reference asset identity, reference accessibility behavior, timing, offline behavior, or licensing beyond the recorded authority. Apply the approved Zenbu-owned substitutes and nonblocking boundaries from `scope.json` without describing them as exact Nihongo parity.

## Handoff gate

This ledger is complete as an index and **not coding-ready**. The completed audit issued `NOT_READY — DISCOVERY GAPS REMAIN`; rerun `audit-dossier.mjs` after resolving blockers. It may issue `READY_FOR_IMPLEMENTATION` only after the blocker list is empty.
