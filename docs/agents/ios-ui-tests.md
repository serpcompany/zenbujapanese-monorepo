# How the app's UI tests wait

The app's UI tests (`apps/ios/UITests/`) spend most of their time waiting for the app, so how they
wait decides how long a suite takes and whether a test passes by luck. What the tests cover, the
harnesses they launch the app with, and the commands are in [`ios.md`](ios.md), Tests on every
platform; running a few of them quickly while working is the `verify-app` skill.

## One wait that looks at once

A step goes on the moment what it waits for is true. Every wait is one function, `comesTrue`
(`ZenbuUITestCase.swift`): it looks at once, and when the condition doesn't hold yet it looks
again a tenth of a second later, or as long later as the last look took when that is longer, so a
slow look on a long page can't take the app's main thread from the work being waited for. It
gives up at its limit, and the helpers a test calls all wait through it:

| Helper | Waits for | Limit, and what a failure says |
| --- | --- | --- |
| `waitFor` | The element exists | 90 s; `<element> never appeared` |
| `waitUntil(_:_:)`, `waitUntil(_:mentions:)`, `waitUntilGone` | The element meets a predicate, such as `isEnabled == true` | 90 s; `<element> never met <condition>` |
| `waitUntil("the two lists changing places") { … }` | Anything a closure can read | 90 s; `<what> never happened` |
| `appears(_:within:)` | The same, as an answer, for a step that may be tried again | The caller's: a third of the 90 s for a retried tap |
| `assertOnScreen`, `firstReachable`, `tap`, `tap(_:toShow:)`, `focus`, `type`, `name`, `open`, `choose`, `reveal`, `waitForSheet` | What each needs before it acts or measures | 90 s, or a third of it for each try of a retried step |

The 90 seconds is `patience`; `TEST_RUNNER_ZENBU_UI_TEST_PATIENCE=30` on the `xcodebuild` command
shortens every wait, for an idle Mac. A passing test never runs to a limit, so the limit costs it
nothing. A wait that holds at its first look leaves only that lookup in `test.log`; one that has
to wait is a step named `Wait up to 90s for …` with its looks under it, so a slow test's log says
what it waited for and for how long.

## Rules for a test

- **Never call XCUITest's own waits:** `waitForExistence`, `waitForNonExistence`,
  `XCTNSPredicateExpectation`, `XCTWaiter`, and `waitForExpectations`. Each takes a full second
  before its first look whether or not the element is there. In 8,009 of them measured on 2026-10-13
  the first look came 1.00 to 3.01 seconds in, 96% found their element at that look, and those
  seconds were 35% to 48% of every suite's time. `pnpm verify waits` fails on any of them in
  `apps/ios/UITests/`.
- **Never pause to let something happen;** wait for the thing itself. The fixed pauses left are
  proofs that something does not happen (the input panel stays open, the iPhone doesn't turn, the
  word sheet stays up, and in `ExampleRowsUITests` a second after the held answers are let go, in
  which no row may change its height and the opened sentence may not leave its place), the long
  press and the drag's hold, which are what a finger does, `waitUntilStill`'s second between two
  looks at a frame, `comesTrue`'s wait between two looks, and three on the iPad and the Mac with
  nothing on screen to wait for yet: a window taking keyboard focus after Escape, a shortcut pressed
  over a sheet, and the pointer moving off a headword before its picture. `pnpm verify waits` counts
  each file's run-loop pauses and sleeps, however they are spelled, against `allowedPauses` in
  `tools/checks/src/waits.ts`, which says what each proves; a new pause goes there and in this list.
- **Repeat a gesture only while its effect hasn't shown,** and stop as soon as it has: `open`,
  `press`, `tap(_:toShow:)`, `focus`, `choose`, `pause`, and `resume` tap again only after a wait
  for what the tap should bring runs out. `for … where` tests its condition on every pass and never leaves
  early, so write such a loop with a `break`.
- **Never assert how long something took.** A busy Mac makes everything slow, so a time limit fails
  for the machine as often as for the app. Count what the app did instead: the Player test reads how
  many times the screen, its speed menu, and its captions drew themselves (`ZENBU_COUNT_DRAWS`,
  [`ios.md`](ios.md)) while the playback position shows three seconds of a repeating line, and
  expects none. A missing count fails the test rather than reading as none. Each count is a 1-point
  clear text read with `text(of:)`: the Mac never shows a value given to an element made with
  `.accessibilityElement()`, such as a `Color.clear` or the scrubber, though it finds the element by
  its identifier. For the same reason the Mac test can't read the scrubber's value, which VoiceOver
  does read; so in the launches that count draws the time text also shows itself to UI tests as
  `watch.time`, and the Mac test reads the seconds there, while iPhone and iPad tests read the
  scrubber. The time text stays hidden from VoiceOver in every launch. It used to assert that the
  speed menu was used within 60 s, which caught the screen redrawing five times a second only when
  XCUITest's own wait for the app to go idle ran out.
- **A time limit only guards against a hang.** The package's tests that await work they watch or
  hold carry `.timeLimit(.minutes(1))`. Those tests take milliseconds, so the limit trips only when
  an await never returns, which is a defect. It is never a speed limit: put one only on tests whose
  normal run is under a hundredth of it. The limit cancels the test's task but can't abandon it, so
  a wait a test writes must end when its task is cancelled, as `until` and `HeldRetries` do, or give
  up on its own well inside the limit and fail, as the sign-in tests' `HeldReply` does after 30 s;
  one that does neither still holds up the whole run.
- **Wait for what the next step reads.** A label, a selection, or a frame read the moment after a
  tap reads the screen before the app has answered. `assertOnScreen` waits for the element to
  have a size before it measures where it is, and a Mac sheet is measured once it has opened.
- **`reveal` scrolls at once toward a row a list hasn't built.** A lazy list builds a row only
  when it scrolls near it, so waiting for one below the screen can't work. `reveal` waits up to
  five seconds for the row, but stops as soon as the list says it goes on below: a vertical
  scroll bar of more than one page, not at 100%, the same at two looks running, so a page still
  growing as its sections load doesn't count. It then scrolls toward the row and stops once the
  row is in reach. On the Mac, whose lists build their rows, it waits as before.
- **`reveal` takes its direction only from a frame that has been laid out.** A Mac list keeps
  rows in its tree before it lays them out, and such a row reports an empty frame, whose middle
  reads as the top of the screen. `reveal` scrolls forward, toward the part of the list not yet
  seen, until the row has a real frame above the list, and a frame that is empty for a moment
  keeps the direction it had. Reading the empty frame as "above" once sent a Mac run back and
  forth twelve times without reaching the row.

**The conversation tests** run against the scripted conversation of the Translate harness
([`translate.md`](translate.md), Simulator harness), which plays in real time. A line being
heard is on screen as the live card (`translate.live`) for only a second or so, so the tests
wait for what stays: a finished sentence card, the prompt, or the controls. A test that needs a
passing state, a line half heard, a turn's audio waiting, or a translation playing, holds the
script (`HeldConversationUITests`): the state stays until the test posts the notice to go on, so
nothing depends on how fast the Mac is. The harness's silence prompt counts down for two minutes,
longer than the tests' 90-second patience, so tapping **Keep Listening** never races it, and the
test of nobody answering doesn't wait those two minutes: it posts the notice that moves the
harness's clock past the countdown, then waits for the pause.

A test that starts failing after a wait got faster was passing by luck: it read or tapped
something a moment before it was ready, and the second XCUITest used to add hid that. Find what
the step needs and wait for that; never put a pause back.

## Where a test's time goes

XCUITest writes each step into `test.log` with the second it began (`t = 12.34s Tap …`). Giving
every second to the step running then shows where a test's time goes: launching the app, waiting
for the app to be idle after a tap (animations are on), lookups, the gestures, and waiting. The
`verify-app` script's last line splits a run into the Simulator, the build, and the tests.
