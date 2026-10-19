# Shortcuts and Siri (iOS)

How the app's Shortcuts, Siri, and Spotlight actions are built (#394). What each does for a
learner, and what is checked by hand, is in the product docs'
[Shortcuts and Siri](../../apps/ios/docs/product/shortcuts.md). The rest of the app is in
[`ios.md`](ios.md).

## One entry point: the app's links

Every action opens the app with a link, and the app has one place a link lands.

- **The links.** `AppAction` (`apps/ios/Modules/Sources/SearchExperience/AppAction.swift`) writes
  and reads them: `<scheme>://look-up?text=…` and `<scheme>://translate?text=…`. Text is
  percent-encoded with only the unreserved characters left as they are, so `&`, `+`, `#`, and `/`
  come back as they went.
- **The scheme is the app's bundle ID**, registered in `apps/ios/App/Info.plist` as
  `$(PRODUCT_BUNDLE_IDENTIFIER)`: `com.zenbujapanese.dictionary`, Zenbu Dev's `.dev`, and the UI
  tests' `.uitests` each open only themselves. A shortcut's **Open URLs**, `simctl openurl`, and
  the UI tests open the same screens with it. A scheme any app can claim is safe here: a link only
  opens a screen the app already has, with text the learner sees.
- **Where a link lands.** `AppLinkOpening` (`AppLinkOpening.swift`, on `SearchExperienceRootView`)
  takes the scheme's and the website's links from `onOpenURL`, and the Shortcuts actions' from
  `AppLinkInbox`. `AppLink` names the screen: the dictionary, or Translate's typed text
  (`TranslateRoute.text`, as Document opens it).
- **The dictionary is the core's.** A look-up asks the core's `lookUp`
  ([`dictionary-core.md`](dictionary-core.md), Embedded), which searches the text and answers
  the word when the text is Japanese written or read as one entry, or deinflects to one, and a
  search otherwise. A website link asks `websiteRoute` as before; only its host and path are read,
  so the website's links in the app's scheme open the same pages.

## Shortcuts, Siri, and Spotlight

`apps/ios/App/ZenbuShortcuts.swift` holds `LookUpIntent` and `TranslateIntent`, App Intents with a
text parameter, and `ZenbuShortcuts`, the `AppShortcutsProvider` that gives Siri and Spotlight
their phrases. They live in the app target because the App Intents metadata processor reads the
app target's own sources; what they call is in the package, where it's tested.

- `supportedModes` is `.foreground(.immediate)`, iOS and macOS 26's replacement for
  `openAppWhenRun`: the system brings the app forward, then `perform()` runs in the app and hands
  `AppLinkInbox.shared` the action's link. The window that appears active takes it, once, so a
  second Mac or iPad window doesn't open it too.
- Not `OpenIntent`: its target must be an `AppEntity` or `AppEnum`, and these take any text. Not
  `URLRepresentableIntent` or `OpenURLIntent`: they open a universal link, which Debug and UI test
  builds don't have.
- A phrase can't hold a text parameter, so Siri asks for the text (`requestValueDialog`). App
  Shortcut phrases take only an `AppEntity` or `AppEnum` value, never free text.
  `INAlternativeAppNames` in `Info.plist` lets Siri hear "Zenbu" for the app, with the
  pronunciation hint "zen boo": on build 6 Siri sometimes heard a quick "Zenbu" as "Zumba" and
  searched the web (the owner's recording, 2026-10-20).
- Phrases that start with the app's name ("Zenbu look up", "Zenbu translate") are the owner's
  (2026-10-19), and the app's name on its own runs Look Up. The metadata processor accepts a
  phrase that is only `\(.applicationName)`; whether Siri prefers it to opening the app is checked
  on a device.
- They need no entitlement, App Group, or App ID beyond the app's own.

## Tests

- **Package:** `AppLinkTests` (each link both ways, which links are actions, the schemes, the
  screen each opens, Look Up on the bundled dictionary, and the Shortcuts actions' inbox).
  `DictionaryCoreTests.coresMadeAtOnce` makes cores on several threads at once, as a look-up's and
  the screens' are made at launch: JavaScriptCore crashed making two contexts at once, so
  `DictionaryCore` makes one at a time. **Core:** `embedded/dictionary.test.ts` for `lookUp`.
- **UI:** `AppLinkUITests` hands the running app each action's link on iPhone, iPad, and the Mac
  (`TestDevice.open(_:in:)`). On iPhone and iPad that's `XCUIApplication.open(_:)`, which works only
  because the app registers its scheme. On the Mac, LaunchServices gives a scheme's link to
  whichever copy of the app it picks, and a Mac that builds several checkouts has many, so a Debug
  build launched with `ZENBU_OPEN_LINK=<link>` hands that link to the window, through
  `AppLinkInbox` as the Shortcuts actions do, when the test posts
  `com.zenbujapanese.dictionary.uitests.open-link`.
- **The actions' metadata:** after a build, the app's `Metadata.appintents/extract.actionsdata`
  names both intents, their text parameter, and the provider's phrases.
- To try a link in the Simulator:
  `xcrun simctl openurl <udid> 'com.zenbujapanese.dictionary://look-up?text=%E8%A6%8B%E3%82%8B'`.
- What only a device shows, and the check closest to each, is in the product docs' Checked by
  hand.
