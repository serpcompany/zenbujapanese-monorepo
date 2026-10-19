# Shortcuts and Siri

Other apps reach Zenbu Japanese through Shortcuts, Siri, and Spotlight, on iPhone, iPad, and the
Mac. Each opens Zenbu on a screen it already has, and nothing leaves the device: looking up and
translating run on it, as they do inside the app. How it's built is in
[`ios-shortcuts.md`](../../../../docs/agents/ios-shortcuts.md).

- Source: #394. Of the four actions the owner chose on 2026-10-16, the two Shortcuts actions ship
  first; the share sheet's wait, since App Review may reject an extension that opens its app.

## Look Up in Zenbu

**Look Up in Zenbu** is a Shortcuts action that takes text and opens Zenbu on it. Siri runs it from
"Zenbu look up", "Zenbu lookup", "Look up in Zenbu", or "Look up a word in Zenbu", each also with
"Zenbu Japanese", and asks what to look up; Spotlight lists it with the app's other shortcuts.
"Zenbu" on its own is a phrase for it too, but whether Siri runs it rather than opening the app
isn't checked yet (Checked by hand, below). In Shortcuts it takes the text the step before it hands
on, so a shortcut shown in the share sheet can pass it the shared text.

### Saying the word in one breath

"Zenbu look up taberu" opens 食べる at once, for the words Zenbu tells Siri about ahead of time
(**Look Up Word in Zenbu**). Siri listens in English, so a word is said in romaji, without long
marks or apostrophes: "taberu", "gakkou", "ramen", "konnichiha". Any other word goes the old way:
"Zenbu look up", then the word when Siri asks.

Zenbu tells Siri about, in this order, each spoken form once, up to the limit below:

1. your recent searches, newest first, when Siri could hear them as one to three English words:
   one typed in English or romaji as typed, one in kana in romaji, and one in kanji in the romaji
   of its only reading (a kanji search with several readings is left out);
2. the words in your lists, newest first, then your known words, newest first, each in the romaji
   of its reading (kanji you saved are left out); and
3. common words: JLPT N5, then N4, then N3, each level most frequent on YouTube first.

The list is told to Siri again at launch, and two seconds after a search, a save to a list, or a
word marked known or unknown (signed-in changes from another device included). The words open as
a look-up does: 食べる opens its Word Detail, a word written the same as other entries its search
results, and an English search its results. Siri shows the word in romaji with its Japanese under
it.

Limit: 100 words. Apple publishes no cap, and warns that every word is learned once per phrase, so
there is one phrase with a word in it. On 2026-10-20 an iPhone 17 Pro Max took the 100 words at
launch; how well Siri hears them, and a larger list, are being measured (Checked by hand).

Check: core `embedded/siri-words.test.ts` (the spoken form, the order, each spoken form once, the
limit); package `SiriWordsTests` (which of the learner's words are told, in what order, on the
bundled dictionary, the word's spoken form and ID, and that Siri relearns the list only when it
changes); the build's `Metadata.appintents` names the phrase `${applicationName} look up ${word}`.

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
the window its link, once); UI `AppLinkUITests.testLookUpOpensTheWordsPageFromAnotherTab` and
`testLookUpOfAWordWithSeveralEntriesShowsItsSearchResults`.

## Translate with Zenbu

**Translate with Zenbu** is a Shortcuts action that takes text, which Siri runs from "Zenbu
translate", "Translate with Zenbu", or "Translate text in Zenbu", each also with "Zenbu
Japanese", and asks what to translate. From any tab it opens Translate's typed translation
([Typing to translate](translate.md#typing-to-translate)) with that text, translated as if it had
been typed. A running conversation keeps going under it, and Back returns to what Translate was
showing.

Check: package `AppLinkTests.destinations`; UI
`AppLinkUITests.testTranslateWithZenbuOpensTypedTranslationWithTheText`, with the Translate
harness.

## Links in Zenbu's own scheme

Each action opens Zenbu with a link in its own scheme, its bundle ID: `com.zenbujapanese.dictionary`,
or with Zenbu Dev's or a test build's suffix, so each build opens only itself. A zenbujapanese.com
dictionary link written in that scheme, such as
`com.zenbujapanese.dictionary://zenbujapanese.com/dictionary/見る-1259290/`, opens as the website's
own link does ([Links from zenbujapanese.com](dictionary.md#links-from-zenbujapanesecom)).

Check: package `AppLinkTests.notActions`, `schemes`, and `websiteLinkInTheAppsScheme`; UI
`AppLinkUITests.testAWebsiteLinkOpensItsWordInTheApp`.

## Checked by hand

XCUITest can't run Siri, Spotlight, or the Shortcuts app. Check these on a device, in a Zenbu Dev
build so the TestFlight app is untouched
([`ios.md`](../../../../docs/agents/ios.md#beside-the-testflight-app)), each beside the automated
check that comes closest:

| By hand | Closest automated check |
| --- | --- |
| Siri: "Zenbu", "Zenbu look up", and "Look up in Zenbu", each then 見る, open 見る's Word Detail; "Zenbu translate" and "Translate with Zenbu", each then a sentence, open Text with it | `AppLinkTests.inbox`; the UI tests open the link the action hands the window |
| Siri: "Zenbu look up taberu" opens 食べる's Word Detail in one breath, for a word near the start and one near the end of the list, and a word not in the list goes the old way | `SiriWordsTests` (the list), and the build's `Metadata.appintents` names `${applicationName} look up ${word}` |
| Spotlight lists Look Up and Translate under Zenbu, and each asks for its text | None: the build's `Metadata.appintents` names both, read after building |
| Shortcuts lists both actions under Zenbu Japanese; a shortcut shown in the share sheet that runs Look Up in Zenbu on its input opens the word | The same |
| The Mac: Look Up in Zenbu from Shortcuts, with Zenbu open, opens the word in the window already open | `AppLinkUITests` on the Mac, from the link on |
| Zenbu Dev beside the TestFlight app: each one's actions open that app | `AppLinkTests.schemes` and `notActions` |
