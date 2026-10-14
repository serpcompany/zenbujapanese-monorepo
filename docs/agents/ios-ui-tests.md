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
| `appears(_:within:)`, `isHittable(_:within:)` | The same, as an answer, for a step that may be tried again | The caller's: a third of the 90 s for a retried tap |
| `assertOnScreen`, `firstReachable`, `tap`, `tap(_:toShow:)`, `focus`, `type`, `name`, `open`, `choose`, `waitForSheet` | What each needs before it acts or measures | 90 s, or a third of it for each try of a retried step |

The 90 seconds is `patience`; `TEST_RUNNER_ZENBU_UI_TEST_PATIENCE=30` on the `xcodebuild` command
shortens every wait, for an idle Mac. A passing test never runs to a limit, so the limit costs it
nothing. A wait that holds at its first look leaves only that lookup in `test.log`; one that has
to wait is a step named `Wait up to 90s for …` with its looks under it, so a slow test's log says
what it waited for and for how long.

## Rules for a test

- **Never call XCUITest's own waits:** `waitForExistence`, `XCTNSPredicateExpectation`,
  `XCTWaiter`, and `waitForExpectations`. Each takes a full second before its first look whether
  or not the element is there. In 8,009 of them measured on 2026-10-13 the first look came 1.00
  to 3.01 seconds in, 96% found their element at that look, and those seconds were 35% to 48% of
  every suite's time.
- **Never pause to let something happen;** wait for the thing itself. The fixed pauses left are
  proofs that something does not happen (the input panel stays open, the iPhone doesn't turn, the
  word sheet stays up), the long press and the drag's hold, which are what a finger does, and
  `waitUntilStill`'s second between two looks at a frame.
- **Repeat a gesture only while its effect hasn't shown,** and stop as soon as it has: `open`,
  `press`, `tap(_:toShow:)`, `focus`, `choose`, and `pause` tap again only after a wait for what
  the tap should bring runs out. `for … where` tests its condition on every pass and never leaves
  early, so write such a loop with a `break`.
- **Wait for what the next step reads.** A label, a selection, or a frame read the moment after a
  tap reads the screen before the app has answered. `assertOnScreen` waits for the element to
  have a size before it measures where it is, and a Mac sheet is measured once it has opened.

A test that starts failing after a wait got faster was passing by luck: it read or tapped
something a moment before it was ready, and the second XCUITest used to add hid that. Find what
the step needs and wait for that; never put a pause back.

## Where a test's time goes

XCUITest writes each step into `test.log` with the second it began (`t = 12.34s Tap …`). Giving
every second to the step running then shows where a test's time goes: launching the app, waiting
for the app to be idle after a tap (animations are on), lookups, the gestures, and waiting. The
`verify-app` script's last line splits a run into the Simulator, the build, and the tests.
