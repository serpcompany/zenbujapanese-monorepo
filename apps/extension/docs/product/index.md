# Browser extension product documentation

This folder describes what the Zenbu Japanese browser extension does for a learner today, and the
check that holds each behavior. It is updated with the implementation and is not a roadmap. How
it's built is in [`docs/agents/extension.md`](../../../../docs/agents/extension.md).

The extension is for Chrome 138 or later. Its first version works offline and has no account:
nothing signs in. It looks like zenbujapanese.com, in Geist, light or dark as the system is set.

## Surfaces

| Surface | What a learner sees | Check |
| --- | --- | --- |
| Side panel | Opened from the toolbar icon, which has no popup: the header, the tab bar with Video, Translate, Images, Words, and Recent, each tab's empty state, pages over a tab, and opening it from a click: [`side-panel.md`](side-panel.md). | The tests and Chrome checks there |
| Settings | "Settings" and "Nothing to set yet.", in a tab of its own. | In Chrome, by hand |
| Word Detail | A dictionary word's page in the side panel, as the app's, with a kanji's page and a conjugated form's examples: [`word-detail.md`](word-detail.md). It opens over a side panel tab from a route; nothing opens one yet (#957). | `src/word-detail/*.interaction.test.tsx` |

The dictionary answers even after Chrome has closed the document that holds it: the extension
opens it again on the next request, and that first request is answered
(`src/service-worker/offscreen-document.test.ts`, `src/service-worker/round-trip.test.ts`).

## Error reports

Reporting is built, and off in every build until Zenbu's Sentry project for the extension exists.
Then the extension sends its own errors to it, so they can be fixed: never the text of the page a
learner reads, its address, or a word they select in Japanese, and never an error from the page's
own code. A content script sends nothing from the page itself; the extension's background sends
its reports (`src/error-reports/scrub.test.ts`,
`src/error-reports/error-reports.interaction.test.tsx`; that one arrives, in Chrome by hand).
There are no usage analytics.

Reports are on until the learner turns them off, as in the app: the setting is
`crashReports.send`, and the switch for it comes with Settings (#959). Turning it off stops
reports at once, with no reload, and drops any not yet sent; turning it on starts them again
(`src/error-reports/report-setting.test.ts`). Sentry keeps a report for the project's retention,
set in Sentry.

## Not built yet

Looking words up, the word popup on a page, saving, and translating aren't built, so the side
panel's tabs show only their empty states. The release build adds nothing to the pages a learner
reads.
