# Browser extension product documentation

This folder describes what the Zenbu Japanese browser extension does for a learner today, and the
check that holds each behavior. It is updated with the implementation and is not a roadmap. How
it's built is in [`docs/agents/extension.md`](../../../../docs/agents/extension.md).

The extension is for Chrome 138 or later. Its first version works offline and has no account:
nothing signs in. It looks like zenbujapanese.com, in Geist, light or dark as the system is set.

## Surfaces

| Surface | What a learner sees | Check |
| --- | --- | --- |
| Side panel | Opened from the toolbar icon, which has no popup: the header, the tab bar with the app's Look Up, Translate, Player, and Account, what each tab shows, pages over a tab, and opening it from a click: [`side-panel.md`](side-panel.md). Its Look Up tab, a search over the dictionary: [`look-up.md`](look-up.md). Its Translate tab, with Image Search: [`translate.md`](translate.md). Its Player tab, a YouTube video's transcript and Recent: [`video-tab.md`](video-tab.md). | The tests and Chrome checks there; `e2e/pages.spec.ts`, `e2e/side-panel-tabs.spec.ts` |
| Welcome tab | Under Zenbu's logo, in a centred 600-pixel column: "Welcome to Zenbu" and the dictionary's state. While it downloads, a line saying Zenbu looks words up on this computer, so it is downloading its dictionary and the learner can keep browsing, and a progress bar with its percent and its megabytes done of the total. Then "The dictionary is ready.", or "The dictionary didn't download." with why and Try again. Under it, English translations: while Chrome's Japanese translation isn't on this computer, "English translations use Chrome's own Japanese download, made once for every site." and Download, whose click starts Chrome's download, with its progress; then "English translations are ready.", or "The download didn't finish. Try again." and Download. Where Chrome reports its download already under way (`downloading`), "Chrome is downloading its Japanese translation…" with no Download, until a check every 2 seconds finds it in. Chrome 156 reports `downloadable` during a download, so there a tab opened mid-download shows Download, and its click joins the running download. Where Chrome can't translate Japanese, nothing about it. Below, three first steps: open a Japanese page or a YouTube video with Japanese captions, click an underlined word, and pin Zenbu to the toolbar. No subscription step. Then "Zenbu underlines Japanese only on the sites you allow." and Turn On for Every Site, which asks Chrome for every site, or, once it has them, "Zenbu can underline Japanese on every site." | `src/shared/welcome.interaction.test.tsx`, `src/shared/welcome-translation.interaction.test.tsx`; in the headful agent Chrome |
| Settings | Reading Aids, Frequency Dictionaries, Dictionary Data, Sites, and Credits, in a tab of its own. | [`settings.md`](settings.md) |
| Word Detail | A dictionary word's page in the side panel, as the app's, with a kanji's page and a conjugated form's examples: [`word-detail.md`](word-detail.md). It opens over a side panel tab from the word popup's Open Full Entry ([`word-popup.md`](word-popup.md)), and over Look Up from a result ([`look-up.md`](look-up.md)). | `src/word-detail/*.interaction.test.tsx` |

The dictionary answers even after Chrome has closed the document that holds it: the extension
opens it again on the next request, and that first request is answered
(`src/service-worker/offscreen-document.test.ts`, `src/service-worker/round-trip.test.ts`,
`e2e/content-script.spec.ts`).

## First run

Installing the extension opens the welcome tab once and starts downloading the dictionary, about
237 MB, which its progress bar counts. Closing the tab doesn't stop it. A download cut by a closed
browser or a lost connection goes on from where it was, keeping the files it finished, and a damaged file fails with why, with Try again. Once the dictionary
is in, the extension works offline (`src/worker/installer.test.ts`).

The welcome tab sets up, once, everything a tab would otherwise ask for. The dictionary downloads
by itself. Chrome's Japanese translation, a download of Chrome's own apart from the dictionary,
starts from the welcome tab's Download, since Chrome starts it only from a click; one download
holds both directions, Japanese to English and English to Japanese. Turn On for Every Site gives
Zenbu every site. Once one is done on a computer, no tab asks for it again: the Video tab shows
each line's English, Translate translates both ways with no ask and no download line, and the
header has no Allow on This Site. Chrome takes one click for one translator, so the welcome tab's
Download makes Japanese to English's; Translate's first English to Japanese makes its own from
that click on Translate, in about a tenth of a second from the same download. Where Chrome reports
`downloading`, a tab opened mid-download says "Chrome is downloading its Japanese translation…",
with no Download, and checks again every 2 seconds until it is in. Chrome 156 reports
`downloadable` during a download, so there that tab shows Download, and its click joins the
running download. A tab still asks for what is missing, such as for a learner who skipped the welcome
tab, or after Chrome removed its model
(`src/shared/welcome-translation.interaction.test.tsx`, "the Video tab and Translate translate
both ways, and neither asks to download", and "says Chrome is downloading, with no Download…"). Nothing else needs a download: the extension uses no other
on-device model, and Speak's voices are the computer's own ([`translate.md`](translate.md)).

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

- [Page lookup](page-lookup.md): on a site the learner allowed, the Japanese words underlined, the
  reading aids, and a click on a word. Where Zenbu runs, and the site switch.
- [Word popup](word-popup.md): the word's card that a click opens, its choice of words, and Open
  Full Entry, Share, and Copy Link.
- [YouTube captions and playback](youtube-captions.md): on a YouTube watch page, the video's
  Japanese captions, what happens when YouTube refuses them, and following the video. The side
  panel's Player tab shows them ([`video-tab.md`](video-tab.md)).
- [The caption on the player](player-captions.md): on a YouTube watch page, the line being heard
  on the player in place of YouTube's captions, its words, English, and popup, and the line
  controls: previous, play or pause, next, Repeat line, and the speed.

## Not built yet

Saving and signing in aren't built, so the side panel's Account, its Words, Player's Recent, and
Translate's Image Search show only their empty states. Hide Furigana on Known Words is stored but
changes nothing yet. Sentence Translations shows English only in the Player tab and under the
caption on the player, not on other pages.
