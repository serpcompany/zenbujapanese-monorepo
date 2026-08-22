# Enterprise iOS CI, accessibility, and release gates

Date: 2026-08-21  
Scope: Zenbu Japanese iOS app (`com.zenbujapanese.dictionary`)  
Status: recommendation only; this report does not implement or enable CI

## Implementation update — 2026-08-22

The implementation deliberately differs from the original recommendation below:

- Public pull requests use isolated GitHub-hosted macOS runners for repository contracts,
  unit tests, the complete accessibility plan, and 20 stable critical UI journeys.
- The complete UI/reliability matrix is **manual-only**, not daily. It remains available
  through `ios-nightly.yml` and as a local release gate.
- Trusted manual nightly/performance jobs target self-hosted macOS through #176,
  but execution is blocked until a runner is configured or shared with this repository.
  Public pull-request code must not execute on a self-hosted Mac.
- Builds 9–11 were uploaded before all owner release feedback was complete.
  Build 12 supersedes them for App Review and includes the system-control contrast fixes,
  persistent removable Word Image Attachments, and mixed-script furigana alignment.

The historical research and cited recommendations remain below as decision evidence; this
update is the current operating policy.

## Executive decision

Zenbu should not choose between automated testing and manual testing. It needs both, with different jobs:

1. **Every pull request must be blocked by automatic tests.** Fast logic tests, the complete existing regression suite on one canonical simulator, and automated accessibility audits must be required checks before merge.
2. **Every night must broaden the evidence.** Run the complete suite on large and compact iPhone layouts, run the complete accessibility screen/state matrix, enable diagnostic configurations, and deliberately repeat tests to detect nondeterminism.
3. **Every release candidate must be rebuilt cleanly, tested, signed, audited, and preserved.** A successful development build is not release evidence. The exact signed archive that is uploaded must pass the archive audit and be retained with its symbols and checksums.
4. **Every release still needs a human on a physical iPhone.** Apple says automated accessibility audits are only a starting point and explicitly directs teams to test with assistive technologies. VoiceOver is unavailable in Simulator, so an automated green check cannot replace physical-device VoiceOver and interaction testing.

The recommended operating model is **GitHub as the merge-policy control plane and Xcode Cloud as the Apple-native broad/release execution plane**:

- GitHub Actions owns fast repository checks and exposes stable required-check names to the protected `main` branch.
- Xcode Cloud runs the iOS simulator test plans, nightly matrix, analyze/archive actions, and produces Apple-native result bundles and signed archives.
- A small GitHub required check may represent the required Xcode Cloud pull-request workflow; Apple documents that Xcode Cloud can be required before a pull request merges.
- Release submission remains explicitly human-authorized. CI may create and distribute the candidate to TestFlight, but it must not silently submit a build to App Review.

This matches Apple's recommendation to have one frequently running basic workflow and a separate extensive workflow, and its example of branch/PR build-and-test workflows plus a `main` build/test/analyze/archive workflow. [Apple: Configuring Xcode Cloud workflow actions](https://developer.apple.com/documentation/xcode/configuring-your-xcode-cloud-workflow-s-actions)

## What Apple actually recommends

### Test pyramid and cadence

Apple recommends a pyramid: many fast, isolated unit tests; fewer integration tests; and UI tests covering common user tasks. It also distinguishes three cadences: focused tests during development, all affected-target tests before integration, and complete multi-configuration suites on a schedule. [Apple: Testing](https://developer.apple.com/documentation/xcode/testing), [Apple: Running tests and interpreting results](https://developer.apple.com/documentation/xcode/running-tests-and-interpreting-results)

For Zenbu this means:

- Logic and deterministic data-contract tests: automatic on every pull request.
- Critical user journeys and accessibility smoke: automatic on every pull request.
- Full UI suite: automatic before merge, not merely before release. Zenbu already has extensive UI regressions and the product's prior failures were user-visible search and presentation failures.
- Device/configuration breadth and repetitions: automatic nightly because the extra destinations and repeated runs cost more time.
- Physical device and assistive-technology behavior: manual before release.

### Accessibility audits

`XCUIApplication.performAccessibilityAudit(for:)` audits the current screen using the same mechanism as Accessibility Inspector and automatically fails the UI test when it finds an issue. Apple says to audit **each screen** needed to cover every workflow, including materially different states such as first launch, empty content, populated content, and creation flows. [Apple: Performing accessibility audits](https://developer.apple.com/documentation/accessibility/performing-accessibility-audits-for-your-app)

The iOS audit API supports:

- contrast
- element detection
- hit region
- sufficient element description
- Dynamic Type
- clipped text
- traits

[Apple: `XCUIAccessibilityAuditType`](https://developer.apple.com/documentation/xcuiautomation/xcuiaccessibilityaudittype)

An accessibility test that checks only `.contrast` is therefore a useful targeted regression test, but it is not an accessibility acceptance suite.

Apple also states that clearing all automated audit findings does **not** guarantee an accessible app. Teams must test main tasks with assistive technologies such as VoiceOver, Voice Control, Switch Control, and Assistive Access. VoiceOver testing requires a physical device because VoiceOver is not available in Simulator. [Apple: Performing accessibility testing](https://developer.apple.com/documentation/accessibility/performing-accessibility-testing-for-your-app)

### Test plans, configurations, and repetitions

Apple describes test plans as the way to separate a fast module plan from a complete pre-App-Store plan and to run the same suite under multiple configurations. Test plans can define languages/regions, environment, screenshots and attachments, failure diagnostics, random or alphabetical order, timeouts, repetition policies, code coverage, sanitizers, and memory guards. [Apple: Organizing tests into test plans](https://developer.apple.com/documentation/xcode/organizing-tests-to-improve-feedback)

Apple provides explicit repetition modes (fixed count, until failure, or until success) and runner relaunch controls. Repeated execution is a diagnostic for reliability, not a license to accept a flaky test: a required gate should fail on the first failure. [Apple: Running tests and interpreting results](https://developer.apple.com/documentation/xcode/running-tests-and-interpreting-results)

Each command-line test run creates an `.xcresult` containing results, logs, screenshots/attachments, and coverage when enabled. That result bundle should be uploaded even on failure so the failure can be investigated. [Apple: Running tests and interpreting results](https://developer.apple.com/documentation/xcode/running-tests-and-interpreting-results)

### Xcode Cloud

Xcode Cloud supports branch changes, pull-request changes, tags, and schedules as start conditions. It supports build, test, analyze, and archive actions, and can require an action to pass. Test actions use `build-for-testing` and then `test-without-building`; their test products and result bundles are saved as artifacts. Multiple test destinations are supported, with higher destination counts increasing execution time. [Apple: Xcode Cloud workflow reference](https://developer.apple.com/documentation/xcode/xcode-cloud-workflow-reference), [Apple: Configuring workflow actions](https://developer.apple.com/documentation/xcode/configuring-your-xcode-cloud-workflow-s-actions)

Apple's corporate example uses multiple workflows: unit tests on every change, longer tests weekly, nightly internal builds, and periodic QA distributions. Apple's solo-developer example uses branch tests plus a tag-triggered matrix/archive/TestFlight workflow. [Apple: Developing a workflow strategy](https://developer.apple.com/documentation/xcode/developing-a-workflow-strategy-for-xcode-cloud)

Xcode Cloud keeps build information and artifacts for only 30 days. Apple specifically says to download and archive artifacts for App Store releases so symbols remain available for crash diagnosis. [Apple: Configuring your first Xcode Cloud workflow](https://developer.apple.com/documentation/xcode/configuring-your-first-xcode-cloud-workflow)

For a distribution workflow, Apple says to restrict workflow editing, use a clean build environment, configure an archive action, choose **TestFlight and App Store** (not Internal Testing Only) for an App-Store-eligible binary, and include comprehensive tests either in the release workflow or in another required workflow. [Apple: Creating a distribution workflow](https://developer.apple.com/documentation/xcode/creating-a-workflow-that-builds-your-app-for-distribution)

### GitHub Actions and merge enforcement

GitHub-hosted macOS runners are ephemeral VMs. Current standard private-repository choices include Intel macOS runners with 4 CPUs/14 GB RAM/14 GB SSD and Apple-silicon runners with 3 M1 CPUs/7 GB RAM/14 GB SSD. The `macos-latest` label is GitHub's latest stable image, not necessarily Apple's newest OS, so enterprise workflows should pin a tested macOS/Xcode combination and update it intentionally. [GitHub: GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [GitHub: Choosing a runner](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job)

GitHub concurrency groups can cancel superseded pull-request runs. Release workflows should use a separate concurrency group and should **not** cancel an in-progress signed release. [GitHub: Control workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

GitHub branch protection can require checks, require the branch to be current with its base, require pull-request review and conversation resolution, prevent deletion/force push, and apply the rules to administrators. Required job names must be unique across workflows. [GitHub: About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

Workflow artifacts are the right place for `.xcresult`, logs, screenshots, coverage, and diagnostic files. GitHub defaults to 90-day artifact/log retention; private repositories can configure up to 400 days. Dependency caches are different from evidence artifacts, are evicted after seven days without access by default, and must never contain secrets. [GitHub: Workflow artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts), [GitHub: Artifact retention](https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization), [GitHub: Dependency caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)

Enterprise workflow security should set `permissions: contents: read` by default, grant extra permissions only to the job that needs them, and pin third-party actions to full commit SHAs. [GitHub: Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)

## Zenbu's current baseline

Verified in this checkout on 2026-08-21:

- Branch: `fix/app-review-readable-typography`, commit `9805c328d84131d7acfd0cdc5e29687ba80933e6`.
- Xcode 26.0 (`17A324`) and iOS 26.0 runtime (`26.0.1`) are installed.
- The app's deployment target is iOS 26.0 and its targeted device family is iPhone.
- The shared `ZenbuJapanese` scheme includes app unit/integration tests and UI tests, but has no committed `.xctestplan`.
- Both test targets are currently marked nonparallelizable in the scheme.
- The repository contains 107 named XCTest methods: 29 module tests and 78 journey UI tests. One camera-capture acceptance test intentionally skips in Simulator and names the physical-device fixture boundary.
- The new accessibility suite audits Search root, populated Search results, and Word Detail in light and dark appearances, but requests only `.contrast`.
- The theme suite mathematically checks seven important foreground/background token pairs in light and dark modes.
- The only GitHub Actions workflow is the monthly language-data upstream check. There is no iOS build/test workflow.
- GitHub reports that `main` is not branch protected. The only visible repository ruleset is an enterprise deploy-key policy.
- `apps/ios/Tools/audit_release_privacy.sh` already provides a strong source/archive boundary: privacy manifest, prohibited network/dependency patterns, bundled language artifacts, retrieval fixtures, release-only content, credentials, architecture, linked dependencies, signing, entitlements, and archive identity.

The gap is therefore not lack of tests. It is lack of **automatic orchestration, breadth, evidence retention, and merge enforcement**.

## Proposed test plans

Commit four explicit plans under `apps/ios/TestPlans/` and attach them to the shared scheme:

### 1. `ZenbuPR.xctestplan`

Purpose: required presubmission gate.

- All module tests.
- All journey UI tests on the canonical destination.
- Accessibility audits for the critical reviewer-reachable screen/state set.
- English / `en_US`, deterministic fixture data, fixed test order initially.
- Test timeouts enabled.
- Failure diagnostics and UI screenshots retained.
- Code coverage for app-owned modules.
- No retry-on-failure. A failure is a failure.
- UI execution serialized until the suite proves it is isolated; module tests may be parallelized after a clean repeated-run qualification.

### 2. `ZenbuAccessibility.xctestplan`

Purpose: accessibility correctness across every public screen/state.

- `performAccessibilityAudit(for: .all)` on every stable public screen/state where `.all` is supported.
- Separate named journeys for light and dark appearance.
- Explicit configurations for default size and an accessibility Dynamic Type size.
- Do not use a broad issue handler that suppresses findings. A narrow exception must name the exact element, audit type, reason, owner, and expiry issue.
- Keep screenshots for every audited state, not just failures, on release runs.

Minimum screen/state inventory:

1. Search: empty, live results, no match, lookup error, romaji refinement.
2. Word Detail: common entry, homograph/alternatives, note editing, long content.
3. Example Sentences: populated, scrolled, linked-word navigation.
4. Conjugations: ichidan, godan, irregular, adjective.
5. Kanji Detail: standard, multiple readings, classification, related-word navigation.
6. Stroke Order: idle, playing/paused, long diagram, error/retry.
7. Radical Search: empty, selected radicals, candidate results.
8. Handwriting: empty canvas, candidates, no-candidate recovery.
9. Image Text: picker entry, recognized content, nested word, empty/error recovery.
10. Search History: populated, delete, clear confirmation.
11. Settings/Sources: dictionary attribution, privacy, support.

This inventory follows Apple's instruction to audit every screen required by every workflow; it is not based on a desired percentage.

### 3. `ZenbuNightly.xctestplan`

Purpose: breadth and nondeterminism detection.

- Complete module, UI, and accessibility plans.
- Randomized order where state isolation permits.
- Three fixed repetitions with a fresh test runner per repetition.
- Main Thread Checker enabled.
- Separate diagnostic configurations for Address Sanitizer and Thread Sanitizer; do not combine incompatible sanitizers.
- Coverage collected in the normal configuration, not performance runs.
- The first failure fails the workflow; repetitions are not “retry until pass.”

### 4. `ZenbuPerformance.xctestplan`

Purpose: stable search/launch performance baselines.

- Release configuration with debugger off.
- Coverage and sanitizers off, as Apple recommends for accurate performance measurement.
- Focused performance tests for cold launch, romaji search, multi-word search, Japanese search, opening Word Detail, and opening Examples.
- Simulator trends are useful for regression detection, but release performance claims require the same flow on physical hardware.

[Apple: Writing and running performance tests](https://developer.apple.com/documentation/xcode/writing-and-running-performance-tests)

## Exact trigger and destination matrix

| Workflow / check | Trigger | Required for merge/release? | Destination/configuration | Contents | Evidence |
|---|---|---:|---|---|---|
| `repo-contracts` (GitHub Actions) | Every PR to `main`; push to `main` | Merge | Ubuntu | Shell tests for release audit tooling, metadata/data validators that do not require Xcode, workflow lint | Logs and compact reports, 30 days |
| `ios-pr` (Xcode Cloud) | Every PR to `main`; auto-cancel older run for same PR | Merge | iPhone 17 Pro Max, iOS 26, Xcode 26 pinned | `ZenbuPR`; `audit_release_privacy.sh source`; warnings/analyzer treated by an explicit policy | `.xcresult`, screenshots, coverage, logs, 30 days in Xcode Cloud and mirrored to GitHub/release storage |
| `ios-main` (Xcode Cloud) | Every push to `main` | Main health | iPhone 17 Pro Max, iOS 26, Xcode 26 pinned | `ZenbuPR`; Analyze action | `.xcresult`, analyzer output, logs |
| `ios-accessibility-nightly` (Xcode Cloud) | Daily at 03:17 Asia/Tokyo (18:17 UTC on the previous calendar day); manual start | Main health; unresolved failure blocks release | Matrix: iPhone 17 Pro Max + iPhone SE (3rd generation), iOS 26 | `ZenbuAccessibility`, all audit types, light/dark, default/accessibility text size | `.xcresult` and all-state screenshot inventory |
| `ios-reliability-nightly` (Xcode Cloud) | Daily after accessibility | Main health; unresolved failure blocks release | iPhone 17 Pro Max, iOS 26 | `ZenbuNightly`, three repetitions, separate ASan/TSan configurations | Per-repetition `.xcresult`, failure diagnostics, flake issue on any intermittent failure |
| `ios-performance-weekly` (Xcode Cloud plus physical baseline) | Weekly and manual | Trend gate; regression blocks release | Simulator iPhone 17 Pro Max; physical iPhone 14 baseline | `ZenbuPerformance`; focused ETTrace/Instruments investigation only after a threshold breach | Metrics, baseline deltas, symbolicated trace when investigated |
| `ios-release-candidate` (Xcode Cloud) | Protected `release/*` branch or signed `release-*` tag; manual start permitted | Release | Clean environment, generic iOS device archive; tests on iPhone 17 Pro Max | Required upstream green checks; full `ZenbuPR`; Analyze; archive; signed-candidate privacy audit; App-Store-eligible export; TestFlight distribution | Signed `.xcarchive`, dSYMs, IPA checksum, audit log, `.xcresult`; copied outside Xcode Cloud before 30-day expiry |
| `physical-release-acceptance` (human) | Each candidate after TestFlight processing | Release | Physical iPhone 14 on supported current iOS; installed TestFlight binary | Main tasks, camera/photo picker, cold launch, light/dark, accessibility text size, VoiceOver screen-curtain journey; Voice Control/Switch Control/Assistive Access matrix | Signed checklist with build number, device/OS, PASS/FAIL/UNCLEAR and screenshots/recording |
| `app-review-submit` (human-authorized automation) | Only after candidate and HIL approval | Submission | Exact approved TestFlight/App Store build | Verify build ID/version/build number, App Store eligibility, metadata/privacy/submission health; dry-run; explicit submission authorization | Submission ID and App Store state |

Why these destinations:

- iPhone 17 Pro Max exactly matches the rejected review environment and is the canonical PR/release simulator.
- iPhone SE (3rd generation) supplies the narrowest supported layout available in the installed iOS 26 Simulator runtime. Zenbu's minimum is currently iOS 26, so an OS-version matrix would add no coverage today.
- Physical iPhone 14 remains a separate hardware boundary for camera, speech, performance feel, and VoiceOver. Simulator is not relabeled as device proof.

When Zenbu lowers its deployment target or iOS 27 becomes supported, add `minimum supported iOS` and `latest released iOS` as distinct nightly/release destinations. Do not use a beta Xcode/OS as a required release gate; run beta compatibility as nonblocking until the toolchain is released.

## Required merge policy

Create a `main` ruleset with:

- Pull request required.
- One approving human review required for product/release changes.
- Dismiss stale approvals when new commits arrive.
- Require conversation resolution.
- Require strict, current-branch status checks:
  - `repo-contracts`
  - `ios-pr / ZenbuPR`
- Block force pushes and deletion.
- Apply rules to administrators; emergency bypass must be auditable and create a follow-up incident issue.
- Use unique, stable job names.

Do not make nightly checks directly required for every merge because scheduled checks do not map cleanly to each pull-request head SHA. Instead, an unresolved nightly failure marks `main` unhealthy and blocks release until diagnosed. Any defect found nightly must become a deterministic presubmission regression test when practical.

## Flake policy

An enterprise suite cannot treat “passed on retry” as green.

- Required PR/release workflows: no automatic retry-until-pass.
- Infrastructure failure may be rerun once, but the rerun is recorded and must be clearly classified as infrastructure, not product.
- A test that fails in any nightly repetition creates or updates one issue with the failing test, seed/order, destination, build SHA, result bundle, and frequency.
- A quarantined test remains visible and non-green in a dedicated quarantine check. Quarantine requires owner, reason, and deadline; it is never silently skipped.
- UI tests must reset app state and avoid assumptions about an existing simulator. Apple's Xcode Cloud guidance emphasizes fresh simulators and thorough setup/teardown. [Apple: Author fast and reliable tests for Xcode Cloud](https://developer.apple.com/videos/play/wwdc2022/110361/)

## Evidence and retention policy

- Always generate an explicitly named `.xcresult` path.
- Upload `.xcresult` on success and failure.
- Keep PR evidence 30 days.
- Keep `main` and nightly evidence 90 days.
- Keep release candidate `.xcresult`, signed archive, dSYMs, export manifest, checksums, source SHA, test-plan names/configurations, and App Store build ID for at least 400 days in the private GitHub repository's release-evidence storage or longer-term secured artifact storage.
- Do not commit archives, IPAs, dSYMs, API keys, or distribution logs to Git.
- Do not cache DerivedData as release evidence. Zenbu currently rejects remote package dependencies and bundles its data, so dependency caching offers limited benefit; start without a build cache and add only measured, lockfile-keyed caches later.
- Never put signing keys or credentials in caches or artifacts.

The installed Codex TestFlight playbook independently requires archive success, upload success, App Store processing visibility, correct encryption metadata, and external/App-Store eligibility (`testFlightInternalTestingOnly` absent or false). It also says not to commit archives, IPAs, API keys, or distribution logs. That aligns with the release workflow above.

## Release gate: automatic versus manual

### Automatic and blocking

- Exact source SHA is on a protected release branch/tag.
- Required PR/main tests are green.
- Full simulator regression and full accessibility audit matrix are green.
- Source privacy/data audit passes.
- Analyze action passes under the agreed warning policy.
- Clean Release archive succeeds.
- Signed-candidate audit proves bundle identity, privacy manifest, packaged data, no prohibited debug/test material, code signature, entitlements, and dependency boundary.
- Export is explicitly App Store eligible, encryption metadata is correct, upload succeeds, and App Store Connect reports the expected build as `VALID`.
- Candidate artifacts and checksums are retained.

### Manual and blocking

- Confirm the visible candidate is Zenbu Japanese with bundle `com.zenbujapanese.dictionary`, not an old Nihongo install or unrelated simulator artifact.
- Install the exact processed TestFlight build on the physical iPhone 14.
- Complete the main user journeys with touch in light and dark mode.
- Complete the critical journey using VoiceOver with screen curtain.
- Exercise camera/photo-library permission and real-hardware paths.
- Check the largest accessibility text size for clipping, truncation, navigation, and task completion.
- Record PASS/FAIL/UNCLEAR against build number and device/OS.
- A human explicitly approves App Review submission.

The installed iOS debugging skill reinforces the identity rule: discover the exact booted simulator, pin project/scheme/UDID, verify that the build launched using UI description or screenshot, and confirm the bundle ID if uncertain. The performance and leak skills similarly require the exact flow, app build, device/simulator, comparable before/after capture, symbolication, and artifact paths; they prohibit claiming a fix from ambiguous evidence.

## Implementation plan

### Tier 0 — before build 12 resubmission

1. Commit the four test plans and make `ZenbuPR` the scheme default.
2. Expand the current audit beyond `.contrast` to `.all`, adding stable issue handling only for individually documented false positives.
3. Cover the complete reviewer-reachable path in both appearances and add the screens directly implicated by the color-token change.
4. Run `ZenbuPR` locally on iPhone 17 Pro Max and retain the `.xcresult`.
5. Run the physical iPhone 14 release checklist including VoiceOver.
6. Audit camera-source actions and the revealed recent-search Delete action in light mode.
7. Only then archive/upload build 12 and resubmit.

### Tier 1 — immediately after the rejection repair

1. Add `repo-contracts` GitHub Actions workflow with least privilege and actions pinned to full SHAs.
2. Configure the Xcode Cloud `ios-pr` and `ios-main` workflows with Xcode 26/iOS 26 pinned.
3. Enable the `main` ruleset and required checks only after each new check has successfully reported at least once.
4. Upload `.xcresult` and screenshot artifacts on failure and success.

### Tier 2 — enterprise hardening

1. Complete the 11-area accessibility screen/state inventory.
2. Add the nightly compact/large device matrix.
3. Add diagnostic configurations and three-run reliability detection.
4. Add flake issue automation and dashboards for duration, failure rate, and slowest tests.
5. Establish weekly performance baselines and threshold ownership.

### Tier 3 — controlled delivery

1. Configure the clean, restricted-editing Xcode Cloud release workflow.
2. Store signing credentials only in Apple-managed signing or redacted secret storage.
3. Download every release archive/dSYM/result bundle before Xcode Cloud's 30-day expiry.
4. Require TestFlight/HIL approval before the submission automation can run.
5. Keep automatic App Store release-after-approval as a separate product decision from automatic build/upload.

## Acceptance criteria for the CI implementation

The CI project is complete only when all of these are demonstrated:

- A deliberately failing theme contrast test blocks a pull request.
- A deliberately failing UI accessibility audit blocks a pull request and preserves its screenshot/result bundle.
- A superseded PR run cancels without canceling a release run.
- `main` cannot be updated with failed or missing required checks, including by an administrator without an audited bypass.
- Nightly runs exercise both device sizes and preserve per-destination evidence.
- An intermittent failure is reported as a failure, not converted to green by retry.
- A release archive built in a clean environment passes the signed-candidate audit.
- The exact TestFlight build is verified on physical iPhone 14 with VoiceOver and real camera/photo-library paths.
- Release artifacts and dSYMs are retrievable after the Xcode Cloud copy would have expired.
- App Review submission still requires explicit human authorization.

## Bottom line

Best practice is **automatic by default, manual where automation cannot prove the experience**. Zenbu's logic, journeys, color contracts, and screen audits should run automatically and block integration. Physical hardware, VoiceOver task completion, visual judgment, camera behavior, and final submission authorization remain human release gates. Neither layer is allowed to impersonate the other.
