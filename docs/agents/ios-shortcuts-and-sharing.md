# Shortcuts and share-sheet actions (iOS)

How the app's Shortcuts, Siri, Spotlight, and share-sheet actions are built (#394). What each does
for a learner, and what is checked by hand, is in the product docs'
[Shortcuts and sharing](../../apps/ios/docs/product/shortcuts-and-sharing.md). The rest of the app
is in [`ios.md`](ios.md).

## One entry point: the app's links

Every action opens the app with a link, and the app has one place a link lands.

- **The links.** `AppAction` (`apps/ios/Modules/Sources/AppActions/AppAction.swift`) writes and
  reads them: `<scheme>://look-up?text=…`, `<scheme>://translate?text=…`, and
  `<scheme>://image-search?share=<UUID>&image=<name>&image=…`. Text is percent-encoded with only
  the unreserved characters left as they are, so `&`, `+`, `#`, and `/` come back as they went.
- **The scheme is the app's bundle ID**, registered in `apps/ios/App/Info.plist` as
  `$(PRODUCT_BUNDLE_IDENTIFIER)`: `com.zenbujapanese.dictionary`, Zenbu Dev's `.dev`, and the UI
  tests' `.uitests` each open only themselves, so Zenbu Dev's share actions never open the
  TestFlight app. A scheme any app can claim is safe here: a link only opens a screen the app
  already has, with text the learner sees, and names images only inside the App Group.
- **Where a link lands.** `AppLinkOpening` (`AppLinkOpening.swift`, on `SearchExperienceRootView`)
  takes the share sheet's and the website's links from `onOpenURL`, and the Shortcuts actions'
  from `AppLinkInbox`. `AppLink` names the screen: the dictionary, Translate's typed text
  (`TranslateRoute.text`, as Document opens it), or Image Search on the shared files, which go
  through `ImageTextImport` and the same reads as pasted files (`ImageTextAsset.loadCopies`: the
  first 8, each through `readCopy`'s size and dimension checks).
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
  builds don't have, and an image share has no link of the website's to open.
- A phrase can't hold a text parameter, so Siri asks for the text (`requestValueDialog`).
  `INAlternativeAppNames` in `Info.plist` lets Siri hear "Zenbu" for the app.

## The share sheet

App Intents can't take what the share sheet shares, so each action is an app extension in
`apps/ios/ShareActions/`: `LookUpShareAction`, `TranslateShareAction`, and
`ImageSearchShareAction`. The sheet lists one row per extension, under the extension's display
name. Each is a one-line subclass of `ShareActionController`
(`apps/ios/Modules/Sources/AppActions/Platform/ShareActionController.swift`), which reads the shared
items (`ShareAction`), opens the app with the link, and completes the request.

- **An Action extension on iOS, a Share extension on the Mac.** On iPhone and iPad they're Action
  extensions (`com.apple.ui-services`), in the sheet's list of actions as Oyomi's **OCR in Oyomi**
  is. macOS keeps Action extensions out of the Share menu (System Settings lists them apart), so
  there they're Share extensions (`com.apple.share-services`). The build setting `ZENBU_SHARE_EXTENSION_POINT`
  chooses, per SDK, and each `Info.plist` names it.
- **Its icon.** iOS draws an action's icon from its image's alpha alone, so the app's own opaque
  icon came out as a black square. Each extension has `ActionIcon`
  (`apps/ios/ShareActions/Assets.xcassets`), the app icon's red 全 cut out on a clear ground,
  set for iOS only (`ASSETCATALOG_COMPILER_APPICON_NAME[sdk=iphone*]`).
- **Reading what's shared.** Text is read with `loadItem` for the first plain-text type a
  provider has, as a string, an attributed string, or UTF-8 or UTF-16 data: SwiftUI's `ShareLink`
  hands text over as data that `loadObject(ofClass: String.self)` can't read.
- **What each is offered for** is its `NSExtensionActivationRule`: text for the two text actions,
  one to eight images for Image Search (`NSExtensionActivationSupportsImageWithMaxCount`, held to
  `ImageTextSource.importLimit` by `test_share_actions.py`).
- **Opening the app.** Apple documents no call that opens an Action or Share extension's own
  app: `NSExtensionContext.open` works only for Today and iMessage extensions. The controller asks
  its own window scene to open the link (`UIScene.open(_:options:)`, public and not marked
  unavailable to extensions), which iOS 26.2 does; walking the responder chain to the
  `UIApplication` isn't needed. If a later iOS refuses, the action closes and nothing opens, and
  the share-sheet UI test (Tests) fails. App Review may still object to an extension that opens its
  app; the supported alternative is an Action extension that shows the result in its own UI, as
  Oyomi's does, which here means the dictionary and the core inside the extension. On the Mac,
  `NSWorkspace.open(_:withApplicationAt:)` opens the extension's own app, never another copy that
  claims the scheme, such as a second build on the same Mac.
- **Bundle IDs.** `com.zenbujapanese.dictionary$(ZENBU_BUNDLE_ID_SUFFIX)` with `.look-up`,
  `.translate`, and `.image-search`; an extension finds its app's bundle ID, scheme, and App Group
  from its own (`AppAction.appBundleID(ofExtension:)`). `CURRENT_PROJECT_VERSION` and
  `MARKETING_VERSION` are the project's settings, so the extensions carry the app's version, as
  App Store Connect requires.
- **Kept small.** The extensions link only `AppActions`, which imports Foundation,
  UniformTypeIdentifiers, and UIKit or AppKit (`pnpm verify layers`), and never
  `SearchExperience`: its resources, the dictionary among them, would be copied into each.

## Shared images and the App Group

Text travels in the link. Images can't, so the app and the extensions share one App Group,
`group.com.zenbujapanese.dictionary$(ZENBU_BUNDLE_ID_SUFFIX)` (`apps/ios/App/ZenbuJapanese.entitlements`
and `apps/ios/ShareActions/ShareActions.entitlements`), which holds nothing else.

- `SharedImages` keeps `Shared Images/<share>/` there. Image Search's extension removes the share
  before it, copies each image under its own name (a name used twice gets " 2"), and opens the
  `image-search` link that names them. The app reads them, then deletes the share.
- A build signed without entitlements, such as the Mac built to run locally
  (`CODE_SIGN_ENTITLEMENTS=`), has no App Group: sharing images to it says they can't be read,
  and text works.
- **What a person does once**, on TSMC LLC's team (`847HR8U8D9`): register the App Group, turn on
  App Groups for the App ID `com.zenbujapanese.dictionary` (and `.dev`), and register the three
  extensions' App IDs with it, for iOS and the Mac. Automatic signing then makes their profiles.

## Tests

- **Package:** `AppLinkTests` (each link both ways, which links are actions, the bundle IDs, the
  screen each opens, Look Up on the bundled dictionary, and the Shortcuts actions' inbox) and
  `ShareActionTests` (the shared text, the images copied for the app, and Image Search's limits on
  them). **Core:** `embedded/dictionary.test.ts` for `lookUp`. **Contract:**
  `apps/ios/Tools/tests/test_share_actions.py` (the targets, their bundle IDs, extension points,
  activation rules, App Group, the app's scheme, the embedding, and the shared version).
- **UI:** `AppLinkUITests` hands the running app each action's link on iPhone, iPad, and the Mac
  (`TestDevice.open(_:in:)`). On iPhone and iPad that's `XCUIApplication.open(_:)`, which works only
  because the app registers its scheme. On the Mac, LaunchServices gives a scheme's link to
  whichever copy of the app it picks, and a Mac that builds several checkouts has many, so a Debug
  build launched with `ZENBU_OPEN_LINK=<link>` hands that link to the window, through
  `AppLinkInbox` as the Shortcuts actions do, when the test posts
  `com.zenbujapanese.dictionary.uitests.open-link`. One test runs a share-sheet action end to end
  on iPhone and iPad: a word's **Share**, then **Translate with Zenbu** in the system's sheet,
  whose extension opens the app on Text. On the Mac that button's Share menu opens, but it isn't
  in the app's tree for XCUITest, and macOS lists a new app's share extensions there only once the
  person turns them on in **Edit Extensions…** (`pluginkit -m -p com.apple.share-services` shows
  them without the `+` the system's own carry). So on the Mac
  `ShareActionTests.wordShareThroughTheExtensions` stands in: a word's Share text through each text
  action's own handling, to the screen the app opens for it. In a Debug build,
  `ZENBU_SHARED_IMAGES={"share":"<UUID>","images":{"<name>":"<base64>"}}` writes those images to a
  folder in the app's temporary directory that stands in for the App Group, where the extension
  would have left them, so the Mac's test, which has no App Group, opens them too.
- To try a link in the Simulator without the share sheet:
  `xcrun simctl openurl <udid> 'com.zenbujapanese.dictionary://look-up?text=%E8%A6%8B%E3%82%8B'`.
- What only a device shows, and the check closest to each, is in the product docs' Checked by
  hand.
