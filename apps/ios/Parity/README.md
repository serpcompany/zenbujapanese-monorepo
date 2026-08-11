# Search and dictionary differential parity

`search-dictionary-plan.json` is the executable 18-journey denominator for issue
#111. The canonical atomic denominator remains
`docs/clone-discovery/nihongo/parity-inventory.jsonl`.

## Commands

Run the public XCTest crawler into a new, non-repository evidence directory:

```sh
node apps/ios/Tools/parity-ledger.mjs crawl \
  --run-dir /tmp/zenbu-parity-run \
  --destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' \
  --stage-photo docs/clone-discovery/nihongo/fixtures/image-text/fixture-clear-horizontal.png
```

The crawler retains the built app, xcresult, machine-readable test summary, and
every exported attachment. `run.json` records deterministic SHA-256 values for
the complete app and xcresult directories and for each attachment. The command
refuses to reuse an existing run directory.

The source worktree must be clean before and after the crawl. This makes
`source_commit` an honest binding to the compiled app rather than a label on an
artifact that also contains uncommitted edits.

`--stage-photo` may be repeated. The crawler resolves the simulator UDID and
runtime, stages each file with `simctl addmedia`, hashes the staged source, and
records the Xcode version and build number. Use an explicit `id=` destination
for delegated runs when more than one matching device is installed.

The crawler intentionally creates no observations by inference. An agent must
replay and inspect each planned journey, then add exact row-scoped observations
to `run.json`. This prevents a passing test bundle or screenshot count from
becoming a parity claim by itself. Each observation names:

- exact parity row, journey, and XCTest IDs;
- `destination_state` with the reached `surface_id`, `state`, and `output`;
- semantic and action observations, expected and actual behavior;
- paired reference and Zenbu evidence;
- `exact`, `approved_variance`, `defect`, or `access_blocker` classification;
- passed, failed, or blocked test status;
- for visual rows, the reference image, Zenbu image, inspectable diff, explicit
  mask list, per-channel tolerance, changed-pixel ratio tolerance, and result.

Create an inspectable image diff with ImageMagick 7:

```sh
node apps/ios/Tools/parity-image-diff.mjs \
  --reference reference.png \
  --clone zenbu.png \
  --diff diff.png \
  --masks masks.json \
  --per-channel 8 \
  --max-changed-pixel-ratio 0.01
```

Validate evidence without changing the ledger:

```sh
node apps/ios/Tools/parity-ledger.mjs validate \
  --run /tmp/zenbu-parity-run/run.json \
  --ledger docs/clone-discovery/nihongo/parity-inventory.jsonl \
  --expected-commit HEAD
```

Compile evidence into reviewable outputs:

```sh
node apps/ios/Tools/parity-ledger.mjs compile \
  --run /tmp/zenbu-parity-run/run.json \
  --ledger docs/clone-discovery/nihongo/parity-inventory.jsonl \
  --required-journeys docs/clone-discovery/nihongo/scope.json \
  --plan apps/ios/Parity/search-dictionary-plan.json \
  --output-ledger /tmp/zenbu-parity-ledger.jsonl \
  --output-report /tmp/zenbu-parity-coverage.json \
  --output-corrections /tmp/zenbu-parity-corrections.json
```

Replace `compile` with `gate` for CI or delegated QC. The gate fails when any
blocking row is unknown, not run, defective, access-blocked, failed, or covered
only by an unexplained variance. Correction output is grouped by journey and
contains ready-to-file issue input rather than creating GitHub issues
automatically. Compilation with a plan also requires evidence runs for every
declared environment; a simulator-only run cannot satisfy the signed-device or
release-smoke requirements. It also requires the plan's two complete passing
runs before it can close the parity denominator. Recorded test IDs and outcomes are reconciled with
the hashed xcresult test tree, and visual results are recomputed from the
registered source images rather than trusted from edited JSON.

## Regeneration

Changes to the canonical reference denominator must be regenerated and audited:

```sh
node docs/clone-discovery/nihongo/generate-crosswalk.mjs
node docs/clone-discovery/nihongo/generate-parity-ledger.mjs
node docs/clone-discovery/nihongo/audit-dossier.mjs
```

The ledger generator preserves runtime `clone_status`, `test_status`, and
`clone_evidence` fields by row ID while regenerating the reference-owned fields.
