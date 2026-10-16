# Links between zenbujapanese.com and the app

How the app opens the website's links, and the links its **Share** sends. The rest of the app's
guide is [`ios.md`](ios.md).

The app opens zenbujapanese.com's search and word URLs, and the kanji URLs the website removed,
as universal links (#568; what each opens is in the [product docs](../../apps/ios/docs/product/website-links.md)).
`apps/ios/App/ZenbuJapanese.entitlements` claims `applinks:zenbujapanese.com`, and iOS opens a
link in the app only once it has fetched the site's association file, through Apple's CDN, and
found the app's ID in it ([`web.md`](web.md), Links that open the app). That takes two things
only a person can do: enable Associated Domains for the App ID `com.zenbujapanese.dictionary` in
the Apple Developer team that holds it, TSMC LLC's, and set the website's `APPLE_TEAM_ID` to that
team, `847HR8U8D9`.

SwiftUI hands a universal link to `onOpenURL` in `WebsiteLinkOpening` (`WebsiteLinkOpening.swift`),
which `SearchExperienceRootView` applies. It switches to Search from any tab, Translate included,
and `WebsiteLinkRoute.apply` puts the route on Search's stack. `LookupClient.websiteRoute`
hands the link's host and path to the core (`websiteRoute`,
[`dictionary-core.md`](dictionary-core.md), Embedded), which reads the website's URL shapes,
decoded one path segment at a time, with the parser the website uses, and finds a word URL's
entry by its JMdict entry number. Only the host and path are read, so a URL with any scheme and
the host `zenbujapanese.com` routes the same way.

**Share** on a word or kanji sends one of these links with its text (#467). `WordPage.Entry` hands
the core the record the entry was read from (`DictionaryEntry.sourceRecord`; for an entry JMdict
lists twice, the one whose Language Reference ID stands for both, as the website's search picks),
and the core's `wordPage` answers `shareURL`, the word page's canonical URL, from `wordSlug` and
the entry number, while `kanjiPage` answers the kanji's search ([`dictionary-core.md`](dictionary-core.md),
Detail). `SharedPage` in `SavedItemActions.swift` holds a page's title, text, and link, and
`ShareButton` gives them to SwiftUI's `ShareLink` as the item, a `URL`, with the text as its
message and a preview titled with the page, so UIKit's share sheet and AppKit's sharing picker
take a web link plus text; a page without a link, such as a kanji whose page hasn't loaded, shares
its text alone. `WordDetailShareTests` checks each link against the canonical URL and reads it
back through `websiteRoute`, and `WordDetailUITests.testShareOffersTheWordsWebLink` and
`testShareOffersTheKanjisWebLink` open the share sheet and find **Add to Reading List**, which iOS
and macOS offer only for a web link, titled with the page on iPhone and iPad (the title is
LinkPresentation's caption, `LP.CaptionBar.TopCaption`, which an iOS release could rename). On
the Simulator, **Copy** puts both on the pasteboard, a `public.url` and the text, but no test can
read what other destinations get, so on a device share a word to Messages, Notes, Mail, AirDrop,
and a messaging app such as LINE, check that the text and the link arrive together, and tap the
link: it opens the word in Zenbu once the association file is live, and the website before then.

Check it with `WebsiteLinkTests`. The Simulator sends an `https` link to Safari until the
association file is live, which would also load the site, so to see a link land in the app
before then, build without the entitlements and with a URL scheme that is never committed, added
to a copy of the app's `Info.plist` so the account service's settings stay, and open the same URL
under that scheme:

```sh
cp apps/ios/App/Info.plist /tmp/link-check.plist
plutil -insert CFBundleURLTypes -json '[{"CFBundleURLSchemes":["zenbu-check"]}]' /tmp/link-check.plist
xcodebuild -project apps/ios/ZenbuJapanese.xcodeproj -scheme ZenbuJapanese \
  -destination 'platform=iOS Simulator,id=<udid>' ONLY_ACTIVE_ARCH=YES ARCHS=arm64 \
  INFOPLIST_FILE=/tmp/link-check.plist CODE_SIGN_ENTITLEMENTS= build
xcrun simctl openurl <udid> 'zenbu-check://zenbujapanese.com/dictionary/見る-1259290/'
```

Once the file is live, check it on a device: tapping
`https://zenbujapanese.com/dictionary/見る-1259290/` in Notes or Messages opens 見る's Word
Detail, and the same link opens the website on a device without the app.
