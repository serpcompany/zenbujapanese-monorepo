# Shortcuts and sharing

Other apps reach Zenbu Japanese through Shortcuts, Siri, Spotlight, and the share sheet, on iPhone,
iPad, and the Mac. Each opens Zenbu on a screen it already has, and nothing leaves the device:
looking up, translating, and reading an image run on it, as they do inside the app. How it's built
is in [`ios-shortcuts-and-sharing.md`](../../../../docs/agents/ios-shortcuts-and-sharing.md).

- Source: #394, whose four actions the owner chose on 2026-10-16. The Safari extension is #390.

## Look Up in Zenbu

**Look Up in Zenbu** is a Shortcuts action that takes text and opens Zenbu on it. Siri runs it
from "Look up in Zenbu Japanese" or "Look up in Zenbu", and asks what to look up; Spotlight lists
it with the app's other shortcuts. In Shortcuts it takes the text the step before it hands on, so
a shortcut can pass it what the share sheet gave it.

From any tab, Translate included, Zenbu switches to Search and closes an open word sheet. A running
Translate conversation keeps going. Then:

- Japanese written or read as exactly one entry, such as 見る, or a form of exactly one, such as
  食べた, opens that word's Word Detail on top of what Search was showing;
- anything else is searched, as if it were typed into Search: a reading several entries share
  (かみ), one kanji, whose results lead with its row, English or romaji, and a sentence, whose
  words Search lists; and
- blank text returns to the Search screen.

Check: core `embedded/dictionary.test.ts` (which text opens a word, and which is searched); package
`AppLinkTests.lookUpRoutes` on the bundled dictionary, and `AppLinkTests.inbox` (the action hands
the window the link the share sheet opens); UI
`AppLinkUITests.testLookUpOpensTheWordsPageFromAnotherTab` and
`testLookUpOfAWordWithSeveralEntriesShowsItsSearchResults`.

## Translate with Zenbu

**Translate with Zenbu** is a Shortcuts action that takes text, which Siri runs from "Translate
with Zenbu Japanese". From any tab it opens Translate's typed translation
([Typing to translate](translate.md#typing-to-translate)) with that text, translated as if it had
been typed. A running conversation keeps going under it, and Back returns to what Translate was
showing.

Check: package `AppLinkTests.destinations`; UI
`AppLinkUITests.testTranslateWithZenbuOpensTypedTranslationWithTheText`, with the Translate
harness.

## The share sheet

Three actions are listed among the share sheet's actions on iPhone and iPad, as other apps' are
(**Edit Actions…** orders them), and in the Share menu on the Mac:

- **Look Up in Zenbu**, for shared or selected text, does what the Shortcuts action does.
- **Translate with Zenbu**, for text, does what its Shortcuts action does.
- **Image Search in Zenbu**, for one to eight images, opens Image Search on them in Translate, as a
  photo picked in the app would ([Image Search](translate.md#image-search)). Image Search's limits
  hold: 8 images at most, so the action isn't offered for more, and each image at most 12 MB,
  12,000 pixels a side, and 40 megapixels. An image past a limit is left out, and when none can
  be read, Zenbu says "The shared images are not supported images."

Each action opens Zenbu at once, with nothing to choose first. Blank text opens nothing.

Check: package `ShareActionTests` (the text each action takes, the images copied for the app with
their names kept apart, and the limits) and `AppLinkTests.destinations`; contract
`apps/ios/Tools/tests/test_share_actions.py` (the three extensions, what each is offered for, and
the App Group they share with the app); UI
`AppLinkUITests.testTranslateWithZenbuInTheShareSheetOpensTypedTranslationWithTheSharedText` (the
real share sheet, from a word's **Share**, through the extension to Text, on iPhone and iPad),
`testAnImageSharedWithZenbuOpensImageSearchOnIt`, with a stand-in for the images an extension
leaves the app, and `testSharedImagesTheAppCannotReadSaySo`.

## Links in Zenbu's own scheme

Each action opens Zenbu with a link in its own scheme, its bundle ID: `com.zenbujapanese.dictionary`,
or with Zenbu Dev's or a test build's suffix, so each build opens only itself. A zenbujapanese.com
dictionary link written in that scheme, such as
`com.zenbujapanese.dictionary://zenbujapanese.com/dictionary/見る-1259290/`, opens as the website's
own link does ([Links from zenbujapanese.com](dictionary.md#links-from-zenbujapanesecom)).

Check: package `AppLinkTests.notActions`, `bundleIDs`, and `websiteLinkInTheAppsScheme`; UI
`AppLinkUITests.testAWebsiteLinkOpensItsWordInTheApp`.

## Checked by hand

XCUITest can't run Siri, Spotlight, the Shortcuts app, or another app's share sheet; it does run
Zenbu's own share sheet on iPhone and iPad, above. Check these on
a device, in a Zenbu Dev build so the TestFlight app is untouched
([`ios.md`](../../../../docs/agents/ios.md#beside-the-testflight-app)), each beside the automated
check that comes closest:

| By hand | Closest automated check |
| --- | --- |
| Siri: "Look up in Zenbu", then 見る, opens 見る's Word Detail; "Translate with Zenbu", then a sentence, opens Text with it | `AppLinkTests.inbox`; the UI tests open the link the action hands the window |
| Spotlight lists Look Up and Translate under Zenbu, and each asks for its text | None: the build's `Metadata.appintents` names both, read after building |
| Shortcuts lists both actions under Zenbu Japanese; a shortcut that takes the share sheet's text and runs Look Up in Zenbu opens the word | The same |
| Safari: select 見る, Share, **Look Up in Zenbu** opens 見る; **Translate with Zenbu** opens Text with the selection | `AppLinkUITests.testTranslateWithZenbuInTheShareSheetOpensTypedTranslationWithTheSharedText` (Zenbu's own share sheet), `ShareActionTests.sharedText` |
| Photos: share one photo, then eight, with **Image Search in Zenbu**; with nine the action isn't offered | `ShareActionTests.sharedImages` and `sharedImageLimits`; `test_share_actions.py` (offered for at most `importLimit`) |
| The Mac: the same from Safari's and Photos' Share menus, and a word's **Share** in Zenbu, into the window already open | The package tests and `AppLinkUITests` on the Mac, from the link on |
| Zenbu Dev beside the TestFlight app: each one's actions open that app | `AppLinkTests.bundleIDs` and `notActions` |
