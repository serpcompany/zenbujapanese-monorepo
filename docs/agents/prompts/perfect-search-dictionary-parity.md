# Complete Search and dictionary physical-device parity

Create a persistent goal to complete the GitHub Wayfinder map
https://github.com/serpcompany/zenbujapanese-monorepo/issues/110.

The objective is to implement, independently review, verify, commit, push, and
close every child ticket and the parent map. Continue automatically across goal
turns until the complete acceptance contract is satisfied. Do not stop merely
because one ticket, one test run, or one TestFlight upload finishes.

## Turn protocol

At the beginning of every goal turn:

1. Run `$wayfinder` to reconcile the map and select and claim the next unblocked
   child ticket in map order.
2. Immediately perform the actual implementation and QC work for that ticket in
   the same goal turn. Wayfinder coordinates the work; it is not the work.
3. Do not stop after reporting Wayfinder's recommendation or restating the issue.
4. Use subagents for concrete independent implementation, Spec review, Standards
   review, visual comparison, evidence audit, or device verification when this
   reduces latency or improves independence.
5. If QC finds a defect, return it to the same ticket, fix it, and repeat the
   review. Do not close the ticket on partial acceptance.
6. After the ticket has two consecutive clean required runs, commit intentional
   changes, push them, attach exact evidence to the issue, close it, update the
   map, and continue automatically into the next goal turn.

## Non-negotiable acceptance rules

- Compare every reachable Search/dictionary screen, visible control, action,
  transition, recovery path, and settled visual state against the Nihongo
  reference dossier and any fresh agent-controlled reference observations.
- Update the executable parity ledger with clone evidence and test IDs. Create
  additional child issues for newly discovered mismatches and attach them to
  #110 before continuing.
- A visible core control cannot pass as unavailable, inert, excluded, or a
  placeholder. The prior Camera and Photo Library waiver is superseded by #110.
- DEBUG fixtures and injected providers are permitted for deterministic edge
  tests but cannot be the sole production acceptance evidence.
- Screenshot existence is not visual parity. Retain paired reference/Zenbu
  evidence, explicit masks or tolerances, inspectable diffs, and recordings for
  animation or temporal behavior.
- Exercise production adapters and public controls. Include natural handwriting
  `山` and `yama` / `やま` / `山` through the canonical result, Kanji Detail, and
  visible stroke playback journey.
- Run focused tests, neighboring journey regressions, the complete Debug suite,
  Release runtime smoke, evidence validation, and signed-artifact/device checks
  in proportion to each ticket.
- Verify hardware-, permission-, and distribution-dependent behavior using an
  agent-controlled physical device and the exact signed Release/TestFlight
  artifact. Simulator-only success is insufficient for Camera, Photos,
  permissions, live handwriting/OCR, and shipped-resource truth.
- Do not ask the user to perform QA. Repair or use the available agent automation
  paths and record genuine external access blockers precisely if one exists.
- Preserve app-owned models, focused capability boundaries, provenance,
  licensing, repository standards, and the scope decisions recorded in #110.
- Never push the parity build to the legacy `com.zenbujapanese.nihongoclone` app.
  Use only the `com.zenbujapanese.dictionary` App Store Connect/TestFlight app.

## Terminal condition

Stop only after all of the following are true:

- Every child of #110 is closed with exact implementation and verification
  evidence.
- The parity ledger has zero blocking `unknown`, `not_run`, failed, or unexplained
  rows.
- Every visible Search/dictionary control is operable through public behavior.
- Two consecutive complete parity crawls and all engineering gates pass.
- The accepted commit is clean and pushed, and its exact signed artifact is
  available in the `com.zenbujapanese.dictionary` TestFlight app.
- The final TestFlight build ID, version, build number, commit, artifact hash,
  device/runtime, and evidence indexes are recorded on #110.
- Parent map #110 is closed.
