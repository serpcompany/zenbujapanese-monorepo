# Settings

Settings opens in a tab of its own, from the side panel header's menu or Chrome's Extension options. A
sidebar lists six pages and stays put beside the one that is open; at a narrow width it sits
above the page and wraps. Each page has its own address (`#sites`), so a reload keeps it. The text
is in `src/settings/labels.ts`. Each check is in
`src/settings/settings-page.interaction.test.tsx` unless it names another.

| Page | What a learner sees | Check |
| --- | --- | --- |
| All | The sidebar opens each page, one at a time, and marks the open one. | `opens each of its six pages from the sidebar, one at a time` |
| Reading Aids | The five reading aids the side panel header's menu has, each with what it does, then Pages: Page Text ("On every site, underlines and reading aids on the page's Japanese text."), on at first, the same switch as the header menu's ([`page-lookup.md`](page-lookup.md)), then Videos: Zenbu Captions ("On YouTube, Zenbu's captions in place of the site's."), then Crash Reports. | `keeps Reading Aids, Page Text, Zenbu Captions, and Send Crash Reports on one page, each with a stock switch`; Page Text in `src/side-panel/header-controls.interaction.test.tsx` |
| Reading Aids | Send Crash Reports, on until the learner turns it off, says what a report holds and where it goes, and that it never holds searches, words, sentences, or pages. | `sends crash reports at first and stores false when they are turned off` |
| Frequency Dictionaries | JLPT Levels, then YouTube, each with its domain, up and down buttons, and a switch. The order is the order of ranks in the word popup and Word Detail; a dictionary turned off keeps its place. Neither can be removed. | `moves YouTube above JLPT Levels, which changes the chosen order`; `src/settings/frequency-order.test.ts` |
| Dictionary Data | The dictionary's progress as the welcome tab shows it, the installed release, its size, when Zenbu last checked, and Check for Updates, which waits while a download runs. | `shows the installed release and checks for updates`; `draws the shared progress while the dictionary downloads, and Check for Updates waits` |
| Sites | First, "Zenbu underlines Japanese only on the sites you allow." and Turn On for Every Site, which asks Chrome for every site, or, once Chrome has given them, "Zenbu can underline Japanese on every site." ([`page-lookup.md`](page-lookup.md)). Then each site Zenbu is off on, with Turn On; "Zenbu is on for every site it can run on." when there are none. | `says Zenbu is on everywhere when no site is turned off`; `turns Zenbu on for every site from Sites…`; the welcome tab's in `src/shared/welcome.interaction.test.tsx`; Turn On in `src/side-panel/header-controls.interaction.test.tsx` |
| Account | The account the side panel's Account tab shows, drawn by the same component: signed out, the ways to sign in; signed in, the email, the subscription, Manage Account, Sign Out, and Delete Account ([`account.md`](account.md)). | `shows the same account as the side panel's Account tab, and signing in on either shows on both`; `e2e/account.spec.ts` |
| Credits | The sources the extension uses, each linked with its licence, and how Zenbu converts them. | `credits every source the core lists for the extension, with its link` |

Every switch is `@zenbu/ui`'s Switch. Settings are kept in the browser, one key per setting
(`src/shared/settings.ts`), under the account's names; signed in, the reading aids and the chosen
frequency dictionaries sync with the account ([`account.md`](account.md), In step with the
account). Signing in on the Account page signs the whole extension in.
