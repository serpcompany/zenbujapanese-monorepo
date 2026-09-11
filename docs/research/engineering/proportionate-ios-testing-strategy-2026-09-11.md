# Proportionate iOS testing strategy

Research for [Issue #331](https://github.com/serpcompany/zenbujapanese-monorepo/issues/331), consulted 2026-09-11.

## Decision

Reintroduce a **small, layered test system**, not a reconstructed version of the archived suite. Start with one Swift Testing target for deterministic logic and subsystem integration, then add one XCTest UI target containing exactly three representative learner journeys. Ordinary pull requests should build the app and run all fast logic tests; exact merge candidates should additionally run the three UI journeys. Release validation should add a small set of accessibility audits and a human device checklist.

The initial goal is confidence per minute, not test count or coverage percentage. Do not multiply every journey across appearance, Dynamic Type, accessibility, permission, and failure permutations. Keep those conditions at the cheapest layer that can prove the behavior, and leave inherently physical or experiential checks to release QA.

## Observed Zenbu baseline

These are repository observations, not industry claims:

- At commit `e3a66928651d0b2347224818502e608d3010f9b6`, `xcodebuild -list` exposes one production target, `ZenbuJapanese`, and no first-party test target or test plan. The only active workflow is the monthly JMdict upstream monitor, not app CI.
- The app is a single Swift package product, `SearchExperience`, with 63 first-party Swift source files and 21 files declaring SwiftUI views. See the [package manifest](../../../apps/ios/Modules/Package.swift) and [iOS ownership README](../../../apps/ios/README.md).
- The installed product has two top-level tabs. Search leads to word, kanji, kanji-element, examples, conjugations, and image-text routes; You leads to reading aids, media, frequency dictionaries, language technology, and credits. See [SearchExperienceRootView](../../../apps/ios/Modules/Sources/SearchExperience/SearchExperienceRootView.swift) and [YouAndMediaLibraryView](../../../apps/ios/Modules/Sources/SearchExperience/YouAndMediaLibraryView.swift).
- The highest-risk nonvisual seams are offline dictionary lookup/ranking, Japanese analysis, frequency-pack download and integrity checking, persisted recent searches/preferences/notes/media, and image-text state transitions. Camera authorization, Photos/file import, OCR, speech, and translation add system or device behavior.

This is a small app by target and navigation count, but its offline data and system integrations justify more than a launch smoke test. They do not justify hundreds of end-to-end or accessibility permutations.

## What the primary sources establish

Apple distinguishes unit tests from broader integration tests by the amount of real code involved, and recommends Swift Testing for unit and integration tests that call code directly. It reserves XCTest/XCUIAutomation for UI workflows and says UI tests should reproduce the most critical user activities and reported regressions. Apple also recommends replacing complex dependencies with deterministic stubs at the code-test layer. Source: [Apple, Adding tests to your Xcode project](https://developer.apple.com/documentation/xcode/adding-tests-to-your-xcode-project).

Apple treats test selection as normal: run a single relevant test during development, all tests for an affected target during integration, and broader configurations less frequently because they take longer. Xcode supports tags and test plans, and `xcodebuild -only-testing` runs a specific test identifier. The same tooling can repeat a suspect test until failure for diagnosis. Sources: [Apple, Running tests and interpreting results](https://developer.apple.com/documentation/xcode/running-tests-and-interpreting-results) and [Apple, Improving code assessment by organizing tests into test plans](https://developer.apple.com/documentation/xcode/organizing-tests-to-improve-feedback).

Apple's reliability guidance favors isolated setup, deterministic mocked services, independent tests, parallel execution where safe, and explicit timeouts. It describes a reduced pull-request plan plus a broader nonblocking plan as a normal split; retries are presented as a tool for unreliable external services, while mocking is preferred for speed and determinism. Source: [Apple, Author fast and reliable tests for Xcode Cloud](https://developer.apple.com/videos/play/wwdc2022/110361/).

An automated accessibility audit inspects the current screen for common issues such as labels, hit regions, contrast, clipping, traits, and Dynamic Type. Apple warns that a clean audit does not guarantee accessibility and separately calls for testing actual workflows with assistive technologies such as VoiceOver. Sources: [Apple, Performing accessibility audits for your app](https://developer.apple.com/documentation/accessibility/performing-accessibility-audits-for-your-app) and [Apple, Performing accessibility testing for your app](https://developer.apple.com/documentation/accessibility/performing-accessibility-testing-for-your-app).

Apple also cautions that Simulator does not reproduce every device capability or physical-device behavior. That matters for Zenbu's camera, speech, performance, and permission experience. Source: [Apple, Running your app in Simulator or on a device](https://developer.apple.com/documentation/xcode/running-your-app-in-simulator-or-on-a-device).

No Apple source sets a universal CI duration target or test count. The budgets below are Zenbu operating recommendations to be validated against measured runs.

## Comparable public projects

Public repositories show implementation choices, not private CI, staffing, defect rates, or causal proof. Each example is more complex than Zenbu and is therefore a ceiling or mechanism reference, not a suite-size template.

| Project | Observed practice | Relevant lesson and caveat |
| --- | --- | --- |
| [BookPlayer](https://github.com/TortugaPower/BookPlayer/blob/154895b90b5b3612b77972923bd1d22fde49fffa/.github/workflows/ci.yml#L9-L58) | Its visible PR CI builds for testing once and runs one unit-test target; the test step has a 12-minute timeout. Its [unit plan excludes performance tests](https://github.com/TortugaPower/BookPlayer/blob/154895b90b5b3612b77972923bd1d22fde49fffa/BookPlayerTests/Unit%20Tests.xctestplan#L32-L42). | A mature iOS/watchOS media app can keep the routine gate focused. Playback, sync, widgets, and watch support make it more complex than Zenbu. |
| [IceCubesApp](https://github.com/Dimillian/IceCubesApp/blob/b2db3033fbf67a97b54d25d6dac2df8a029b26b1/Packages/StatusKit/Package.swift#L28-L54) | Focused test targets sit beside package-owned domain modules; its public GitHub workflow only [validates translations](https://github.com/Dimillian/IceCubesApp/blob/b2db3033fbf67a97b54d25d6dac2df8a029b26b1/.github/workflows/validate_translations.yml#L1-L35). | Tests can concentrate on logic seams without a public UI matrix. The absence of a visible workflow does not prove there is no private or external automation. |
| [Simplenote iOS](https://github.com/Automattic/simplenote-ios/blob/9615a490e34794696e05454b4d66411f4b408ea5/.buildkite/pipeline.yml#L12-L59) | Its default pipeline separates one unit lane from one full UI lane on a single iPhone SE configuration. Its [manual checklist](https://github.com/Automattic/simplenote-ios/blob/9615a490e34794696e05454b4d66411f4b408ea5/TESTING-CHECKLIST.md#L1-L46) retains real sync, offline, appearance, and device behaviors outside automation. | Automation and human QA can have explicit, nonduplicative ownership. Simplenote's accounts, backend sync, and company infrastructure make even this a heavier ceiling for Zenbu. |
| [NetNewsWire](https://github.com/Ranchero-Software/NetNewsWire/blob/dc74019c2434acf4a9a7826e709257a4a2541361/.github/workflows/ci.yml#L1-L119) | Its visible CI runs package/domain-oriented iOS and macOS plans, cancels superseded work, and uploads `.xcresult` only on failure with seven-day retention. | Failure-only short-lived diagnostics are sufficient for routine CI. NetNewsWire is a large multi-platform reader, so its number of modules and tests is not comparable. |

The consistent transferable pattern is layering and restraint: domain tests carry most coverage; UI automation proves a few critical workflows; expensive configurations and experiential checks do not become a cross-product on every commit.

## Recommended minimum test pyramid

| Layer | Initial content | Explicit boundary |
| --- | --- | --- |
| Swift Testing unit tests | Begin with 12–20 test functions, parameterized where inputs share one invariant: query normalization; ranking and artifact decoding; conjugation selection; image-text state transitions; frequency-pack manifest/checksum rules; reading-aid settings; persistence serialization and migration. | Pure or stubbed dependencies; no app launch, Simulator, network, camera, speech, clocks, or shared user defaults/files. Count parameter rows as data, not separate hand-written tests. |
| Swift Testing integration tests | Begin with 4–6 tests: lookup against a tiny committed SQLite fixture; word detail composition from lookup/examples/frequency data; recent search/note/media round-trip in a unique temporary directory; frequency-pack install/verify/remove in a temporary directory; Japanese-analysis fallback; real Vision recognition against one pinned image fixture. | Use multiple real Zenbu components but no UI automation or live services. Never use the full production database when a minimal fixture proves the contract. The Vision test becomes required only after 20 same-runtime repetitions are stable; otherwise keep that behavior in manual QA. |
| XCTest UI journeys | Exactly the three named journeys below, one method each, using deterministic launch state and local fixtures. | Assert learner-visible milestones, not every label, row, navigation transition, color, or internal state. No snapshots or device/appearance matrix. |
| Automated accessibility audits | Five stable screen states in the release plan: Search empty, Search results, Word detail, image-text results, and You root. | One default appearance/content-size configuration. Audit failures block release, not ordinary merges. Do not create separate accessibility journey suites. |
| Human release QA | One short physical-device checklist covering VoiceOver, largest accessibility text, dark/increased contrast, permissions, camera/photo import, speech, offline launch/lookup, persistence across relaunch, and destructive media/frequency-pack actions. | Human-observable system and experiential behavior only; do not repeat deterministic domain assertions already automated. |

The counts are starting limits, not permanent quotas. Add a case when it protects a meaningful invariant or reproduces an escaped defect; do not add a test merely because a view or type exists. Code coverage is diagnostic information, not a merge threshold.

## Three representative learner journeys

1. **Lookup to understanding.** Fresh deterministic launch; search for `食べる`; verify the expected best word; open Word Detail; reach one example sentence and the conjugation table; return to results. This proves the product's central offline value and its main navigation chain.
2. **Image result to known word.** Launch directly into an image-text session with injected, fixed recognition output; select a known token; open its Word Detail; return to the image session. This proves recognition-result-to-analysis-to-dictionary navigation. The separate integration test owns real Vision recognition; this UI journey does not claim to test OCR quality, Photos UI, camera hardware, or permission alerts.
3. **Remember and personalize.** Search a known word; save a word note; relaunch; verify the recent search and saved note under You; delete the note and verify it is absent. This proves note persistence and the second top-level tab. Encounter-media import and removal remain physical-device QA unless a defect justifies focused automation.

Each journey must start from a declared fixture/state reset and set `continueAfterFailure = false`, matching Apple's UI-test template guidance to stop a UI test at its first failure. System permissions, real handwriting quality, speech audibility, real camera/photo selection, downloads, and visual polish remain in the release checklist unless an escaped regression demonstrates that a narrow deterministic automation seam is needed.

### Configuration and failure placement

| Concern | Required placement |
| --- | --- |
| Offline | Unit/integration tests prove bundled lookup success, missing/corrupt-data failure, and retry state. Journey 1 proves the learner path with networking disabled or unavailable. Physical-device release QA confirms cold launch and lookup in Airplane Mode. |
| Persistence | Unit/integration tests cover empty, write/read, replacement, deletion, corrupt-record recovery, and any supported migration. Journey 3 blocks merge-candidate persistence regressions. |
| Failure handling | Parameterized logic tests cover no results, unavailable dictionary, checksum mismatch, failed pack operation, unavailable translation, and recognition failure. UI tests assert a failure screen only after that failure has escaped or the presentation contains meaningful interaction not provable below the UI. |
| Permissions | Code tests cover authorization-state mapping and actions with stubs. Denied and allowed camera behavior is physical-device release QA; do not automate every system-alert permutation. |
| Appearance and Dynamic Type | No PR or merge matrix. Five stable screens receive release audit/manual coverage; a setting becomes automated earlier only after a specific regression. |
| Device and performance | One pinned Simulator blocks merges. A physical iPhone owns camera, speech, permission feel, and performance smoke before release. Add a performance baseline only after a measured user-facing budget or regression exists. |

## CI and release contract

| Stage | Required work | Execution budget after runner start | First actionable failure |
| --- | --- | --- | --- |
| Local edit | Run the changed Swift Testing function or suite; developers can run the full fast target before pushing. | Selected test under 30 seconds warm; full logic target under 2 minutes cold. | Under 30 seconds for a selected test. |
| Pull request: docs/research/release records only | Repository checks such as Markdown links and formatting; no Xcode runner. | 2 minutes. | 1 minute. |
| Pull request: iOS code, resources, data, package, project, or tooling | Debug build plus the complete unit/integration target on one fixed Simulator. If the change touches UI or navigation, also run all three UI journeys; three tests are small enough that a path-to-journey classifier is unnecessary. | 8 minutes total. | 4 minutes. |
| Merge candidate | Check out the exact candidate SHA; Debug build; complete unit/integration target; all three UI journeys on one fixed Simulator. | 12 minutes total. | 5 minutes. |
| Release candidate | Check out the exact release SHA; Release build/archive validation; complete logic target; three UI journeys; five stable-screen accessibility audits; then the human checklist on a physical device. | 20 minutes automated. Human QA is separately recorded, not hidden in CI time. | 8 minutes automated. |

Measure job duration, time to first failing assertion, test count, and rerun outcome from the first ten product PRs and first two releases. A lane that exceeds its budget twice in five runs must be split, simplified, or removed from that stage before adding tests. Do not solve a budget miss by silently increasing the timeout.

Use one required aggregate check with stable naming. Change classification may skip Xcode only when every changed path is positively classified as nonruntime. Unknown paths fail safely into the iOS build-and-logic lane, not into an exhaustive release matrix.

Build UI test products once, then invoke the three exact journey selectors sequentially with `test-without-building` under shell fail-fast behavior (`set -euo pipefail`). Exit the lane when a selector fails; do not continue collecting results from later journeys. `continueAfterFailure = false` additionally stops the current journey method at its first failed assertion. This directly bounds time to a visible red result while preserving exact-selector diagnosis.

## Failure and rerun policy

- Every failure summary prints the exact test identifier and a copy-paste `xcodebuild ... -only-testing:<target>/<suite>/<test>` command. Apple documents this selector for focused runs: [Running tests and interpreting results](https://developer.apple.com/documentation/xcode/running-tests-and-interpreting-results).
- Provide a manual diagnostic workflow accepting an immutable commit SHA, test kind, and exact selector. It uses the same pinned Xcode/runtime and runs only that selector. Its result is non-gating and never converts the original red check to green.
- Do not automatically retry assertions, rerun a failed suite, or use “retry until pass” in required lanes. A new product/test fix produces a new SHA and reruns the relevant gate. A confirmed hosted-runner outage may justify a full job rerun, with the incident linked in the PR.
- Define a flaky test as inconsistent outcomes at the same SHA, Xcode/runtime, destination, and declared fixture. On confirmation, open a defect, remove that test from the required plan the same day, and repair or delete it within seven calendar days. A quarantined test remains diagnostic only and must not accumulate indefinitely.
- Use repeat-until-failure locally to diagnose nondeterminism, not as routine CI. Tests must own unique temporary storage and cannot depend on ordering or residue from another test.

## Simulator and artifact ownership

- Pin one Xcode version, one iOS runtime, and one iPhone model for routine automation. Change them in an explicit maintenance PR with a complete merge-candidate run.
- Each CI job creates or selects one Simulator by UDID, boots it, installs only its app/test products, and deletes or erases it in cleanup. No parallel lane shares a Simulator, Derived Data directory, user defaults suite, or files directory.
- Local automation uses a dedicated `Zenbu Automated Tests` Simulator. It must never erase, install into, or drive the human's manual-smoke Simulator. Camera, audio, thermal/performance, and final permission experience are verified on a physical device.
- Passing routine jobs retain only the concise test/timing summary. Failing jobs retain a compressed `.xcresult`, trimmed build log, and automatic failure screenshots/video for seven days. Do not upload Derived Data, app archives, or hundreds of passing screenshots.
- Release candidates retain the automated summary and human checklist for 30 days, linked to the exact release SHA. App archives and signing artifacts remain governed by release tooling, not the test system.

Apple documents that test products and execution can be separated with `build-for-testing` and `test-without-building`, and that specific tests can then be selected. Reuse a build inside one workflow when this measurably saves time; do not create a large cross-workflow artifact system before the three journeys demonstrate a need. Source: [Apple Technical Note TN2339](https://developer.apple.com/library/archive/technotes/tn2339/_index.html#//apple_ref/doc/uid/DTS40014588-CH1-HOW_DO_I_IMPLEMENT_THE_BUILD_FOR_TESTING_AND_TEST_WITHOUT_BUILDING_FEATURES_FROM_THE_COMMAND_LINE_).

## Accessibility and configuration ownership

Do not form a Cartesian product. Assign each concern once:

- **Merge blocking:** semantic labels/identifiers needed by the three journeys and learner-visible behavior at the default system configuration.
- **Automated release blocking:** `performAccessibilityAudit` on the five stable states, once each, at default appearance and text size.
- **Human release blocking:** complete Journey 1 with VoiceOver and Screen Curtain on a physical iPhone; inspect the five stable states at the largest accessibility text size; inspect them once in dark appearance with Increase Contrast; verify Reduce Motion where animation communicates state; exercise camera permission denied and allowed; confirm Japanese speech is audible and comprehensible.
- **Change-triggered manual check:** repeat only the affected configuration when code changes typography/layout, color, animation, permissions, media, or speech.

This preserves accessibility as a release requirement without confusing automated audits with actual assistive-technology usability. Any accessibility defect found by a user becomes a focused regression test at the cheapest reliable layer when feasible.

## Migration sequence

1. **Logic foundation.** Add one Swift Testing target to the existing package, a tiny fixture directory, and the first unit/integration tests for lookup, ranking, persistence, and frequency-pack integrity. Add one PR job for build plus the complete fast target. Stop and observe ten product PRs or two weeks, whichever is longer.
2. **One core journey.** Only after the logic job has zero flakes and meets its budget, add one XCTest UI target and Journey 1. Add deterministic app launch/reset support only for state the journey needs. Run every currently admitted journey for UI-affecting PRs and every merge candidate.
3. **Complete the three-journey gate.** Add Journeys 2 and 3 one at a time. Each must pass 20 consecutive same-SHA repetitions locally and five hosted runs before becoming required. Keep all three in one lane unless measured wall time requires splitting.
4. **Release layer.** Add the five accessibility audit states and the human physical-device checklist to a manually invoked, SHA-bound release workflow. Do not make release automation part of ordinary PRs.
5. **Review after two releases.** Compare runtime, flake rate, escaped defects, and manual findings. Add, move, or remove tests only from that evidence.

Every phase is a separate issue and pull request. Do not restore files wholesale from the recovery tag; consult history only to understand a behavior or recover a proven fixture intentionally.

## Explicit non-goals

- No resurrection, cherry-pick, or renaming of the archived test/CI system.
- No hundreds-test target, UI snapshot suite, visual-diff service, coverage percentage gate, mutation testing, or performance test by default.
- No device, iOS-version, locale, light/dark, Dynamic Type, contrast, and permission matrix on pull requests or merge candidates.
- No live-network, live-download, camera-hardware, speech-quality, or external-service assertion in required CI.
- No permanent quarantine list, pass-making retry policy, or saved local evidence inventory.
- No new CI orchestrator or custom path-capability framework until the simple two-target system demonstrably cannot meet the budgets.

## Evidence that would change this recommendation

Revisit the design when evidence, not anxiety, crosses one of these thresholds:

- Two escaped regressions in the same capability within two releases: add a focused regression test at the cheapest layer and consider moving that capability earlier in the gate.
- A device-, OS-, locale-, appearance-, or accessibility-specific production defect: add exactly that configuration to the release plan; promote it to merge blocking only after recurrence.
- A required lane flakes in more than 1% of 50 runs or misses its wall-time budget twice in five runs: simplify or remove the unstable coverage before expanding the suite.
- New sync/accounts, paid transactions, destructive cloud state, regulated content, multiple app targets, or a materially larger team: reassess integration depth, environments, and ownership.
- Three consecutive releases with no manual-only findings in a checklist item: consider removing or sampling that item. Repeated manual findings with a deterministic seam justify automation.

## Bottom line

Zenbu should restart with roughly 16–26 deterministic logic and subsystem-integration tests plus three UI journeys—not with a broad UI/accessibility inventory. The merge gate should prove that the exact candidate builds, core domain behavior is correct, and the three learner outcomes still work within 12 minutes. Release validation, not every commit, owns the wider accessibility and physical-device confidence.
