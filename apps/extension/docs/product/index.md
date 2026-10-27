# Browser extension product documentation

This folder describes what the Zenbu Japanese browser extension does for a learner today, and the
check that holds each behavior. It is updated with the implementation and is not a roadmap. How
it's built is in [`docs/agents/extension.md`](../../../../docs/agents/extension.md).

The extension is for Chrome 138 or later. Its first version works offline and has no account:
nothing signs in. It looks like zenbujapanese.com, in Geist, light or dark as the system is set.

## Surfaces

| Surface | What a learner sees | Check |
| --- | --- | --- |
| Side panel | The header, the tab bar with Video, Translate, Images, Words, and Recent, each tab's empty state, pages over a tab, and opening it from a click: [`side-panel.md`](side-panel.md). | The tests and Chrome checks there |
| Settings | Reading Aids, Frequency Dictionaries, Dictionary Data, Sites, and Credits, in a tab of its own. | [`settings.md`](settings.md) |

The dictionary answers even after Chrome has closed the document that holds it: the extension
opens it again on the next request, and that first request is answered
(`src/service-worker/offscreen-document.test.ts`, `src/service-worker/round-trip.test.ts`).

## Not built yet

Looking words up, the word popup on a page, saving, and translating aren't built, so the side
panel's tabs show only their empty states, and the reading aids and Zenbu Captions are stored but
draw nothing yet. The release build adds nothing to the pages a learner reads.
