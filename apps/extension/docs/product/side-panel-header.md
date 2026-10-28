# Side panel header

The side panel's header has, after the Zenbu mark and "Zenbu Japanese", the site switch and a
menu button. Both follow the tab at the front: another tab coming to the front, the tab
finishing a load, or a change to Zenbu's site access changes them. The header knows a tab's site
only from its address, which Chrome shows Zenbu only where Zenbu has site access or after a click
on the toolbar icon. The text is in `src/settings/labels.ts`, which Settings shares.
Each check is in `src/side-panel/header-controls.interaction.test.tsx` unless it names another.

| What a learner sees | Check |
| --- | --- |
| The site switch, named "Zenbu on" and the host. Turning it off adds the host to Settings' Sites, and the page loses what Zenbu drew there at once, and after a reload. Turning it on, here or with Turn On in Settings, draws it again. The menu names the host and says "Zenbu is on for this site" or "Zenbu is off for this site". | `turns Zenbu off for the tab's site, keeps it off after a reload, lists it under Sites, and Turn On brings it back` |
| Another tab at the front, a page loaded in the tab, or Chrome's site access for Zenbu given or taken back moves the switch to that tab's site, or to the state below that fits it. | `follows the active tab to another site, to a page Chrome hides from Zenbu, and back`; `shows the switch once Chrome's site access lets Zenbu in, without a reload`; `gives the switch up when Chrome's site access is taken back, for Allow on a tab the toolbar icon shows, and for can't see on any other` |
| Where Chrome shows the tab's address but its site access keeps Zenbu off the site, such as after a click on the toolbar icon on a site Zenbu hasn't been allowed: no switch, and the menu names the host, says "Chrome's site access keeps Zenbu off this site", and has Allow on This Site, which asks Chrome for that site; once allowed, the switch. | `names the site and asks Chrome for it where the toolbar icon shows the address but Chrome's site access keeps Zenbu off` |
| Where Chrome withholds the tab's address, which it does on every page Zenbu has no site access to, Chrome's own pages among them: no switch, and the menu says "Zenbu can't see this page" and how to let Zenbu in through Chrome's site access for the extension. It has no Allow, since Zenbu can't name the site it would ask for, and nothing that asks for every site. | `says Zenbu can't see a page whose address Chrome withholds, and how to let Zenbu in, with no switch and no Allow` |
| Where Chrome shows an address no extension can run on (Chrome's own pages, other extensions, `about:`, files, and the Chrome Web Store): no switch, and the menu says "Zenbu can't run here" and why. | `says Zenbu can't run on the Chrome Web Store, where Chrome shows the address, with no switch`; the addresses in `src/side-panel/active-site.test.ts` |
| The menu's Reading Aids: Furigana, Hide Furigana on Known Words, Word Meanings, Romaji, and Sentence Translations, each with a switch, and the menu stays open. Each takes effect on open pages without a reload, and Settings shows the same. Hide Furigana on Known Words can't change while Furigana is off. | `turns each reading aid on and off from its menu, Settings shows the same, and the open page hears it without a reload`; `waits for Furigana before Hide Furigana on Known Words can change` |
| The menu's Videos: Zenbu Captions, with a switch. | `turns Zenbu Captions on and off from its menu, as Settings does` |
| Show Welcome Tab, while the dictionary downloads, which opens it. The panel itself shows the download's progress ([`side-panel.md`](side-panel.md)). | `offers Show Welcome Tab only while the dictionary downloads` |
| Settings, which opens Settings in a tab. | `opens Settings from its menu` |

The reading aids, Zenbu Captions, and the sites Zenbu is off on are kept in the browser
(`chrome.storage.local`), so they stay through a restart. What the site switch and the reading
aids do on a page is in [`page-lookup.md`](page-lookup.md).
