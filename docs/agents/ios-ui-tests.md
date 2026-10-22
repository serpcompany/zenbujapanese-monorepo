# How the app's UI tests wait

The app's UI tests (`apps/ios/UITests/`) spend most of their time waiting for the app, so how they
wait decides how long a suite takes and whether a test passes by luck. What the tests cover, the
harnesses they launch the app with, and the commands are in [`ios.md`](ios.md), Tests on every
platform; running a few of them quickly while working is the `verify-app` skill. The accessibility
audits, and the findings they allow, are in [`ios-accessibility.md`](ios-accessibility.md).

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
| `assertOnScreen`, `firstReachable`, `tap`, `tap(_:toShow:)`, `tapClearOfTheBars`, `focus`, `type`, `name`, `open`, `choose`, `reveal`, `waitForSheet` | What each needs before it acts or measures | 90 s, or a third of it for each try of a retried step |

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
  looks at a frame, `comesTrue`'s wait between two looks, the 0.3 s between the warm-up touch and
  the gesture after it (below), and three on the iPad and the Mac with
  nothing on screen to wait for yet: a window taking keyboard focus after Escape, a shortcut pressed
  over a sheet, and the pointer moving off a headword before its picture. `pnpm verify waits` counts
  each file's run-loop pauses and sleeps, however they are spelled, against
  `exceptions.allowedPauses` in `verify.json`, which says what each proves; a new pause goes there
  and in this list.
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
  a wait a test writes must end when its task is cancelled, as `until`, `HeldRetries`, and
  `LaterReply.asked()` do; one that doesn't still holds up the whole run.
- **A test holds nothing the others share.** The package's tests all run at once in one process,
  so a wait on something they share, or a measure of all of them, ties a test to every other.
  Every stubbed request in the process goes through CFNetwork's one thread for custom
  `URLProtocol`s: a stub that waited there for its test to let a reply go held up every other
  test's requests meanwhile, and on a busy Mac a holder that ran out of its own time first never
  let go, so its reply kept the thread for its full 30 seconds and 59 account tests ran out of
  their minute together. A reply a test sends later is a `LaterReply`, which holds no thread
  ([`ios-account-sync.md`](ios-account-sync.md)). A notification is process-wide too: a
  `UserDefaults.didChangeNotification` observer on the main queue holds up every defaults write
  until the main thread has run it, so an observer that heard every store (`SyncedSettings`, before
  it heard only its own) made each test's writes wait while every other live test's settings were
  read again: 29% of a busy run's main thread, and defaults writes parked on the cooperative
  threads waiting for it. Observe the object you own. Every test's memory counts in the process's
  footprint too, which the tests beside one that hashed a file raised by 38 MB, or lowered, while
  it hashed: a test of memory counts what the code under test holds (`DigestTests` counts the
  chunks alive at once).
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
- **`reveal` looks both ways for a row it can't see.** A lazy list also lets go of a row that
  scrolls out of view, so a row above the screen is missing from the tree just as a row below
  it not yet built is. With no frame to go by, `reveal` keeps scrolling the way it was going, and
  when a swipe moves nothing (the tree is the same after it as before) and the frontmost list's
  scroll bar, of more than one page, reads 100%, it is at the bottom: it turns once, and stops when
  a swipe moves nothing at 0%. A swipe that moves nothing anywhere else doesn't count as an end.
  It never turns on a short page, on the Mac, whose lists keep their rows, or inside a container
  such as the word sheet, where a swipe down at the top drags the sheet away; there only a
  laid-out frame above sends it up. Scrolling only down once failed the Account
  rows test, whose Sign In row, near the top, was gone once the list reached Credits at the
  bottom. `RevealUITests` scrolls Credits to its end and finds its first source again.
- **A row is tapped where it shows between the bars.** `reveal` stops once a row's middle is in
  the window, and at the largest text size on iOS 27 that can be under the tab bar, so a tap there
  reaches the bar. A tall row whose middle was 8 points above the bar still lost its tap to it.
  `tapClearOfTheBars` scrolls on until the row's middle is between the navigation bar and the tab
  bar (`isClearOfTheBars`, what `ExampleRowsUITests` checks before it opens a word), then taps the
  middle of the part of the row between them, and taps again as `tap(_:toShow:)` does.
- **A gesture after a pause of 4 s or more follows a warm-up touch.** This works around a race in
  the iOS 26.2 Simulator (Xcode 26.2), and goes once Apple fixes it. XCUITest sends each gesture
  through a virtual touchscreen that testmanagerd makes for it, and backboardd sometimes registers
  that touchscreen too late, so the gesture never reaches the app. The Simulator's log then says
  `unexpected digitizer usage pair 0xD0000` and `ignoring digitizer event … from unsupported
  service`, or `unknown senderID`, `unknown digitizer`, and `didn't see a previous touch down or
  range-in event … skipping event` (`xcrun simctl spawn <udid> log show --predicate 'process ==
  "backboardd"'`). On 2026-10-20 it hit 5 of about 3,000 gestures, each the first after a pause of
  5 to 18 s, and none of the roughly 1,500 timed after a pause under 4 s; the dark Account audit
  lost a Back tap, a swipe, and a tap that way, each right after an audit. So `gesture(on:_:)`
  (`ZenbuUITestCase.swift`), which every step that taps, swipes, presses, or scrolls goes
  through, keeps the time of the last gesture. When the next comes 4 s or more after it, it first
  taps the frontmost navigation bar's title, which does nothing anywhere in the app, then sends
  the gesture 0.3 s later. The warm-up is sent every time that holds and nothing depends on it
  landing, so it isn't a retry. It fails the test if the number of bars with that title changed
  afterwards, or the gesture's element is gone. It's skipped when no title is showing, when the
  app isn't in front, while a menu or popover is open, and for the gesture right after a step that
  opens a row's actions or a context menu (`gestureThatOpensActions`), since a touch elsewhere
  closes those; and on the Mac, whose tests send real pointer events. In a
  probe of 250 audits each way, the tap straight after an audit met the race once and the tap
  after a warm-up never did. A test that sends a gesture itself wraps it in `gesture(on:)`; the
  only ones sent directly are the Mac's own: clicks in its Settings window, on a headword's kanji,
  and on an example's linked word, right-clicks, wheel scrolls, and moving the pointer away.

**The conversation tests** run against the scripted conversation of the Translate harness
([`translate.md`](translate.md), Simulator harness), which plays in real time. A line being
heard is on screen as the live card (`translate.live`) for only a second or so, so the tests
wait for what stays: a finished sentence card, the prompt, or the controls. A test that needs a
passing state, a line half heard, a turn's audio waiting, or a translation playing, holds the
script (`HeldConversationUITests`): the state stays until the test posts the notice to go on, so
nothing depends on how fast the Mac is. The silence tests start on a silent script and post the
notice that moves the harness's clock two minutes ahead, past the 20 s of silence and then past the
prompt's countdown, so they wait for no real time; the countdown is longer than the tests'
90-second patience, so tapping **Keep Listening** never races it.

A test that starts failing after a wait got faster was passing by luck: it read or tapped
something a moment before it was ready, and the second XCUITest used to add hid that. Find what
the step needs and wait for that; never put a pause back.

## Where a test's time goes

XCUITest writes each step into `test.log` with the second it began (`t = 12.34s Tap …`). Giving
every second to the step running then shows where a test's time goes: launching the app, waiting
for the app to be idle after a tap (animations are on), lookups, the gestures, and waiting. The
`verify-app` script's last line splits a run into the Simulator, the build, and the tests.
