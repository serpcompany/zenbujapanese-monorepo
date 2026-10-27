# Toolbar popup

The popup opens from Zenbu's button in Chrome's toolbar. It is 320 pixels wide and shows, top to
bottom, the parts below. Its text is in `src/popup/labels.ts`. Each check is in
`src/popup/toolbar-popup.interaction.test.tsx` unless it names another.

| What a learner sees | Check |
| --- | --- |
| The Zenbu mark, "Zenbu Japanese", and a gear that opens Settings in a tab. | `opens Settings from the gear` |
| The tab's site: its icon, its host, "Zenbu is on for this site" or "Zenbu is off for this site", and a switch named "Zenbu on" and the host. Turning it off adds the host to Settings' Sites, and the page loses what Zenbu drew there at once, and after a reload. Turning it on, here or with Turn On in Settings, draws it again. | `turns Zenbu off for the site, keeps it off after a reload, lists it under Sites, and Turn On brings it back` |
| On Chrome's own pages (`chrome://`, other extensions, `about:`, files) and the Chrome Web Store: "Zenbu can't run here" and why, with no switch. | `says Zenbu can't run on %s, with no switch`; the addresses in `src/popup/site.test.ts` |
| Where Chrome's site access keeps Zenbu out: "Chrome's site access keeps Zenbu off this site" and Allow on This Site, which asks Chrome for that site; once allowed, the switch. | `asks Chrome for the site where Chrome's site access keeps Zenbu out` |
| While the dictionary downloads: "Downloading the dictionary", the progress the welcome tab shows, and Show Welcome Tab, which opens it. Nothing once it's ready. | `shows the download and Show Welcome Tab only while the dictionary downloads` |
| Reading Aids: Furigana, Hide Furigana on Known Words, Word Meanings, Romaji, and Sentence Translations, each a switch. Each takes effect on open pages without a reload, and Settings shows the same. Hide Furigana on Known Words can't change while Furigana is off. | `turns each reading aid on and off, Settings shows the same, and the open page hears it without a reload`; `waits for Furigana before Hide Furigana on Known Words can change` |
| Videos: Zenbu Captions, a switch. | `src/settings/settings-page.interaction.test.tsx` |
| Open Side Panel, which opens the side panel on this tab and closes the popup. | `opens the side panel and closes` |

The reading aids, Zenbu Captions, and the sites Zenbu is off on are kept in the browser
(`chrome.storage.local`), so they stay through a restart. What a reading aid draws on a page, and
the captions, come with the word popup and the captions; until then the test content script shows
each setting's state.
