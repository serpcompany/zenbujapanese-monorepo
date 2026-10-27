# Side panel header

The side panel's header has, after the Zenbu mark and "Zenbu Japanese", the site switch and a
menu button. Both follow the tab at the front: another tab coming to the front, or the tab
finishing a load, changes them. The text is in `src/settings/labels.ts`, which Settings shares.
Each check is in `src/side-panel/header-controls.interaction.test.tsx` unless it names another.

| What a learner sees | Check |
| --- | --- |
| The site switch, named "Zenbu on" and the host. Turning it off adds the host to Settings' Sites, and the page loses what Zenbu drew there at once, and after a reload. Turning it on, here or with Turn On in Settings, draws it again. The menu names the host and says "Zenbu is on for this site" or "Zenbu is off for this site". | `turns Zenbu off for the tab's site, keeps it off after a reload, lists it under Sites, and Turn On brings it back` |
| Another tab at the front, or a page loaded in the tab, moves the switch to that tab's site. | `follows the active tab to another site, to a page Zenbu has no part in, and back` |
| On Chrome's own pages (`chrome://`, other extensions, `about:`, files), the Chrome Web Store, and a page Zenbu doesn't run on: no switch, and the menu says "Zenbu can't run here" and why. | `says Zenbu can't run on $name, with no switch`; the addresses in `src/side-panel/active-site.test.ts` |
| Where Chrome's site access keeps Zenbu out: no switch, and the menu says "Chrome's site access keeps Zenbu off this site" and has Allow on This Site, which asks Chrome for that site; once allowed, the switch. | `asks Chrome for the site where Chrome's site access keeps Zenbu out` |
| The menu's Reading Aids: Furigana, Hide Furigana on Known Words, Word Meanings, Romaji, and Sentence Translations, each with a switch, and the menu stays open. Each takes effect on open pages without a reload, and Settings shows the same. Hide Furigana on Known Words can't change while Furigana is off. | `turns each reading aid on and off from its menu, Settings shows the same, and the open page hears it without a reload`; `waits for Furigana before Hide Furigana on Known Words can change` |
| The menu's Videos: Zenbu Captions, with a switch. | `turns Zenbu Captions on and off from its menu, as Settings does` |
| Show Welcome Tab, while the dictionary downloads, which opens it. The panel itself shows the download's progress ([`side-panel.md`](side-panel.md)). | `offers Show Welcome Tab only while the dictionary downloads` |
| Settings, which opens Settings in a tab. | `opens Settings from its menu` |

The reading aids, Zenbu Captions, and the sites Zenbu is off on are kept in the browser
(`chrome.storage.local`), so they stay through a restart. What a reading aid draws on a page, and
the captions, come with the word popup and the captions; until then the test content script shows
each setting's state.
