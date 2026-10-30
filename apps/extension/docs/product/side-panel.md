# Side panel

The side panel is where the extension translates, shows a video's transcript, and holds the
learner's account, beside the page they read. This is what it does today, with the check that holds each behavior. The
tests named here are in `src/side-panel/` unless a path says otherwise.

## What a learner sees

- **A header:** this site's switch and a menu with the reading aids and Settings, at its right:
  [`side-panel-header.md`](side-panel-header.md). There is no gear. It draws neither Zenbu's mark
  nor "Zenbu Japanese", since Chrome's own title above the panel shows both and can't be removed.
  A screen reader still hears the panel named "Zenbu Japanese", from a heading only it reads
  (`panel.interaction.test.tsx`; `e2e/pages.spec.ts`, with the page's title).
- **A tab bar at the bottom,** always in view: the app's Translate, Player, and Account, in the
  app's order, each an icon over its name: the translate mark, a play button in a square, and a
  person in a circle, as the app's. The app's Look Up has no tab: the extension has no dictionary
  search (#1129, D3). A click chooses a tab.
  The arrow keys move along the bar and choose the tab they land on, wrapping at the ends
  (`panel.interaction.test.tsx`; `e2e/side-panel-tabs.spec.ts`).
- **Translate on its box,** to translate Japanese or English, with an Image row that opens Image
  Search: [`translate.md`](translate.md) (`panel.interaction.test.tsx`, "opens each tab on its own
  screen", "opens Image Search from the Image row on Translate").
- **Player on the transcript** of the YouTube video in the tab the learner is on:
  [`video-tab.md`](video-tab.md). On a tab with no video, its empty state, with Recent under it;
  Recent shows only then.
- **Account on the account,** the same one Settings' Account page shows: signed out, the ways to
  sign in, and signed in, the email and the subscription ([`account.md`](account.md)). The
  profile's Words are under it.

What shows until the issue that fills it (`panel.interaction.test.tsx`, "opens each tab on its own
screen"; `e2e/side-panel-tabs.spec.ts`):

| Where | What shows |
| --- | --- |
| Player, on a tab with no video | "No video on this tab", and that a video with Japanese captions shows its transcript here. |
| Player's Recent, signed out | A "Recent" heading, then "No recent videos", that a Zenbu account keeps the videos watched on all devices, and "Sign up or sign in". |
| Player's Recent, signed in | A "Recent" heading, then "No recent videos", that the videos watched show here, on all devices, with no sign-in offer. It follows the account's sign-in and sign-out with the panel open (`recent.interaction.test.tsx`, "offers Sign up or sign in signed out, and explains Recent signed in…"). |
| Account's Words | "No words yet", and that the words known and the lists kept show here. |
| Image Search, over Translate | "Reading text in pictures is coming soon", with no button. |

Player's "Sign up or sign in" opens the Account tab, where the extension signs in itself or from
the website ([Account](account.md)), and neither Player nor Translate has a link
(`panel.interaction.test.tsx`, "opens the Account tab's sign-in from Player's Sign up or sign
in…").

## Pages over a tab

- **A page opens over the tab it was opened from,** with a row above it that goes Back, named for
  the tab ("Translate"). Back goes back one page at a time, to the tab itself at the end. The
  tab bar stays in view (`panel.interaction.test.tsx`).
- **Focus goes to what is shown:** to a new page's Back row, and after Back to the Back row of the
  page revealed, or to the tab (`panel.interaction.test.tsx`).
- **Each tab keeps its own pages:** choosing another tab and coming back finds the page where it
  was (`panel.interaction.test.tsx`).
- **Image Search,** over Translate ([`translate.md`](translate.md)). A word's card and its full
  entry don't open as pages: a word clicked in the panel opens its card on the page, one opened
  with Enter or Space shows its card under its line, and Open Full Entry expands the card in place
  ([`word-popup.md`](word-popup.md)).
- **The test page,** in the test build only, shows its text and opens another page over itself.
  The release build refuses a route to it (`route.test.ts`).

## Opening it

- **The toolbar, Chrome's title above the panel, and `chrome://extensions` show Zenbu's logo,**
  the brand's `assets/brand/extensions/` PNGs at 16, 32, 48, and 128 px, which the build copies to
  `icons/` and the manifest names as `icons` and `action.default_icon`
  (`build/manifest.test.ts`; `build/extension-config.test.ts`, that the build emits those files at
  those sizes; `build/packages.test.ts`, that the package check fails a package missing one; on
  `chrome://extensions` by an agent on 2026-10-29. The toolbar and the panel's title are not
  checked: the headless harness has no toolbar).
- **A click on the Zenbu icon in the toolbar opens the panel.** There is no toolbar popup
  (`build/manifest.test.ts`, `open-panel.interaction.test.tsx`).
- **A click on a page opens the panel on a tab and a page.** A closed panel
  opens on them, and an open one moves to them; the tab it was on keeps its pages. The route is
  used once: the next time the panel opens by itself, it opens on its last tab with no page
  (`open-panel.interaction.test.tsx`, `src/service-worker/side-panel.test.ts`; in Chrome by an
  agent on 2026-10-28, from a click on an extension page, closed and open). Since a word's card
  expands in place (#1124), nothing in the extension asks for this: the agent harness docks the
  panel with it (`.claude/skills/verify-extension/SKILL.md`), and it waits for the next page that
  needs it.
- **It opens on the tab it was last on,** in any window, and on Translate, the first tab, the
  first time (`open-panel.interaction.test.tsx`, `panel.interaction.test.tsx`).
- **A last tab kept from the five tabs before opens on the tab that took it over:** Video or
  Recent on Player, Images on Translate, and Words on Account, and anything else, the Look Up of
  an earlier build included, on Translate. The panel keeps that tab from then on (`open-panel.interaction.test.tsx`, "opens on the tab that took over…";
  `e2e/side-panel-tabs.spec.ts`).
- **A closed panel opens only from a click.** Chrome lets a click open it and nothing else, so a
  request made without one leaves it closed, and leaves nothing behind for later
  (`open-panel.interaction.test.tsx`).

## Before the dictionary is ready

While the dictionary is being checked or downloaded, or has failed, every tab but Translate shows
the dictionary's progress instead of its content, and the tab bar stays. Translate doesn't need
the dictionary, but a page opened over it waits for it: it shows the progress under its Back row,
and Back finds Translate as it was. When it has failed, Try again starts it again,
and the tab comes back once the dictionary is ready (`panel.interaction.test.tsx`).

## Width

The panel is designed at 380 px wide and works down to 320 px: nothing scrolls sideways, on any
tab or on a page with a long line of Japanese (in Chrome by an agent on 2026-10-28,
at 320 and 380 px). It is checked by hand only; a browser test is #1112.
