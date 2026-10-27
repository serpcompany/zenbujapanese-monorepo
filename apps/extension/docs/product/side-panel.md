# Side panel

The side panel is where the extension shows a learner's words, translations and videos, beside
the page they read. This is what it does today, with the check that holds each behavior. The
tests named here are in `src/side-panel/` unless a path says otherwise.

## What a learner sees

- **A header:** the Zenbu mark and "Zenbu Japanese". Its trailing side is for this site's switch
  and a menu with the reading aids and Settings (#959); there is no gear.
- **A tab bar at the bottom,** always in view: Video, Translate, Images, Words, and Recent, in
  that order, each an icon over its name. A click chooses a tab. The arrow keys move along the
  bar and choose the tab they land on, wrapping at the ends (`panel.interaction.test.tsx`).
- **Each tab on its empty state,** until the issue that fills it (`panel.interaction.test.tsx`):

| Tab | Empty state |
| --- | --- |
| Video | "No video on this tab", and that a video with Japanese captions shows its transcript here. |
| Translate | "Nothing to translate yet", and that Japanese or English translated shows here. |
| Images | "Reading text in pictures is coming soon", with no button. |
| Words | "No words yet", that a Zenbu account keeps known words, lists and notes on all devices, and "Sign up or sign in". |
| Recent | "No recent videos", that a Zenbu account keeps the videos watched on all devices, and "Sign up or sign in". |

"Sign up or sign in" opens zenbujapanese.com's `/register/` page in a new tab, where a new email
makes an account and a known one signs in (`panel.interaction.test.tsx`). The extension itself
doesn't sign in yet (#961).

## Pages over a tab

- **A page opens over the tab it was opened from,** with a row above it that goes Back, named for
  the tab ("Video"). Back goes back one page at a time, to the tab's empty state at the end. The
  tab bar stays in view (`panel.interaction.test.tsx`).
- **Focus goes to what is shown:** to a new page's Back row, and after Back to the Back row of the
  page revealed, or to the tab (`panel.interaction.test.tsx`).
- **Each tab keeps its own pages:** choosing another tab and coming back finds the page where it
  was (`panel.interaction.test.tsx`).
- **The pages for a word, a kanji, and a form** are Word Detail's
  ([`word-detail.md`](word-detail.md)).
- **The test page,** in the test build only, shows its text and opens another page over itself.
  The release build refuses a route to it (`route.test.ts`).

## Opening it

- **A click on the Zenbu icon in the toolbar opens the panel.** There is no toolbar popup
  (`build/manifest.test.ts`, `open-panel.interaction.test.tsx`).
- **A click on a page opens the panel on a tab and a page.** A closed panel
  opens on them, and an open one moves to them; the tab it was on keeps its pages. The route is
  used once: the next time the panel opens by itself, it opens on its last tab with no page
  (`open-panel.interaction.test.tsx`, `src/service-worker/side-panel.test.ts`; in Chrome by an
  agent on 2026-10-28, from a click on an extension page, closed and open).
- **It opens on the tab it was last on,** in any window, and on Video the first time
  (`open-panel.interaction.test.tsx`, `panel.interaction.test.tsx`).
- **A closed panel opens only from a click.** Chrome lets a click open it and nothing else, so a
  request made without one leaves it closed, and leaves nothing behind for later
  (`open-panel.interaction.test.tsx`).

## Before the dictionary is ready

While the dictionary is being checked or downloaded, or has failed, every tab but Translate shows
the dictionary's progress instead of its content, and the tab bar stays. Translate doesn't need
the dictionary. When it has failed, Try again starts it again, and the tab comes back once the
dictionary is ready (`panel.interaction.test.tsx`). Until #956 draws that progress, the panel
shows its tabs.

## Width

The panel is designed at 380 px wide and works down to 320 px: nothing scrolls sideways, on any
tab or on a page with a long line of Japanese (in Chrome by an agent on 2026-10-28,
at 320 and 380 px; a browser test is #952's).
