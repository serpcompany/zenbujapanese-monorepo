# iOS test and merge policy

This is the current operating policy for the Zenbu Japanese iOS App. The
historical research in `docs/research/ios-ci-accessibility-release-gates-2026-08-21.md`
remains decision evidence, but this file owns the executable cadence.

## Test layers

| Stage | What runs | Purpose |
| --- | --- | --- |
| Implementation | Relevant unit tests and issue-focused UI tests | Fast red-green feedback at the public seam changed by the issue |
| Pull request | Repository contracts, all unit tests, a bounded critical-journey set, and focused accessibility coverage | Fast automatic feedback for an iOS-relevant PR |
| Merge queue | The complete `ZenbuPR` plan once on the exact `merge_group` candidate | Blocking integration evidence after review and after GitHub combines the PR with current `main` |
| Manual investigation | `iOS nightly quality`, started with `workflow_dispatch` | Two-device accessibility breadth, repetitions, and sanitizers when investigation warrants the cost |
| Pre-release | Manual `iOS pre-release validation`, then separately authorized physical-device and release checks | Transient validation for an identified proposed candidate; never inferred from development CI |

The three network-backed Sudachi checks run through the explicit
`ZenbuSudachiIntegration` plan. They validate the immutable official Core wheel,
the shipped Swift adapter, and the frozen 512-sentence #251 confirmation set.
They are intentionally excluded from `ZenbuPR` so a third-party release-host
outage cannot make the ordinary complete unit target fail; issue implementation,
dependency-update, merge-candidate, and pre-release evidence must run this lane
separately. Deterministic pack lifecycle, checksum, corruption, update, fallback,
range, and resolver tests remain in `ZenbuPR` without network access.

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

## Path-aware execution

`apps/ios/Tools/ios_ci_scope.py` is the source of truth for changes that can
affect the iOS product. It includes:

- `apps/ios/**`;
- the Image Text fixture directory consumed by the Xcode project;
- the Tatoeba provenance sample consumed by the Release build phase;
- the Example Sentence Retrieval fixtures consumed by the privacy/data audit; and
- iOS workflow files.

The required jobs always report a conclusion. Non-iOS PRs therefore pass the
gate without starting macOS runners instead of remaining permanently pending
because an entire required workflow was path-filtered away.

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

## Current rollout hold

The workflow split can merge before enforcement, but the required ruleset must
wait for the complete suite to become reliable:

- four specialized Handwriting/Radical journey failures reproduce on the
  reviewed #216 baseline and are routed to #225;
- the remaining full Accessibility findings stay visible under #173; and
- the hosted lookup failure/retry race discovered by controlled PR #229 stays
  visible in the complete suite and #230; and
- a controlled PR must prove the fast gate names and runtime before they are
  added to branch protection.

Until those prerequisites are resolved, `ios-premerge / Required` is staged but
not a live branch rule. Never make it green by deleting coverage, skipping a
known failing journey, or adding a blanket accessibility exception.
