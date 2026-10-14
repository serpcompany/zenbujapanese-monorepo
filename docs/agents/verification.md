# Verifying a change

How much to check and when, how to wait, what evidence a change needs, which ports, Simulator,
and build folder a checkout uses, and which version of each toolchain everything builds with. The rules are SERP's
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
| A service's route, answer, configuration, or startup | The `verify-service` skill: the service started from this checkout, the routes the change touches called, and each answer kept ([`dictionary-api.md`](dictionary-api.md), [`account-api.md`](account-api.md)). |
| A deploy workflow, routing, the server, or a smoke test | The deploy to staging and its smoke test ([`ci-deploys.md`](ci-deploys.md)). |
| The server's deployer (`deploy/deployer.sh`) | Its tests, which run the script itself against stand-ins, with a bash of 4.4 or later ([`deployer-alerts.md`](deployer-alerts.md), Tests). A change reaches the server only when an owner installs it there, so the pull request says it hasn't run on the server. |

Proof goes under `tmp/agent/verify/<date>-<what>/`, which git ignores and housekeeping keeps:
screenshots, recordings, result bundles, and the run's state. Show the owner the working change
before polishing the evidence, and take screenshots once, after their changes.

## This checkout's ports

Two worktrees that serve on one port test each other's code: Playwright reuses a server it finds
there. `tools/checks/ports.mjs` hands each checkout its own, and `pnpm -w ports` prints them,
from any folder:

| Role | Main checkout | A worktree | Used by |
| --- | --- | --- | --- |
| `site` | 3000 | the first port of its block, such as 21010 | `pnpm dev` in `apps/web` |
| `e2e` | 3100 | the next, 21011 | The server the browser tests start (`apps/web/playwright.config.ts`) |
| `preview` | 8787 | 21012 | `pnpm preview`, and the browser tests on the production build |
| `dictionary` | 8788 | 21013 | `pnpm dev` in `apps/dictionary-api`, the `verify-service` skill, and the rendered-page gate (`apps/web/vitest.config.ts`) |

- **The main checkout** keeps the ports the docs name. So does a CI runner, whose checkout is
  the main one, though its browser tests ask the same script.
- **A git worktree** claims a block of ten ports the first time anything asks: a file under the
  repository's `.git/zenbu-ports/` that names the worktree. `pnpm -w ports delete` gives the block
  up when the work is finished, and `pnpm -w ports prune` those of worktrees that are gone, which the
  next claim does too.
- **Read the address rather than assume it.** `pnpm dev` prints its own, and a command that
  needs one takes it from `pnpm -w ports`.
- **A `PORT` set in the shell wins,** and so does one in the dictionary service's `.env`. A
  server on its port already fails the next one to start, rather than sharing it.
- **The account service is one per machine,** on port 8789, with one database: the website's
  build names its address (`apps/web/wrangler.jsonc`). It trusts the sites its
  `ACCOUNT_API_TRUSTED_ORIGINS` names, so name this checkout's `site` and `e2e` addresses there
  ([`web.md`](web.md), Account pages). Giving each checkout its own is in
  [`harness-debt.md`](../harness-debt.md).

The script is tested in `tools/checks/src/ports.test.ts`.

## This checkout's Simulator and build folder

One Mac runs several agents and projects, so nothing uses `booted`, a default device, or a
Simulator another checkout made. `apps/ios/Tools/simulator.py` hands out what this checkout uses:

| Command | Gives |
| --- | --- |
| `python3 apps/ios/Tools/simulator.py` | The UDID of this checkout's iPhone Simulator, made when it's missing: the newest iPhone Pro Max, on the newest installed iOS the selected Xcode runs |
| `python3 apps/ios/Tools/simulator.py --device ipad` | The same for its iPad Simulator, the newest iPad Pro 13-inch |
| `python3 apps/ios/Tools/simulator.py derived-data` | This checkout's build folder, for `-derivedDataPath` |
| `python3 apps/ios/Tools/simulator.py boot` | Starts this checkout's Simulator when it isn't up (`--device ipad` for the iPad), waits for the boot and for the Mac to be calm again, and sets a keeper on it |
| `python3 apps/ios/Tools/simulator.py shutdown` | Shuts down this checkout's Simulators now |
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
- **Run `delete` when the work is finished.** A Simulator with the app installed is about 3 GB,
  and a build folder 2 GB with the Simulator's build and nearly 4 GB with the Mac's too.
- **Xcode** is the one `.xcode-version` names (Toolchain versions, below). Where another Xcode
  is the default, set `DEVELOPER_DIR` to the pinned one's `Contents/Developer`.
- **Bundle identifiers.** The UI tests install the app as `com.zenbujapanese.dictionary.uitests`
  and Zenbu Dev as `com.zenbujapanese.dictionary.dev`, each apart from an installed Zenbu. A plain
  Debug build keeps the release identifier, where SERP's standard gives Debug a `.debug` suffix:
  Apple's sign-in token names the bundle ID and the account service takes only the release one, so
  a suffixed build can't sign in with Apple ([`ios.md`](ios.md), Account and sync).
  `apps/ios/Tools/tests/test_account_service_settings.py` holds both configurations to it.

The script is tested in `apps/ios/Tools/tests/test_simulator.py`, and the `iOS` workflow makes its
Simulators with it, so CI runs the device models agents do.

## Who boots a Simulator and who shuts it down

A boot costs one to three minutes before a test can start, so a Simulator stays up between the
runs of one piece of work. An idle one holds memory other agents need (two once held 12 GB of
swap, and this Mac has frozen for want of memory), so nothing stays up unwatched:

- **`simulator.py boot` boots, and nothing else does.** The `verify-app` script calls it, and so
  does anyone before a command that needs the Simulator up, such as the package's tests. It
  does nothing to a Simulator that is up. After a boot it waits for `simctl bootstatus` (13 to
  41 seconds on this Mac) and then for the processors to be at least half idle in two 2-second
  samples running (`iostat`), up to two minutes: a fresh boot keeps all four cores busy for
  about 35 seconds after `bootstatus` returns, longer when other work is running, and tests
  started then fail at launch. The one-minute load average is no measure of this: it is an
  average that takes minutes to fall after the work has stopped, which is why waiting for it
  cost three to five minutes a boot.
- **A checkout keeps one Simulator up.** Booting the iPad shuts down this checkout's iPhone
  Simulator, and the reverse, unless something is using it.
- **The run that ends the work shuts it down.** The `verify-app` script shuts the Simulator down
  when its tests end, unless `--keep` leaves it up for the next run. After the last run, or
  after working with it by hand, `simulator.py shutdown` stops this checkout's.
- **A keeper stops a forgotten one.** `boot` leaves a small process watching the Simulator. It
  shuts the Simulator down once no `xcodebuild` has named it for 10 minutes, and at once when
  nothing is using it and the Mac is short of memory (under 40% free, or over 2,000 MB of
  swap). It never stops a Simulator in use. `boot` again counts as use. Its one line saying why
  is in `~/Library/Caches/com.zenbujapanese.build/SimulatorKeepers/<udid>.log`.
- **A Simulator booted any other way** (`simctl boot`, Xcode, a tool) has no keeper and stays up
  until someone shuts it down. Run `simulator.py boot` on it, which does nothing but set one.

## Toolchain versions

Each toolchain's version is in one file, which the workflows read, so a run here and a run in CI
build with the same one. Build with it here too.

| Toolchain | Where its version is |
| --- | --- |
| Node | `.node-version`. The services' images name an exact release of it in each `Dockerfile`, and each `package.json` asks for it or later. |
| pnpm | `packageManager` in the root `package.json` |
| Python | `.python-version`, for the language-data pipeline and the data tools' tests in CI. Ruff targets it (`ruff.toml`). The app's tools also run on a Mac's own `python3`, as the `iOS` workflow's `swift` job runs them. |
| Xcode | `.xcode-version`, which the `iOS` workflow's `swift` job selects |

`tools/checks/src/workflow-rules.test.ts` holds the workflows, the images, and the packages to
these files, and a change to one starts the workflows that read it.
