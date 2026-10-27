# Browser extension product documentation

This folder describes what the Zenbu Japanese browser extension does for a learner today, and the
check that holds each behavior. It is updated with the implementation and is not a roadmap. How
it's built is in [`docs/agents/extension.md`](../../../../docs/agents/extension.md).

The extension is for Chrome 138 or later. Its first version works offline and has no account:
nothing signs in. It looks like zenbujapanese.com, in Geist, light or dark as the system is set.

## Surfaces

| Surface | What a learner sees | Check |
| --- | --- | --- |
| Side panel | "Zenbu Japanese", and the dictionary's state, drawn as the welcome tab draws it: "Checking the dictionary…", the download's progress, "The dictionary is ready.", or "The dictionary didn't download." with why; with Check again once it is ready or has failed. | `src/shared/dictionary-status.interaction.test.tsx`, with the worker's round trip in `src/service-worker/round-trip.test.ts`; in Chrome, by hand |
| Welcome tab | Under Zenbu's logo, in a centred 600-pixel column: "Welcome to Zenbu" and the dictionary's state. While it downloads, a line saying Zenbu looks words up on this computer, so it is downloading its dictionary and the learner can keep browsing, and a progress bar with its percent and its megabytes done of the total. Then "The dictionary is ready.", or "The dictionary didn't download." with why and Try Again. Below, three first steps: open a Japanese page or a YouTube video with Japanese captions, click an underlined word, and pin Zenbu to the toolbar. No subscription step. | `src/shared/welcome.interaction.test.tsx`; in Chrome, by hand |
| Toolbar popup | "Zenbu Japanese" and "Open the side panel to look up Japanese words." | In Chrome, by hand |
| Settings | "Settings", in a tab of its own, and "Nothing to set yet." | In Chrome, by hand |

The dictionary answers even after Chrome has closed the document that holds it: the extension
opens it again on the next request, and that first request is answered
(`src/service-worker/offscreen-document.test.ts`, `src/service-worker/round-trip.test.ts`).

## First run

Installing the extension opens the welcome tab once and starts downloading the dictionary, about
237 MB, which its progress bar counts. Closing the tab doesn't stop it. A download cut by a closed
browser or a lost connection goes on from where it was, keeping the files it finished, and a damaged file fails with why, with Try Again. Once the dictionary
is in, the extension works offline (`src/worker/installer.test.ts`).

## Updates

When the browser starts, once a day, and when a page asks (Settings' Check for Updates, #959),
the extension looks for a newer dictionary and downloads only what changed. The learner keeps
looking words up from the dictionary they have until the new one is ready, and the dictionary's
progress says it is ready while it checks and downloads; an update that fails leaves it in place
and says why
(`src/worker/installer.test.ts`, `src/service-worker/language-data-updates.test.ts`).

## Not built yet

The dictionary answers lookups, but no surface asks it yet: the word popup on a page, underlining,
Word Detail, saving, and translating aren't built. The release build adds nothing to the pages a
learner reads.
