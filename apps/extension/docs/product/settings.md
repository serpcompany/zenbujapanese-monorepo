# Settings

Settings opens in a tab of its own, from the toolbar popup's gear or Chrome's Extension options. A
sidebar lists five pages and stays put beside the one that is open; at a narrow width it sits
above the page and wraps. Each page has its own address (`#sites`), so a reload keeps it. The text
is in `src/settings/labels.ts`. Each check is in
`src/settings/settings-page.interaction.test.tsx` unless it names another.

| Page | What a learner sees | Check |
| --- | --- | --- |
| All | The sidebar opens each page, one at a time, and marks the open one. | `opens each of its five pages from the sidebar, one at a time` |
| Reading Aids | The five reading aids the popup has, each with what it does, then Videos: Zenbu Captions ("On YouTube, Zenbu's captions in place of the site's."), then Crash Reports. | `keeps Reading Aids, Zenbu Captions, and Send Crash Reports on one page, each with a stock switch` |
| Reading Aids | Send Crash Reports, on until the learner turns it off, says what a report holds and where it goes, and that it never holds searches, words, sentences, or pages. | `sends crash reports at first and stores false when they are turned off` |
| Frequency Dictionaries | JLPT Levels, then YouTube, each with its domain, up and down buttons, and a switch. The order is the order of ranks in the word popup and Word Detail; a dictionary turned off keeps its place. Neither can be removed. | `moves YouTube above JLPT Levels, which changes the chosen order`; `src/settings/frequency-order.test.ts` |
| Dictionary Data | The dictionary's progress as the welcome tab shows it, the installed release, its size, when Zenbu last checked, and Check for Updates, which waits while a download runs. | `shows the installed release and checks for updates`; `draws the shared progress while the dictionary downloads, and Check for Updates waits` |
| Sites | Each site Zenbu is off on, with Turn On; "Zenbu is on for every site it can run on." when there are none. | `says Zenbu is on everywhere when no site is turned off`; Turn On in `src/popup/toolbar-popup.interaction.test.tsx` |
| Credits | The sources the extension uses, each linked with its licence, and how Zenbu converts them. | `credits the sources the extension's client shows` |

Every switch is `@zenbu/ui`'s Switch. Settings are kept in the browser, one key per setting
(`src/shared/settings.ts`); the reading aids and frequency dictionaries take the account's names so
a later sync can carry them. Nothing here signs in.
