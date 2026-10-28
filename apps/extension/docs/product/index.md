# Browser extension product documentation

This folder describes what the Zenbu Japanese browser extension does for a learner today, and the
check that holds each behavior. It is updated with the implementation and is not a roadmap. How
it's built is in [`docs/agents/extension.md`](../../../../docs/agents/extension.md).

The extension is for Chrome 138 or later. Its first version works offline and has no account:
nothing signs in. It looks like zenbujapanese.com, in Geist, light or dark as the system is set.

## Surfaces

| Surface | What a learner sees | Check |
| --- | --- | --- |
| Side panel | Opened from the toolbar icon, which has no popup: the header, the tab bar with Video, Translate, Images, Words, and Recent, each tab's empty state, pages over a tab, and opening it from a click: [`side-panel.md`](side-panel.md). Its Translate tab: [`translate.md`](translate.md). | The tests and Chrome checks there; `e2e/pages.spec.ts` |
| Welcome tab | Under Zenbu's logo, in a centred 600-pixel column: "Welcome to Zenbu" and the dictionary's state. While it downloads, a line saying Zenbu looks words up on this computer, so it is downloading its dictionary and the learner can keep browsing, and a progress bar with its percent and its megabytes done of the total. Then "The dictionary is ready.", or "The dictionary didn't download." with why and Try again. Below, three first steps: open a Japanese page or a YouTube video with Japanese captions, click an underlined word, and pin Zenbu to the toolbar. No subscription step. | `src/shared/welcome.interaction.test.tsx`; in Chrome, by hand |
| Settings | Reading Aids, Frequency Dictionaries, Dictionary Data, Sites, and Credits, in a tab of its own. | [`settings.md`](settings.md) |
| Word Detail | A dictionary word's page in the side panel, as the app's, with a kanji's page and a conjugated form's examples: [`word-detail.md`](word-detail.md). It opens over a side panel tab from a route; nothing opens one yet (#957). | `src/word-detail/*.interaction.test.tsx` |

The dictionary answers even after Chrome has closed the document that holds it: the extension
opens it again on the next request, and that first request is answered
(`src/service-worker/offscreen-document.test.ts`, `src/service-worker/round-trip.test.ts`,
`e2e/content-script.spec.ts`).

## First run

Installing the extension opens the welcome tab once and starts downloading the dictionary, about
237 MB, which its progress bar counts. Closing the tab doesn't stop it. A download cut by a closed
browser or a lost connection goes on from where it was, keeping the files it finished, and a damaged file fails with why, with Try again. Once the dictionary
is in, the extension works offline (`src/worker/installer.test.ts`).

## Updates

When the browser starts, once a day, and when a page asks (Settings' Check for Updates),
the extension looks for a newer dictionary and downloads only what changed. The learner keeps
looking words up from the dictionary they have until the new one is ready, and the dictionary's
progress says it is ready while it checks and downloads; an update that fails leaves it in place
and says why
(`src/worker/installer.test.ts`, `src/service-worker/language-data-updates.test.ts`).

## Error reports

Reporting is built, and off in every build until Zenbu's Sentry project for the extension exists.
Then the extension sends its own errors to it, so they can be fixed: never the text of the page a
learner reads, its address, or a word they select in Japanese, and never an error from the page's
own code. A content script sends nothing from the page itself; the extension's background sends
its reports (`src/error-reports/scrub.test.ts`,
`src/error-reports/error-reports.interaction.test.tsx`; that one arrives, in Chrome by hand).
There are no usage analytics.

Reports are on until the learner turns them off, as in the app: the setting is
`crashReports.send`, and its switch is Settings' Send Crash Reports
([`settings.md`](settings.md)). Turning it off stops
reports at once, with no reload, and drops any not yet sent; turning it on starts them again
(`src/error-reports/report-setting.test.ts`). Sentry keeps a report for the project's retention,
set in Sentry.

## On pages

- [YouTube captions and playback](youtube-captions.md): on a YouTube watch page, the video's
  Japanese captions, what happens when YouTube refuses them, and following the video. Nothing
  shows them yet.

## Not built yet

The dictionary answers lookups, but no surface asks it yet: the word popup on a page, underlining,
Word Detail, and saving aren't built, nor the Video tab and the caption on the player that show a
YouTube video's lines, so the side panel's tabs but Translate show only their empty states. The
reading aids and Zenbu Captions are stored but draw nothing yet, and the release build draws
nothing on the pages a learner reads.
