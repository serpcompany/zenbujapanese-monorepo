---
name: verify-app
description: Check a change to the Zenbu Japanese app in the running app on iPhone, iPad, or the Mac. Gets this checkout's own Simulator and build folder (apps/ios/Tools/simulator.py), builds the app for testing, runs the UI tests that cover the behavior, or a new one that walks a path none covers, and keeps the result bundle, a screen recording, and screenshots under tmp/agent/verify/. Use after changing a screen or flow under apps/ios, and to reproduce an app bug before fixing it.
---

# Check an app change in the running app

The app's UI tests (`apps/ios/UITests/`, XCUITest) launch the built app and drive it the way a
user does, so driving a feature here means running the UI tests that cover it, or writing one.
What should keep working stays a UI test; this skill is the look taken while working and before a
pull request.

One Mac runs several agents. Every command names this checkout's own Simulator, which
`apps/ios/Tools/simulator.py` prints: never `booted`, a default device, or a Simulator another
checkout made (`docs/agents/verification.md`).

## 1. Find what covers the behavior

The feature map is the app's product docs: `apps/ios/docs/product/index.md` and the docs it links.
Each behavior's `Check:` line names its UI tests, as `Class.test`, and its package tests. A
behavior with no UI test gets one in the same change (`docs/agents/ios.md`, Tests on every
platform).

## 2. Run

From the repository root, in the background, since a run takes minutes. Name the run, then the
tests as `Class` or `Class/test`:

```sh
.claude/skills/verify-app/run.sh search SearchUITests/testAnEnglishSearchListsTheWordAndOpensItsDetail
.claude/skills/verify-app/run.sh search-ipad --device ipad SearchUITests
```

The script does each part of a run:

- **Run state.** It makes `tmp/agent/verify/<date>-<name>/` and writes `run.env` there: the run
  folder, the Simulator's UDID, and the build folder. A later command reads them with
  `. tmp/agent/verify/<date>-<name>/run.env`, since a shell keeps no variables between commands.
- **Doctor.** `doctor.txt` says which Simulator, Xcode, and commit the run is on, and how many
  other Simulators are running. Read it before trusting a result: the Simulator's name starts
  with `zenbu-japanese`, Xcode is the version `.xcode-version` pins, and no other Simulator is
  running. Shut down one this checkout left running; another agent's is its own.
- **Launch.** `build-for-testing` into this checkout's build folder. `** TEST BUILD SUCCEEDED **`
  in `build.log` is the ready signal, and a failed build stops the run. The app installs as
  `com.zenbujapanese.dictionary.uitests`, apart from any Zenbu a person installed.
- **Drive.** `test-without-building`, with `-only-testing` for each test named.
- **Proof.** `run.xcresult` (each test's result, and the device), `run.mp4` (the screen for the
  whole run), `shots/` (a screenshot every 3 seconds, the first 150), and `test.log`.
- **Cleanup.** It shuts down the Simulator it booted, and nothing else.

Its exit status is the tests'. A test that fails once and passes the next time is a failing test:
fix it rather than run it again.

## 3. Read the proof

- `grep -a -E "^Test Case .* (passed|failed)" <run>/test.log` lists each test.
- `xcrun xcresulttool get test-results summary --path <run>/run.xcresult` gives the totals and
  the device. `xcrun xcresulttool export attachments --path <run>/run.xcresult --output-path <folder>`
  gives a failed test's screenshot and view hierarchy.
- Look at the screenshots that show the end state. Shrink one before reading it:
  `sips -Z 900 <run>/shots/<time>.jpg --out <file>.jpg`.
- Compare what they show with the behavior's entry in the product docs. A difference with no
  decision on file is a bug; a deliberate change updates the entry in the same pull request.

## A path no test covers

Write the UI test for it: a `ZenbuUITestCase` subclass in `apps/ios/UITests/`, with `launch()`,
`find`, and `assertOnScreen`. To see a screen while working the test out, attach
`XCUIScreen.main.screenshot()` as an `XCTAttachment` whose `lifetime` is `.keepAlways` where the
screen is up, run the test with the script, and export the attachments as above.

## What a Simulator can't show

- **The Mac.** Its UI tests drive the real pointer and keyboard of the desktop. Tell the person at
  the Mac before a run and when it ends, and never start one unannounced. The commands, and
  Automation Mode, are in `docs/agents/ios.md`, Tests on every platform.
- **A device.** The camera, Apple Translation, live speech, and a real Apple or Google sign-in:
  `docs/agents/ios.md`, Install on an iPhone, and the manual checks at its end.

## Report and clean up

Say which tests ran on which device, each result, and the run folder. A check that wasn't run is
reported as not run, not as passed. Git ignores `tmp/agent/verify/`, and housekeeping keeps it.
When the work is finished, `python3 apps/ios/Tools/simulator.py delete` removes this worktree's
Simulators and its build folder.
