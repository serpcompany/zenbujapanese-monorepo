# iOS test and merge policy

This is the current operating policy for the Zenbu Japanese iOS App. The
historical research in `docs/research/ios-ci-accessibility-release-gates-2026-08-21.md`
remains decision evidence, but this file owns the executable cadence.

## Test layers

| Stage                                      | What runs                                                                                            | Purpose                                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Implementation                             | Relevant unit tests and issue-focused UI tests                                                       | Fast red-green feedback at the public seam changed by the issue                                    |
| Draft pull request push                    | Scope, manifest validation, and a SHA-bound deferred status on Ubuntu                                | Keep WIP pushes cheap; the draft itself remains unmergeable                                        |
| Ready pull request or later non-draft push | Manifest-selected repository contracts, units, critical journeys, and focused accessibility coverage | Automatically verify the exact current head without accepting stale green results                  |
| Merge queue                                | Cheap required-status reporting plus ten concurrent exact-candidate lanes: Unit, three complete Accessibility UI shards, five normal UI shards, and `ZenbuSudachiIntegration` | Blocking integration evidence without repeating fast macOS partitions or learner journeys |
| Manual investigation                       | `iOS nightly quality`, started with `workflow_dispatch`                                              | Two-device accessibility breadth, repetitions, and sanitizers when investigation warrants the cost |
| Pre-release                                | Manual `iOS pre-release validation`, then separately authorized physical-device and release checks   | Transient validation for an identified proposed candidate; never inferred from development CI      |

The three network-backed Sudachi provenance checks run through the explicit
`ZenbuSudachiIntegration` plan. They validate the immutable official Core wheel,
the shipped Swift adapter, and the frozen 512-sentence #251 confirmation set.
They are intentionally excluded from `ZenbuPR` so a third-party release-host
outage cannot make the ordinary complete unit target fail; issue implementation,
dependency-update, merge-candidate, and pre-release evidence must run this lane
separately. The required Core dictionary is staged into every app product by the
checksum-pinned Xcode build phase and is read directly from the app bundle. The
Xcode phase is offline-only and fails with a bootstrap instruction when its
external checksum-keyed build cache is absent. The repository issue runner and
hosted workflows run that explicit bootstrap before invoking Xcode. Outside the
explicit integration plan, only the bootstrap may download the source wheel;
ordinary Unit/UI/Accessibility tests do not independently download it. The wheel
never enters the app, and runtime never copies or downloads the bundled
dictionary. Hosted macOS workflows cache only the exact wheel; self-hosted
builders retain the same external cache. The explicit `ZenbuSudachiIntegration` plan remains
the one intentional exception: it independently fetches and validates the
official URL inside its disposable Simulator to preserve real source/provenance
coverage at merge-candidate and release stages. The host build cache is not
treated as evidence for that integration contract.
Deterministic bundle selection, pack lifecycle, checksum, corruption, update,
fallback, range, and resolver tests remain in `ZenbuPR` without network access.
Ordinary UI and accessibility launches use a deterministic DEBUG-only analysis
provider except for the bounded bundled-provider cold-relaunch journey. The
merge-candidate workflow invokes and retains both correctness plans.

The exact inventory contains 324 tests. `ZenbuPR` includes 311 (112 Unit and 199
UI), and `ZenbuSudachiIntegration` includes three network-backed Unit tests. The
ten exact tests outside those correctness plans are one performance-only Unit
test, three physical/system HIL journeys, #269's four deliberately red framework
diagnostics, and #289's two broad secondary-surface whole-window diagnostics. The
diagnostics remain independently callable through their dedicated plan and never
enter `ZenbuPR` or `ZenbuNightly`.

The complete suite is not repeated after merge when the merge-queue SHA already
passed. The manual breadth workflow has no schedule because iOS changes are
currently infrequent. `iOS pre-release validation` deliberately reruns the complete
suite and a Release simulator build for an explicitly identified candidate; it
does not archive, sign, upload, submit, or replace physical-device approval. Its
90-day artifact is transient pre-release evidence, not the signed release-candidate
record. The later authorized archive/release workflow must copy the signed archive,
dSYMs, checksums, and candidate result bundles to the documented 400-day-or-longer
evidence store. `iOS performance trend` remains a separate weekly trend, not a
substitute for correctness.

During Apple-native refactor issue loops, adaptive-layout changes retain one
focused maximum-size smoke for the exact surface under review. Broader functional
journeys run at normal Dynamic Type; the existing direct accessibility audits remain
visible under #173 and are not replaced, skipped, or treated as passing by that split.

#269 records one explicit framework-diagnostic disposition for native Liquid Glass
tab-edge snapshots. Its four direct whole-window Search/Kanji contrast audits remain
unchanged and deliberately red in `ZenbuAccessibilityDiagnostics`; they are not app
correctness passes and never enter a required gate. `ZenbuPR` instead blocks on the
same exact public content after it is fully unobscured, its semantic system pixels,
AX5 geometry and navigation, plus native tab/navigation legibility. This narrow plan
separation is not an audit handler, expected failure, skip, or permission to move any
other #173 audit out of correctness coverage.

#293 empirically proved that Xcode's whole-window contrast audit is sensitive but
not specific at the native iOS 26 Liquid Glass boundary: it detected an unobscured
authored defect and cleared that exact finding after semantic repair while retaining
an anonymous native-boundary finding. On that evidence, #289's two unchanged broad
secondary-surface methods remain visibly red in `ZenbuAccessibilityDiagnostics`.
Their focused app-owned You, Frequency, Dictionary Sources, Japanese Text Analysis,
Kanji, Conjugation, Example, Media, and Image Text seams remain blocking in
`ZenbuPR` or `ZenbuAccessibility`. This is the entire #289 authorization boundary;
it does not move any other direct audit out of correctness coverage. Ordinary
#289 TDD and issue-final selection run repository contracts only. An explicit
`secondary-accessibility-diagnostics` request remains available when a human
chooses to replay the two visible-red whole-window diagnostics.

`VerificationPolicy.json` is the canonical capability and lifecycle manifest.
`Tools/ios_verification.py` validates it and resolves a plan from changed paths,
a reviewed capability name, lifecycle stage, draft state, and exact source SHA.
Agents do not assemble final selector lists. A newly discovered bug selector is
added to the manifest with its capability and reason, reviewed, and then selected
through the same interface.

For the merge-candidate stage, the planner derives ten lanes from the committed
Xcode plan inventory and `VerificationTimingProfile.json`. Every `ZenbuPR` Unit
test belongs to the Unit lane. The complete 68-test `ZenbuAccessibility`
partition is split across three lanes, and the remaining 131 normal UI tests are
split across five lanes. The separate `ZenbuSudachiIntegration` plan is the
tenth lane. UI identities are assigned by deterministic longest-processing-time
balancing: measured duration descending, test identity as the stable tie-breaker,
then the lowest-load lane with lane order as its stable tie-breaker. Repository
validation fails if the timing profile omits or invents a current UI test, if the
generated lanes omit or duplicate any required `ZenbuPR` test, if a lane drifts
from the deterministic split, or if the complete Accessibility or Sudachi plan
stops being covered.

The timing profile comes from workflow run `33888752432` on exact source
`84bece9fc47e5aa0bd7420befc600a915464f5d3`. Its complete per-test log inventory
produces measured test loads of 1,150.814, 1,153.155, and 1,153.903 seconds for
Accessibility and 1,295.008, 1,292.152, 1,285.508, 1,285.392, and 1,285.777
seconds for normal UI. Four normal shards would retain roughly 1,613 seconds of
test load and predict about 37 minutes with the observed setup/build overhead;
five predicts a conservative maximum of about 33m21s after runner and evidence
packaging overhead. The prior three UI artifacts totaled 2,978,028,994 compressed
bytes. All result bundles, logs, screenshots, summaries, and identity records
remain retained for 30 days; the next authorized run must measure actual storage
instead of reducing evidence.

The current generated counts are 112 Unit; 22, 23, and 23 Accessibility UI;
26, 26, 26, 27, and 26 normal UI; and 3 Sudachi integration tests.

For ordinary issue work, keep the PR draft, run the repository-selected local
issue gate, and push the reviewed commit. Changing the PR to Ready automatically
runs the hosted fast plan. A later non-draft source push automatically produces a
new run on the new head. Changing it back to Draft cancels an in-progress fast run;
subsequent draft pushes remain cheap. Manual dispatch is investigation/recovery,
not normal cadence.

Both stable contexts are required on the merge-group SHA. `ios-quality.yml`
therefore reports `ios-fast / Required` for `merge_group`, but its merge-group
cadence is status-only: the fast macOS partitions already passed on the PR head,
while `ios-premerge.yml` owns the complete and integration plans on the merge
candidate. Merge-group workflow concurrency does not cancel an active candidate.

## Path-aware execution

`apps/ios/Tools/ios_ci_scope.py` is the coarse source of truth for whether changes
can affect the iOS product. `VerificationPolicy.json` then maps the exact changed
paths or committed capability to the smallest approved partitions. Scope includes:

- `apps/ios/**`;
- the Image Text fixture directory consumed by the Xcode project;
- the Tatoeba provenance sample consumed by the Release build phase;
- the Example Sentence Retrieval fixtures consumed by the privacy/data audit; and
- iOS workflow files.

The required jobs always report a conclusion. Non-iOS PRs therefore pass the
gate without starting macOS runners instead of remaining permanently pending
because an entire required workflow was path-filtered away.

## Runner contract

`run_selected_test_plan.sh` translates only manifest selector IDs, including the
repository-generated merge partition selectors, into Xcode test identifiers.
The `ios_verification.py tests` adapter returns tagged JSON with either
`selected-tests` and its exact identities or `full-plan` with an empty test list;
the shell runner rejects unknown modes, empty selected partitions, and any
full-plan selector combined with another selector.
`run_ci_test_plan.sh` owns the Simulator lifecycle, uses
`build-for-testing` followed by `test-without-building`, and records separate
setup, build, test, and total durations. Supplying the same `ZENBU_DERIVED_DATA`
allows sequential focused selectors to reuse products only when the source,
plan, device, and Xcode fingerprint matches; drift fails closed.

The supported local interface is:

```sh
apps/ios/Tools/run_issue_verification.sh issue-final BASE_SHA HEAD_SHA RESULT_DIR CAPABILITY
```

It resolves committed policy from the base/head diff plus any reviewed capability,
verifies that `HEAD_SHA` is the active checkout, and executes the resulting tiers.
The lower-level selector and Xcode-plan adapters reject direct calls without a
repository-policy authorization context; selector JSON is never a caller-facing
issue-gate interface.

Local Simulator-changing commands acquire one repository lock. A second agent
cannot launch against the shared Simulator state, and a lock whose recorded PID
is no longer live is recovered. Hosted jobs retain unique disposable Simulators,
so their existing job-level parallelism remains safe. Cleanup deletes only the
Simulator created by that invocation and its invocation-owned DerivedData.

Failures are not blindly retried. `classify-failure` marks a rerun eligible only
when zero tests started and the recorded category is a recognized runner,
Simulator, or Xcode-service infrastructure loss. Any product assertion, or any
failure after a test starts, requires diagnosis and a new candidate.
Every hosted fast test job also writes this small identity/classification/timing
record to its GitHub job summary and uploads it as a separate summary artifact
before packaging the large result bundle. Triage therefore does not wait for a
multi-hundred-megabyte screenshot/video artifact merely to learn the tested SHA,
test count, or failure class.

## Before map and optimization decisions (#256)

At fixed point `7319a04`, the repository contained 85 unit tests, 125 Search
journey UI tests, and 63 accessibility UI tests. `ZenbuPR` owns the complete unit
and public-journey targets while excluding four real-network Sudachi tests, one
native download journey, two physical/system HIL journeys, and one performance
test. `ZenbuAccessibility` owns the direct accessibility inventory;
`ZenbuSudachiIntegration` owns the four network/large-resource unit checks plus
the native download journey; `ZenbuPerformance` and manual `ZenbuNightly` remain
separate. Relaunch/history/note/media tests mutate only launch-argument-scoped app
state; adaptive tests set text size per launch. Disposable hosted Simulators
prevent that state from crossing jobs.

The executable exact inventory is available with:

```sh
python3 apps/ios/Tools/ios_verification.py inventory --repo-root .
```

It lists all 273 test target/class/method identities and their plan membership.
At the fixed point, `ZenbuPR` includes 265 and skips 8, `ZenbuNightly` includes
270 and skips 3, `ZenbuAccessibility` selects 63, `ZenbuSudachiIntegration`
selects 5, and `ZenbuPerformance` selects 2. Validation fails if any discovered
test belongs to no plan and is not one of the two exact physical-system HIL
journeys with a committed reason. It also verifies each manifest selector's
target, class, method, and actual plan membership, so a misspelled selector
cannot silently execute zero tests.

Exact overlap at the fixed point is: all 265 `ZenbuPR` tests also belong to the
manual reliability plan; all 63 accessibility tests remain in `ZenbuPR`; one of
the two performance tests also remains a correctness journey in `ZenbuPR`; and
none of the five Sudachi integration tests belongs to `ZenbuPR`. The overlap is
intentional: manual repetition, direct accessibility auditing, and performance
measurement answer different questions than one correctness execution. The
network integration separation is complete.

| Repository interface         | Trigger and ownership                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `ios-quality.yml`            | Draft/Ready/non-draft PR state machine; fast partitions; status-only merge-group report   |
| `ios-premerge.yml`           | PR deferral plus exact `merge_group` complete and integration plans                       |
| `ios-nightly.yml`            | Manual two-device audit, repetition, and sanitizer investigation                          |
| `ios-performance.yml`        | Scheduled/manual manifest-selected performance plan                                       |
| `ios-release-validation.yml` | Manually authorized complete Release validation                                           |
| `ios_ci_scope.py`            | Coarse iOS-consumer path classification                                                   |
| `ios_verification.py`        | Policy validation, planning, exact inventory, identity, lease, and failure classification |
| `run_issue_verification.sh`  | Supported local TDD/issue-final interface                                                 |
| `run_selected_test_plan.sh`  | Internal selector-ID-to-Xcode adapter; empty input fails closed                           |
| `run_ci_test_plan.sh`        | Internal fingerprinted build/test/Simulator/timing adapter                                |
| `run_sudachi_integration.sh` | Explicit real-network/large-resource integration entry point                              |

Network and large-resource dependencies are confined to the pinned Sudachi Core
wheel/provider tests and native pack-download journey. Ordinary frequency-pack
tests inject local data or `example.invalid`; the performance plan uses bundled
data. App UI tests mutate only app-owned launch-argument stores (recent searches,
notes, Encounter Media, fixture providers, permissions) inside their disposable
Simulator. Accessibility text size and appearance are launch arguments, not
shared host settings. No runner deletes global Simulator or process state.

The #244–#252 issue evidence used the same Xcode project/scheme and explicit
`-only-testing` selectors later normalized into this manifest. Exact retained
partition outcomes were: #244 10/10 normal UI (295.900s), 5/5 repair UI
(97.596s), 4/4 adaptive (80.570s), 57/57 units (5.515s); #245 4/4 normal UI
(239.485s), 2/2 repair UI (121.645s), 1/1 maximum-size (33.290s), 57/57 units
(11.303s); #246 8/8 color/current-token (193.769s), 2/2 spec repair (70.532s),
2/2 architecture repair (65.389s), 1/1 client seam (44.685s), 80/80 units
(8.505s); #248 hosted 10/10 Critical UI (20m30s), units 61/61 and contracts
36/36; #249 9/9 relevant Image Text and 60/60 units; #250 was docs/research-only;
#251 scorer 17/17 and hosted Critical UI 16m34s/Unit 11m22s/Accessibility
8m45s; #252 78/78 deterministic units (7.980s) plus one explicit real-provider
hard-case/512-sentence integration run. #247 had not started. Their issue comments
remain the source for the exact historical selector commands and result-bundle
paths; future issue evidence uses `run_issue_verification.sh` instead of rebuilding
those ad hoc command lists.

The pre-change fast workflow always ran 10 UI and 6 accessibility selectors on
every iOS-relevant draft push. Exact-head run 33731938715 measured Scope 10s,
contracts 3m03s, Unit 9m51s, Accessibility 13m27s, and Critical UI 23m35s
(13m06.940s test execution). The three macOS test jobs consumed 46m53s while the
parallel wall clock was 23m35s; Critical UI alone spent about 10m28s outside test
execution. Recent issue evidence also measured: #244 focused UI 295.900s and a
reduced adaptive partition 80.570s versus 174.003s; #245 all result bundles
10.70m; #248 hosted Critical UI 19m41s, Unit 7m36s, Accessibility 12m06s;
#251 hosted Critical UI 16m34s, Unit 11m22s, Accessibility 8m45s; and #246 unit
execution 8.505s versus its 9m51s hosted Unit job.

Those measurements produce these decisions:

- Adopt impact-selected hosted partitions and Ready-state batching. For the
  remaining refactor checkpoints, this changes three draft issue pushes per
  three-issue batch from three expensive cycles to one Ready-state cycle: a 66.7%
  run-count and macOS-runner-minute reduction before selector savings.
- Adopt fingerprinted local build-product reuse. On the controlled Search
  readiness selector, a fresh build plus test took 62.551s (setup 19.264s, build
  23.387s, test 19.899s); the unchanged fingerprint reuse took 40.383s (setup
  20.918s, validation 0.082s, test 19.383s), saving 22.168s or 35.4% with the
  identical assertion outcome. A changed source, Xcode, device, or plan fails
  closed rather than reusing those products.
- Keep UI parallel testing disabled. Current public journeys share permissions,
  persistence, and app lifecycle within a test, and no clone-Simulator isolation
  evidence justifies opaque XCTest parallelism.
- Do not enable unit parallelism. Unit execution was 8.505s inside a 9m51s job,
  so even eliminating all unit execution would save at most 1.4%.
- Do not add hosted build-once fan-out yet. Current runners already overlap in
  parallel, and the controlled build produced 3.2 GB of build products (3.6 GB
  DerivedData total). Uploading and downloading that product in front of the
  parallel jobs is not a proven improvement to the 23m35s wall clock; sharing it
  without the enforced fingerprint is also unsafe.
- Do not shard Critical UI yet. The measured theoretical two-shard lower bound is
  about 17m02s (10m28s setup plus half the 13m06s tests), a possible 6m33s wall
  saving but roughly another 10m28s of runner setup. Adopt only after a controlled
  repeated experiment proves state independence and reliability.
- Do not add a broad SwiftPM/DerivedData cache. The new local reuse path provides
  measured-loop leverage with exact fingerprints; the measured 3.6 GB local
  DerivedData makes a broad hosted upload/download unattractive, and narrower
  dependency-cache invalidation has not yet demonstrated a net win.

No learner journey was removed. `complete.public` and the required-journey
inventory make disappearance from every tier a policy error. Maximum-size hosted
coverage is reduced to one representative changed-layout smoke; normal-size
functional coverage and #173's direct audits remain intact.

## Stable required checks

After the rollout prerequisites below are green, protect `main` and require:

- `ios-fast / Required`;
- `ios-premerge / Required`.

Require pull requests, strict current-branch checks, conversation resolution,
and the merge queue. Include administrators unless an auditable emergency
bypass policy is separately approved. The pre-merge workflow listens for both
`pull_request` and `merge_group`: it reports a quick deferred success on the PR,
then runs and requires the complete suite on the merge-group SHA.

Do not enable the ruleset while either required context is permanently red.
GitHub had no `main` branch protection when #227 began.

## Current rollout state

The current dependency order is #289 → #256 → #294 → #173 → #227. #269's
tab-edge and #289's secondary-surface native whole-window findings remain visible
in the dedicated diagnostics plan while focused app-controlled seams stay
blocking. The consolidated affected-screen UI/accessibility coverage runs once
under #173 after #294; #227 then runs the ten generated lanes on one exact
merge-group SHA. The nine `ZenbuPR` lanes collectively execute its complete
inventory exactly once; the tenth runs `ZenbuSudachiIntegration`. Never make that
candidate green by deleting coverage, skipping a known failing journey, or adding
a blanket accessibility exception.
