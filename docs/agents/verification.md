# Verifying a change

How much to check and when, how to wait, what evidence a change needs, and which Simulator and
build folder a checkout uses. The rules are SERP's
[Verification Cadence](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/verification-cadence.md)
and [Simulators](https://github.com/serpcompany/serp/blob/main/docs/engineering/technology/simulators.md)
standards; this doc holds this repository's commands for them.

## Three levels

| Level | When | What runs |
| --- | --- | --- |
| Inner loop | While editing | The edit hook checks each file as it's written, and the stop hook the whole change before a turn ends ([`code.md`](code.md), Checks). Beside them, the touched part's typecheck and the tests for the changed code, below. |
| Push | Before each push for review | `pnpm check` in each package the change touched. The `pre-push` hook runs `pnpm verify`. |
| Finish gate | Once, on the finished tree | `pnpm check` from the root, then the evidence the change needs. The `finish-change` skill walks through it. |

The inner loop, by part:

| Part | Run |
| --- | --- |
| A pnpm package | `pnpm --filter <package> typecheck`, and `pnpm --filter <package> exec vitest related --run <files>` with paths from the package's folder. The packages are `zenbujapanese-web`, `zenbujapanese-dictionary-api`, `zenbujapanese-account-api`, `@zenbu/dictionary-core`, `@zenbu/node-service`, and `zenbujapanese-checks`. |
| The checks | `pnpm verify <checks> <paths>` runs some checks on some paths, such as `pnpm verify sizes,comments apps/web/src`. |
| The app's package | From `apps/ios/Modules`, one suite on this checkout's Simulator: `xcodebuild -scheme ZenbuJapaneseModules-Package -destination "platform=iOS Simulator,id=$(python3 ../Tools/simulator.py)" ONLY_ACTIVE_ARCH=YES -only-testing:SearchExperienceTests/<Suite> test` |
| The app's screens | The UI tests that cover the change: the `verify-app` skill. |
| The iOS data tools | `python3 -m unittest discover -s apps/ios/Tools/tests -p '<test file>'` |

- **Never use the finish gate as the inner loop.** The root `pnpm check` builds the site and runs
  every package's tests.
- **Run the finish gate once per tree.** If nothing changed since the last green run, cite it.
- **CI on the final commit is the record** of what CI runs. It doesn't run the app's tests on a
  Simulator or the Mac while `IOS_SWIFT_TESTS` is off ([`ci.md`](ci.md), iOS), so a change under
  `apps/ios` runs the package's tests and the UI tests it touches here, on the final commit, and
  the pull request cites them.
- **A fix re-runs what it could have broken:** the check that failed and the tests for the changed
  code, not every suite again.
- **A test that fails once and passes the next time is a failing test.** Fix it.

## Waiting

- Anything that can take more than a couple of minutes runs in the background with its output in
  a file: UI suites, the website's browser tests, the root `pnpm check`, CI, deploys.
- No foreground `sleep` loops and no foreground `gh pr checks --watch`. One background watcher per
  wait, or the harness's completion notice.
- Before starting a run again, look for the one already running (`pgrep -lf playwright`,
  `pgrep -lf xcodebuild`): two runs on one dev server, or two `xcodebuild` on one Simulator, fail
  each other.
- Don't change files a running check reads, and run nothing else heavy during a UI suite: on a
  busy Mac its taps miss.
- With nothing else to do, hand back with the status and what is being waited for.

## Evidence

A pull request reports each level it reached, apart: build, automated tests, UI tests, the
installed or deployed thing, and the owner's acceptance. A lower level never proves a higher one.
Every change has build and tests, from the finish gate or CI. Beyond that:

| Change | Needs |
| --- | --- |
| A page, component, route, redirect, or header of the website | The `verify-web` skill: each changed page at desktop and phone widths, and redirects and headers on `pnpm preview`. What should keep working becomes a browser test (the `browser-tests` skill). |
| A screen or flow of the app | The `verify-app` skill: the UI tests that cover it, on this checkout's iPhone and iPad Simulators, and on the Mac when the change differs there. |
| What a Simulator can't show: the camera, Apple Translation, live speech, a real sign-in | A run on a device ([`ios.md`](ios.md), Install on an iPhone), or the pull request says it wasn't checked. |
| A service's route | The service run locally and the route called ([`dictionary-api.md`](dictionary-api.md), [`account-api.md`](account-api.md)). |
| A deploy workflow, routing, the server, or a smoke test | The deploy to staging and its smoke test ([`ci-deploys.md`](ci-deploys.md)). |

Proof goes under `tmp/agent/verify/<date>-<what>/`, which git ignores and housekeeping keeps:
screenshots, recordings, result bundles, and the run's state. Show the owner the working change
before polishing the evidence, and take screenshots once, after their changes.

## This checkout's Simulator and build folder

One Mac runs several agents and projects, so nothing uses `booted`, a default device, or a
Simulator another checkout made. `apps/ios/Tools/simulator.py` hands out what this checkout uses:

| Command | Gives |
| --- | --- |
| `python3 apps/ios/Tools/simulator.py` | The UDID of this checkout's iPhone Simulator, made when it's missing: the newest iPhone Pro Max, on the newest installed iOS the selected Xcode runs |
| `python3 apps/ios/Tools/simulator.py --device ipad` | The same for its iPad Simulator, the newest iPad Pro 13-inch |
| `python3 apps/ios/Tools/simulator.py derived-data` | This checkout's build folder, for `-derivedDataPath` |
| `python3 apps/ios/Tools/simulator.py delete` | Removes this worktree's Simulators and build folder |
| `python3 apps/ios/Tools/simulator.py prune` | Removes those of every worktree that is gone, passing over a worktree with a Simulator still running |

- **The main checkout** gets the app's own Simulators, `zenbu-japanese` and `zenbu-japanese-ipad`.
  They are long-lived and hold setup done by hand, so `delete` refuses them.
- **A git worktree** gets its own, named for its folder: `zenbu-japanese--<worktree>` and
  `zenbu-japanese-ipad--<worktree>`. Two agents in one checkout each set `ZENBU_SIMULATOR_SCOPE`,
  as `<issue>-<agent>`; `prune` takes such a scope once its Simulators are shut down.
- **Name the UDID in every command:** each `xcodebuild -destination`, each `simctl` call, and each
  Simulator tool call. With XcodeBuildMCP, `session_set_defaults` takes it as `simulatorId`, and
  the build folder as `derivedDataPath`.
- **Build folders** are in `~/Library/Caches/com.zenbujapanese.build/DerivedData/`, one per
  checkout, and are kept between builds. After a source change run `build-for-testing` again:
  `test-without-building` runs the last build. Clean one only when a build is broken.
- **Shut a Simulator down when a run ends,** and run `delete` when the work is finished. A
  Simulator with the app installed is about 3 GB, a build folder 2 GB with the Simulator's build
  and nearly 4 GB with the Mac's too, and an idle booted Simulator slows every other run.
- **Xcode** is pinned in `.xcode-version`, which the `iOS` workflow's `swift` job selects. Build
  with that version here too; where another Xcode is the default, set `DEVELOPER_DIR` to the
  pinned one's `Contents/Developer`.
- **Bundle identifiers.** The UI tests install the app as `com.zenbujapanese.dictionary.uitests`
  and Zenbu Dev as `com.zenbujapanese.dictionary.dev`, each apart from an installed Zenbu. A plain
  Debug build keeps the release identifier, where SERP's standard gives Debug a `.debug` suffix:
  Apple's sign-in token names the bundle ID and the account service takes only the release one, so
  a suffixed build can't sign in with Apple ([`ios.md`](ios.md), Account and sync).
  `apps/ios/Tools/tests/test_account_service_settings.py` holds both configurations to it.

The script is tested in `apps/ios/Tools/tests/test_simulator.py`, and the `iOS` workflow makes its
Simulators with it, so CI runs the device models agents do.
