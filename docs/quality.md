# Quality

A grade for each product area and layer, from what the repository holds: its automated tests,
whether CI runs them before a pull request merges, whether docs describe its behavior, and how a
change is checked by hand. Each row names the code its grade covers (Code) and the day it was
last graded (Graded, in UTC). The line under each table gives the evidence for each grade and the
main gap, which is what would raise it. Known debt, each item with its issue, is in
[`tech-debt.md`](tech-debt.md).

The weekly maintenance report lists every row whose code changed after the day it was graded,
under "Scores to re-grade", and doc gardening re-grades those rows
([`ci.md`](agents/ci.md), Weekly maintenance). A folder in Code counts as changed when any file
in it changes.

| Grade | Means |
| --- | --- |
| A | Tests cover the behavior, CI runs them on every pull request that changes it, and docs describe it. What's left is small and tracked. |
| B | Tests, CI, and docs cover the main behavior, but a notable part is checked only by hand, or not at all. |
| C | Tests and docs exist, but one leg is missing: no CI runs the tests before merge, or no doc describes the behavior. |
| D | Almost nothing is tested, run before merge, or written down. |

"By hand" means a person or an agent checking the running app or site.

## iOS app

The app's tests are the `SearchExperienceTests` target, in
`apps/ios/Modules/Tests/SearchExperienceTests/`, and the `TranslatorCoreTests` target, in
`apps/ios/Modules/Tests/TranslatorCoreTests/`, run with `xcodebuild` on a Mac
([`ios.md`](agents/ios.md), Current verification boundary). The `iOS` workflow runs them on a
macOS runner only once the owners turn it on (`IOS_SWIFT_TESTS`), so until then they run only by
hand. The product docs are in
[`apps/ios/docs/product/`](../apps/ios/docs/product/index.md), and the manual checks named below
are sections of `ios.md`.

| Area | Grade | Graded | Code | Tests | CI before merge | Product docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Search | C | 2026-10-10 | `apps/ios/Modules/Sources/SearchExperience/SearchView.swift`, `apps/ios/Modules/Sources/SearchExperience/SearchField.swift`, `apps/ios/Modules/Sources/SearchExperience/SearchInputPanel.swift`, `apps/ios/Modules/Sources/SearchExperience/HandwritingInputView.swift`, `apps/ios/Modules/Sources/SearchExperience/HandwritingInputModel.swift`, `apps/ios/Modules/Sources/SearchExperience/RadicalInputView.swift`, `apps/ios/Modules/Sources/SearchExperience/SearchResultsView.swift`, `apps/ios/Modules/Sources/SearchExperience/SearchResultSort.swift`, `apps/ios/Modules/Sources/SearchExperience/SearchResultFilter.swift`, `apps/ios/Modules/Sources/SearchExperience/SearchResultsMenu.swift`, `apps/ios/Modules/Sources/SearchExperience/FrequencyDictionariesView.swift`, `apps/ios/Modules/Sources/SearchExperience/FrequencyPack.swift`, `apps/ios/Modules/Sources/SearchExperience/FrequencyPackManager.swift`, `apps/ios/Modules/Sources/SearchExperience/FrequencyPackDownloads.swift`, `apps/ios/Modules/Sources/SearchExperience/FrequencyPackDownloadProgress.swift`, `apps/ios/Modules/Sources/SearchExperience/LookupClient.swift`, `apps/ios/Modules/Sources/SearchExperience/LookupDatabase.swift`, `apps/ios/Modules/Sources/SearchExperience/JapaneseDeinflection.swift`, `apps/ios/Modules/Sources/SearchExperience/WebsiteLink.swift` | `SearchResultOrderingTests`, `SearchResultSortTests` (the Sort menu's orders, fallback, and stored choice), `SearchResultFilterTests` (known or unknown words, order kept, the filter count, and the stored filter), `HandwritingUndoTests`, `EnglishSearchCommonWordTests` (the common word leads dog, water, cat, eat, and house), `JapaneseDeinflectionTests`, `WebsiteLinkTests`, `SearchFrequencyChipTests`, `SearchFrequencyOrchestrationTests`, `FrequencyPackLifecycleTests`, `FrequencyPackDownloadsTests` (several downloads side by side, stopping one, stops not counted as failures, and the download delegate's progress), `PartOfSpeechFormatterTests`, `PitchAccentTests`, and the app-recorded suites `SearchConformanceTests`, `SearchResultsConformanceTests`, and `ExampleSearchConformanceTests` | None. `Search parity` checks only that a ported Swift file and its TypeScript port change together | [Search](../apps/ios/docs/product/dictionary.md#search), [Top bar](../apps/ios/docs/product/dictionary.md#top-bar), [Handwriting and Radicals](../apps/ios/docs/product/dictionary.md#handwriting-and-radicals), [Sorting results](../apps/ios/docs/product/dictionary.md#sorting-results), [Filtering results](../apps/ios/docs/product/dictionary.md#filtering-results), [Links from zenbujapanese.com](../apps/ios/docs/product/dictionary.md#links-from-zenbujapanesecom) | Search manual checks, in the Simulator; a link from the website, on a device ([`ios.md`](agents/ios.md), Links from the website) |
| Word and kanji detail | C | 2026-10-06 | `apps/ios/Modules/Sources/SearchExperience/WordDetailView.swift`, `apps/ios/Modules/Sources/SearchExperience/WordDetailSections.swift`, `apps/ios/Modules/Sources/SearchExperience/KanjiDetailView.swift`, `apps/ios/Modules/Sources/SearchExperience/KanjiDetailSections.swift` | The app-recorded suites `WordDetailConformanceTests` and `KanjiDetailConformanceTests`, and `KanjiReadingSplitterTests`, `LinkedWordResolutionTests`, `KanaHeadwordExampleTests`, `CompoundPitchTests`, `JapaneseInflectionGroupingTests`, `WordSheetPresentationTests` | None | [Dictionary and kanji details](../apps/ios/docs/product/dictionary.md#dictionary-and-kanji-details) | The parsing comparison harness; no checklist for the screens themselves |
| Player | C | 2026-10-09 | `apps/ios/Modules/Sources/SearchExperience/WatchAndListenView.swift`, `apps/ios/Modules/Sources/SearchExperience/SearchField.swift`, `apps/ios/Modules/Sources/SearchExperience/WatchSessionView.swift`, `apps/ios/Modules/Sources/SearchExperience/WatchHistory.swift`, `apps/ios/Modules/Sources/SearchExperience/PlaybackScrubber.swift`, `apps/ios/Modules/Sources/SearchExperience/YouTubePlayer.swift`, `apps/ios/Modules/Sources/SearchExperience/YouTubeCaptions.swift`, `apps/ios/Modules/Sources/SearchExperience/CaptionCard.swift` | `YouTubeCaptionsTests`: links, caption-track choice, timed text, translation pairing, card size, word meanings, and comprehension; `AccountSyncWatchHistoryTests`: Recent's order, its 50, its dates, and its sync | None | [Player](../apps/ios/docs/product/player.md) | Player manual checks, with four videos; Search manual checks for the shared search field |
| Lists and Known Words | C | 2026-10-07 | `apps/ios/Modules/Sources/SearchExperience/WordLists.swift`, `apps/ios/Modules/Sources/SearchExperience/WordListsView.swift`, `apps/ios/Modules/Sources/SearchExperience/WordKnowledge.swift`, `apps/ios/Modules/Sources/SearchExperience/KnownWordsView.swift`, `apps/ios/Modules/Sources/SearchExperience/SavedItem.swift` | `WordListsTests`, `WordKnowledgeTests`, `SavedKanjiTests`: storage, reloads, unreadable and newer-version files, and failed writes | None | [Known Words and Lists](../apps/ios/docs/product/index.md#known-words) | Word lists and Known words manual checks |
| Image Search | C | 2026-10-09 | `apps/ios/Modules/Sources/SearchExperience/ImageTextFlowModel.swift`, `apps/ios/Modules/Sources/SearchExperience/ImageTextFlowView.swift`, `apps/ios/Modules/Sources/SearchExperience/ImageTextImport.swift`, `apps/ios/Modules/Sources/SearchExperience/ImageTextRecognitionClient.swift`, `apps/ios/Modules/Sources/SearchExperience/ImageTextExplanationClient.swift` | `ImageTextRecognitionTests` (Vision on the images in `apps/ios/Modules/Tests/SearchExperienceTests/Fixtures/ImageText`), `ImageTextTranslationTests`, `ImageTextExplanationTests`, `ImageTextContextNotesTests` | None | [Image Search](../apps/ios/docs/product/translate.md#image-search) | Image Search manual checks; Apple Translation only on a device |
| Translate | C | 2026-10-09 | `apps/ios/Modules/Sources/TranslatorCore/`, `apps/ios/Modules/Sources/TranslatorOnDevice/`, `apps/ios/Modules/Sources/SearchExperience/Translate/`, `apps/ios/Modules/Sources/SearchExperience/SettingsRowLabel.swift`, `apps/ios/Tools/TranslateReplay/` | `TranslatorCoreTests`: the conversation engine (turns, held audio, the 30-second cutoff, silence, pause, background, leaving, modes, muting in both modes), bilingual transcript merging, typed-language detection, History storage and bookmarks, synced bookmarks and their file, playback timing, and pause detection; `SearchExperienceTests`: the home's options (`TranslateStartTests`), document text, each conversation's known-word share, and the spoken translation's time limit; `translate-replay`, run by hand: recorded iPhone audio through the real recognizers, scored against the script | None | [Translate](../apps/ios/docs/product/translate.md) | Translate manual checks: the scripted Simulator harness for every screen; the microphone, speech recognition, and Apple Translation only on a device |
| Account and sync | C | 2026-10-09 | `apps/ios/ZenbuJapanese.xcodeproj/project.pbxproj`, `apps/ios/Modules/Sources/SearchExperience/ZenbuAccount.swift`, `apps/ios/Modules/Sources/SearchExperience/AccountServiceConfiguration.swift`, `apps/ios/Modules/Sources/SearchExperience/AccountAPI.swift`, `apps/ios/Modules/Sources/SearchExperience/AccountSyncModels.swift`, `apps/ios/Modules/Sources/SearchExperience/AccountTokens.swift`, `apps/ios/Modules/Sources/SearchExperience/AccountSync.swift`, `apps/ios/Modules/Sources/SearchExperience/AccountSyncState.swift`, `apps/ios/Modules/Sources/SearchExperience/AccountSyncScheduler.swift`, `apps/ios/Modules/Sources/SearchExperience/AccountBackgroundSync.swift`, `apps/ios/Modules/Sources/SearchExperience/AppleSignIn.swift`, `apps/ios/Modules/Sources/SearchExperience/GoogleSignIn.swift`, `apps/ios/Modules/Sources/SearchExperience/AccountSignInControls.swift`, `apps/ios/Modules/Sources/SearchExperience/AccountSignInView.swift`, `apps/ios/Modules/Sources/SearchExperience/ZenbuAccountView.swift`, `apps/ios/Modules/Sources/SearchExperience/DeleteAccountView.swift` | `AccountSignInTests`, `AccountSyncTests`, `AccountSyncConflictTests`, `AccountSyncRecoveryTests`, `AccountSignedOutTests`, `AccountSyncWatchHistoryTests`, `AccountSyncBookmarkTests`: the client against a stub server, for sign-in, tokens, the queue and cursor, retries and waits, each entity's conflicts and rejections, order, held list words, `410`, `429`, signing out and back in, another account, one Favorites across phones, watch history and Translate bookmarks and catching up on them, and deleting; `apps/ios/Tools/tests/test_account_service_settings.py`: Release names production's account service and Debug staging's, each with Google's iOS client, both sign as the App Store record's bundle ID and team, and background sync's task is one Info.plist permits | `iOS`'s `contracts` job runs the settings test; the Swift suites only by hand | [Zenbu account and sync](../apps/ios/docs/product/index.md#zenbu-account-and-sync), [Deleting the account](../apps/ios/docs/product/index.md#deleting-the-account) | Account manual checks: a local service on the Simulator; Apple, Google, and staging only on a device |

- **Search, C.** Thorough tests, three suites the website is held to, and a checklist, but no CI.
  Main gap: nothing runs the Swift against its own recorded suites before merge, no suite
  records sentence search (#470), and that iOS hands a website link to the app is checked only
  on a device.
- **Word and kanji detail, C.** The recorded suites cover what both screens draw, but only on a
  Mac. Main gap: no CI.
- **Player, C.** The caption model and Recent's sync are tested; the player isn't. Main gap:
  playback, the highlighted card, the controls, and the live caption fetch are checked only by
  hand.
- **Lists and Known Words, C.** Storage is well tested. Main gap: the screens (swipes, Edit,
  menus, and the list picker) are checked only by hand.
- **Translate, C.** The engine and History are tested with fakes, and every screen runs in the
  Simulator on a scripted conversation. The on-device recognizers were checked on an iPhone with
  a scripted conversation (#627), and `translate-replay` runs the app's recognizer and engine on
  recordings from it, on a Mac. Main gap: that check is local only, on three recordings of
  synthesized voices; CI has no speech models to run it (#640).
- **Account and sync, C.** The client is tested against a stub server, and its flow was run
  against a local service on the Simulator. Main gap: Sign in with Apple, Google, and the screens
  are checked only by hand, and Apple and Google only on a device.
- **Image Search, C.** Recognition runs on real images. Main gap: Apple Translation doesn't run
  in the Simulator, and the on-device model runs only where the Simulator's runtime matches the
  Mac, so translation and Context are checked by hand, on a device.

## Website

The website's tests are Vitest files beside its code in `apps/web/src/`, and Playwright browser
tests in `apps/web/e2e/` that drive its pages at a desktop and a phone width on the dictionary
fixtures. The `Web` workflow runs `pnpm check` (Biome, typecheck, tests, and the build), then the
browser tests on the production build in workerd, on pull requests that change `apps/web/**` or
the core. The product docs are in [`apps/web/docs/product/`](../apps/web/docs/product/index.md).
A change is checked by hand in a browser with the `verify-web` skill
([`SKILL.md`](../.claude/skills/verify-web/SKILL.md)).

| Area | Grade | Graded | Code | Tests | CI before merge | Product docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dictionary pages | B | 2026-10-09 | `apps/web/src/app/dictionary/`, `apps/web/src/app/sitemaps/`, `apps/web/src/components/dictionary/`, `apps/web/src/lib/dictionary/`, `apps/web/src/lib/app-links.ts`, `apps/web/src/test/`, `apps/web/e2e/` | The rendered-page gate in `apps/web/src/components/dictionary/` (`search-results.test.tsx`, `search-examples.test.tsx`, `word-page.test.tsx`, `conjugations.test.tsx`) and its interaction tests, unit tests in `apps/web/src/lib/dictionary/` and `apps/web/src/lib/app-links.test.ts`, route tests under `apps/web/src/app/dictionary/`, the browser tests in `apps/web/e2e/` (search, word, and browse pages, their conjugations and kanji details, URLs, and layout, failing on any console error), and `apps/web/scripts/smoke.sh` after each deploy | `Web` (`check` and `e2e`); `Dictionary API` runs the gate against the service it builds | [Dictionary](../apps/web/docs/product/dictionary.md) and [Browse pages](../apps/web/docs/product/browse.md), which name the check for each behavior | `verify-web`, on the fixtures or the whole dictionary |
| Account pages | B | 2026-10-09 | `apps/web/src/app/login/`, `apps/web/src/app/register/`, `apps/web/src/app/forgot-password/`, `apps/web/src/app/account/`, `apps/web/src/components/account/`, `apps/web/src/lib/account/`, `apps/web/src/hooks/use-apple-sign-in.ts`, `apps/web/src/hooks/use-busy.ts`, `apps/web/src/hooks/use-seems-signed-in.ts` | Unit tests in `apps/web/src/lib/account/` (the client and each answer's shape, access tokens, Apple's popup, messages, loading, settings, and the pages' indexing); interaction tests in `apps/web/src/components/account/` (signing in by code, Apple, and Google, the account page, the profile, ways to sign in, fresh sign-ins, signing out, and deleting, Apple accounts included) against a stand-in for the service; `apps/web/src/app/account-pages.test.tsx` (each page with and without an account service); the browser tests `apps/web/e2e/account.spec.ts` (indexing, sitemaps, the account menu's Log in, the footer, signing in, and the header's initials, against a stand-in), `apps/web/e2e/header.spec.ts` (Sign out from the account menu, against a stand-in), and `apps/web/e2e/account-service.spec.ts` (a learner from registering to deleting, against the real service) | `Web` (`check`, with staging's and production's builds checked for the footer's Sign in; `e2e` with the stand-in); `Account API`'s `website` job, against the service on Postgres 18 | [Account pages](../apps/web/docs/product/account.md) | `verify-web` with the account service running (`web.md`, Account pages) |
| Header and footer | A | 2026-10-09 | `apps/web/src/components/site-header.tsx`, `apps/web/src/components/site-nav.tsx`, `apps/web/src/components/site-menu.tsx`, `apps/web/src/components/site-menu-item.tsx`, `apps/web/src/components/site-actions.tsx`, `apps/web/src/components/site-brand.tsx`, `apps/web/src/components/site-footer.tsx`, `apps/web/src/components/social-links.tsx`, `apps/web/src/components/account-menu.tsx`, `apps/web/src/components/mode-toggle.tsx`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/lib/metadata.ts`, `apps/web/src/lib/site-menus.ts`, `apps/web/src/lib/site-footer.ts`, `apps/web/src/lib/site.ts`, `apps/web/public/` | `apps/web/src/components/site-header.test.tsx` and `site-footer.test.tsx` (every menu and footer link, the current section, the placeholders' targets, the pinned header, and the two items that end it), and `apps/web/src/lib/site.test.ts` (Log in's and Create an account's addresses where the account pages are open and where they're closed); the browser tests in `apps/web/e2e/site.spec.ts` (each menu by click, keyboard, and Escape from 1024 pixels, the drawer, its theme button, and its groups below it, the footer's columns and icons at both widths), `apps/web/e2e/header.spec.ts` (the pinned header, and the account menu's places and keyboard use signed out and signed in), `apps/web/e2e/theme.spec.ts` (System, a saved choice across reloads and before the scripts run, and the keyboard), `apps/web/e2e/contrast.spec.ts` (axe's colour contrast on every kind of page in both themes), and `apps/web/e2e/placeholders.spec.ts` (every `#` link, the account menu's included, is a listed placeholder); `smoke.sh`'s header and footer checks | `Web` (`check`, with staging's and production's builds checked for the footer's Sign in, and `e2e`) | [Dictionary](../apps/web/docs/product/dictionary.md#header-footer-and-site-wide), Header, footer, and site-wide | `verify-web`, at a desktop and a phone width |
| Products pages | B | 2026-10-09 | `apps/web/src/app/products/`, `apps/web/src/components/products/`, `apps/web/src/components/app-screenshot.tsx`, `apps/web/src/lib/products/`, `apps/web/src/lib/app-store.ts`, `apps/web/src/lib/app-screenshots.ts`, `apps/web/src/lib/videos.ts`, `apps/web/src/components/ui/carousel.tsx`, `apps/web/src/components/ui/input-group.tsx`, `apps/web/src/components/ui/kbd.tsx` | `apps/web/src/lib/products/catalog.test.ts` (filters, their links, search), `apps/web/src/lib/app-store.test.ts` (reading Apple's lookup, its edge cache, and every failure, kept for 5 minutes), `apps/web/src/components/products/product-facts.test.tsx` (the facts row with and without the lookup), and `apps/web/src/components/products/product-videos.test.tsx` and `product-videos.interaction.test.tsx` (no video section while there are no videos; with a sample video, nothing from YouTube before the click and the privacy-enhanced player after); the browser tests in `apps/web/e2e/products.spec.ts` (search, every filter and its link, Back, ⌘K, the cards' links) and `apps/web/e2e/product-page.spec.ts` (the demo's arrows and dots, the screenshot carousel, the questions, the links, both pages' titles, descriptions, and canonical URLs, and the app page's old address, 404 with nothing linking to it), and `apps/web/e2e/claims.spec.ts` (no claim of no account, local-only storage, or open data on the app's page or in its description) | `Web` (`check` and `e2e`) | [Products pages](../apps/web/docs/product/products.md) | `verify-web`, at desktop, tablet, and phone widths |
| Homepage | B | 2026-10-08 | `apps/web/src/app/page.tsx`, `apps/web/src/components/home/`, `apps/web/src/components/area-showcase.tsx`, `apps/web/src/components/showcase-stage.tsx`, `apps/web/src/components/app-screenshot.tsx`, `apps/web/src/lib/home.ts`, `apps/web/src/lib/app-areas.ts`, `apps/web/src/lib/home-previews.ts`, `apps/web/src/lib/app-parts.ts`, `apps/web/src/lib/app-screenshots.ts`, `apps/web/public/screenshots/app-store/` | `apps/web/e2e/home.spec.ts` (the title, description, and canonical, the hero's buttons and fine print, the search box and example searches, the free tools' links, and the page-end card's heading, Get the app, collage, and height, and that the page has no Sources disclosure), `apps/web/e2e/showcase.spec.ts` (each tab's area, the tabs by keyboard, paging the Dictionary screens by arrows and dots with the next one peeking in, nothing moving on its own, no sideways scroll on any tab, the page below staying put across tabs, whole screens below 1024 pixels, the furigana highlight, and every area in the server HTML), `apps/web/e2e/claims.spec.ts` (no claim of no account, local-only storage, or open data on the page or in the description), `apps/web/e2e/placeholders.spec.ts` and `apps/web/e2e/layout.spec.ts` on `/`, `apps/web/e2e/phone-layout.spec.ts` on each area at 360 pixels (the dots' tap targets among them); `apps/web/src/components/home/home-areas.test.tsx` (the Player's video only with videos, nothing from YouTube before a click), `apps/web/src/components/area-showcase.interaction.test.tsx` (a playing video stops when another area is chosen), and `apps/web/src/lib/home-previews.test.ts` (食べる's previews against the dictionary fixtures); `smoke.sh` asks for `/` | `Web` (`check` and `e2e`) | [Homepage](../apps/web/docs/product/home.md), with each claim's source in the app's product docs | `verify-web`, at a desktop, a tablet, and a phone width |
| Other pages | C | 2026-10-09 | `apps/web/src/app/about/`, `apps/web/src/app/contact/`, `apps/web/src/app/legal/`, `apps/web/src/app/sources/`, `apps/web/src/app/support/`, `apps/web/src/lib/company.ts`, `apps/web/src/lib/pages.ts`, `apps/web/src/lib/sitemap.ts`, `apps/web/src/lib/sitemap-index.ts`, `apps/web/src/lib/pages-sitemap.ts`, `apps/web/src/lib/robots.ts`, `apps/web/src/components/origin-canonical.tsx`, `apps/web/src/app/robots.txt/`, `apps/web/src/app/sitemap-index.xml/`, `apps/web/src/app/sitemap-pages.xml/` | `apps/web/src/lib/pages.test.ts`, `apps/web/src/lib/sitemap.test.ts` (the root sitemap files, their rewrites, and the old paths' redirects), `apps/web/src/lib/robots.test.ts`, `apps/web/src/lib/site.test.ts`, and `apps/web/src/components/origin-canonical.test.tsx` (each environment's origin, and the slashless homepage); the browser tests `apps/web/e2e/sitemaps.spec.ts`, `apps/web/e2e/privacy.spec.ts` (each item a privacy policy must cover, and Tomodachi's section, its anchor, the support page's line and link to it, both pages' descriptions, and both pages at 320 and 390 pixels in light and dark), and `apps/web/e2e/claims.spec.ts` (no claim of no account, local-only storage, or open data on the About page); `smoke.sh` asks for `/support/` and `/legal/privacy/`, the `/privacy` redirect, each environment's search-engine rules, that `robots.txt`, the sitemaps, and the canonical tags name the environment's own host, and that the privacy policy has Tomodachi's section and the support page links it | `Web` (`check` and `e2e`) | [Privacy Policy](../apps/web/docs/product/privacy.md) for the privacy policy and the support page's Tomodachi line; none for the about, contact, other legal, and sources pages, or the rest of support. The URL rules are in [Dictionary](../apps/web/docs/product/dictionary.md#header-footer-and-site-wide), and the sitemap page in [Browse pages](../apps/web/docs/product/browse.md#site-wide) | `verify-web` |
| Phone layout | B | 2026-10-08 | `apps/web/e2e/page-types.ts`, `apps/web/e2e/phone-checks.ts`, `apps/web/e2e/phone-layout.spec.ts`, `apps/web/e2e/axe.ts`, `apps/web/e2e/gallery.spec.ts`, `apps/web/src/app/globals.css`, `apps/web/src/components/site-menu.tsx` | `apps/web/e2e/phone-layout.spec.ts`: every page type, the account pages among them, each homepage area, the phone menu and each of its groups, and a missing page at 360 pixels, for text under 12 pixels, elements past the screen's edge, cut-off text, grid cells under 44 pixels, and axe's `target-size`; the browser tests of what #682 fixed (the kana charts' rows, page links in one row, whole headwords and example words, the phone menu's width) | `Web` (`e2e`) | [Dictionary](../apps/web/docs/product/dictionary.md#header-footer-and-site-wide), Phone layout | The phone gallery, every page type and view at 390 pixels in light and dark ([`web.md`](agents/web.md#phone-layout)); `verify-web` at 360 and 390 pixels |

- **Dictionary pages, B.** What each page shows is held to the app's recorded suites before
  merge, every behavior names its check, and the browser tests drive the pages as a learner does.
  Main gap: 5 of the 78 behaviors have no automated check, 10 more have a part without one (mostly
  layout, sheets, and speech), the browser tests see only the fixtures' 12 words and the browse
  answers exported beside them, and some app behaviors aren't built yet (#511).
- **Account pages, B.** Every behavior names its check, the components run against a stand-in
  for the service, and a learner goes from registering to deleting against the real service before
  merge. Main gap: Sign in with Apple and Google run only against stand-ins before merge, since
  Apple takes no `localhost` return URL and Google's web client returns only to the deployed
  services, so a person checks them on staging and in production, where both are on.
- **Header and footer, A.** Every header menu and footer link is checked, as are the current
  section, opening and closing by click, keyboard, and Escape at both widths, the drawer's groups,
  the footer's one-column phone layout, the pinned header, the account menu signed out and signed
  in, the theme's default, choice, and keyboard use, every kind of page's contrast in both themes,
  and that each `#` link, in every menu, the account menu, and drawer group, is a placeholder
  listed in `apps/web/src/lib/site.ts`, which the check reports. Main gap: the mega menus' look and
  their opening on hover, the logo and the favicon and manifest are checked only by hand, and the
  placeholders wait on their pages (`/tools/`, the converters, the App Store listing, and the
  social accounts).
- **Homepage, B.** Every link and control on the page is driven in a browser at both widths, and
  the product doc names each section's check and the app doc behind each claim. Main gap: beyond
  the phone checks (Phone layout), the layout at each width, in light and dark, the drawings' look,
  and the page-end collage's look are checked only by hand, and only 食べる's previews are compared
  with the dictionary ([`tech-debt.md`](tech-debt.md), Website).
- **Products pages, B.** Every behavior in the product docs names its check, and the browser tests
  drive both pages at both widths. Main gap: the look of the cards, the demo, and the carousel is
  checked only by hand, nothing after a deploy checks that Apple's lookup still answers (its
  failure only logs `app_store_lookup_failed`), and Watch it work waits on videos, so the browser
  tests see only its empty state.
- **Phone layout, B.** Every page type, homepage area, and phone menu group is checked at a
  phone's width for small text, overflow, cut-off text, squeezed grids, and tap targets before
  merge, and the gallery shows each in light and dark for a person to review. Main gap: spacing,
  wrapping, and how a page looks are checked only by eye, in the gallery.
- **Other pages, C.** Tests check their paths, `robots.txt`, and the sitemaps on each
  environment's host, and that the privacy policy covers each item it must (who we are, what an
  account keeps and why, the processors, retention, the legal basis, the rights, children, and
  changes, and Tomodachi, with the support page's link to it), and that the About page makes no
  claim of no account, local-only storage, or open data, and the smoke test checks that two of the
  pages answer, and cover Tomodachi. Main gap: only the privacy policy, and the support page's Tomodachi line, have a
  product doc, so nothing else checks the other pages' content.

## Dictionary service and core

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dictionary service | A | 2026-10-09 | `apps/dictionary-api/src/` | The five app-recorded suites, replayed on the app's data in `apps/dictionary-api/src/conformance/`, beside `sentence-search.test.ts`, `full-text.test.ts`, `conjugation-examples.test.ts`, `browse.test.ts`, `browse-categories.test.ts`, `word-cards.test.ts`, and `app-routes.test.ts`; the routes in `apps/dictionary-api/src/app.test.ts`, the app routes' tokens, scopes, and limits in `src/app-routes.test.ts`; and their OpenAPI contract and API reference in `src/openapi.test.ts`, held to the core's types and to each error the routes answer, with every answer on the app's data checked against it | `Dictionary API`, where the suites fail rather than skip without the data, and the core's fixtures must match what the service exports from it; `Dictionary API deploy` builds the image and checks that it answers | [`dictionary-api.md`](agents/dictionary-api.md), the app routes' [API reference](api/dictionary-api.md), ADR 0009 | `pnpm dev` and its routes; `verify-web` on the whole dictionary |
| Shared dictionary core | A | 2026-10-09 | `packages/dictionary-core/src/` | Unit tests beside the code in `packages/dictionary-core/src/` (`search`, `results`, `detail`, `examples`, `browse`, `cards`, and `artifact`); the service's suites run through it | `Dictionary core` (Biome with its import rules, typecheck, and tests); `Repository`'s import check, which refuses any runtime the core reaches; `Search parity`; `Dictionary API`, which also checks the fixtures against the data | [`dictionary-core.md`](agents/dictionary-core.md), ADR 0008 | Through the service and the website |

- **Dictionary service, A.** Every recorded suite runs on the real data on each pull request that
  changes the service, the core, a suite, or the data, and the image is checked before it ships.
  Main gap: sentence search is held to the service's own cases, not to the app (#470).
- **Shared dictionary core, A.** Unit tests, the recorded suites, and import rules that keep it
  free of any runtime all run before merge. Main gap: the Swift it ports still exists, and nothing
  checks before merge that the Swift still agrees (#481).

## Account service

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Account service | A | 2026-10-09 | `apps/account-api/src/`, `apps/account-api/migrations/` | `apps/account-api/src/config.test.ts`; the routes in `apps/account-api/src/http/app.test.ts`; sign-in in `apps/account-api/src/auth/` (codes, providers, linking, tokens, the open routes, and the website's cookie session), the whole service on PGlite with stand-ins for Apple's and Google's keys; `/v1/me` and `/v1/sync` in `apps/account-api/src/http/` (access, apps and their scopes, profiles, known words and lists, watch history and its newest 50, bookmarked sentences and their cap, conflicts, the journal, cursors, retries, bounds, rate limits, and the logs), the OpenAPI contract and its API reference against the routes, each route's scope, every documented sync example, and every sign-in answer; the profile and cursor rules in `apps/account-api/src/domain/`; the mailer in `apps/account-api/src/email/`; and the migrations, the schema's rules, the journal's trigger, and the `pg` driver in `apps/account-api/src/db/`, on PGlite or, in CI, Postgres 18, where changes made at once to one account, and watches past its 50 videos, are raced | `Account API`, against Postgres 18; `Account API deploy` builds the image and checks that it migrates an empty database, answers, and publishes a signing key | [`account-api.md`](agents/account-api.md), the [API reference](api/account-api.md), the [client guide](agents/account-clients.md), ADR 0013 | `pnpm dev` with the dev mailbox, and its routes |
| What the Node services share | A | 2026-10-08 | `packages/node-service/src/` | `packages/node-service/src/log.test.ts`, `http.test.ts`: the request log, and a real server stopped with SIGTERM, and `api-reference.test.ts`: the API reference's routes, fields, answers, sync entities, and error index | `Account API`; `Dictionary API` runs the dictionary service's tests through it | [`dictionary-api.md`](agents/dictionary-api.md), Code layout | Through both services |

- **Account service, A.** Sign-in, its tokens and refusals, profiles and sync, the mailer, the
  routes and their contract, configuration, migrations, and database driver are tested on every
  pull request that changes them, with the driver and the races against a real Postgres, and the
  image is checked before it ships. Main gaps: Apple's and Google's real keys and useSend are
  first used on staging, the website's Apple deletion with them; it hasn't run on the server
  (#565's, #566's, and #567's server steps); and the iOS app syncs with it from Debug builds on
  staging, and from 2.0.0's TestFlight and App Store builds in production (#573, #616).
- **What the Node services share, A.** Small, and tested on its own and through both services.

## Language data

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Language-data pipeline | B | 2026-10-06 | `language-data/pipeline/` | `language-data/pipeline/tests/`: the packager, the publisher against a fake bucket, and the schemas | `Language data build`: the tests, then packaging and validating the release | [`language-data/README.md`](../language-data/README.md), ADR 0006 | `package.py build` and `validate` on a workstation |
| iOS data tools | B | 2026-10-06 | `apps/ios/Tools/` | `apps/ios/Tools/tests/`: contract tests for the frequency packs, the example word index, compound pitch, the ranked lists, and the JLPT kanji levels, and a provenance test that fails when a tool changes without the data it built | `iOS` runs the contract tests on pull requests that change `apps/ios`; Ruff lints the tools in `pnpm verify`. `Language data build` checks the pins between the files they write, when those files change | [`apps/ios/Tools/README.md`](../apps/ios/Tools/README.md), [`apps/ios/LanguageData/Sources/README.md`](../apps/ios/LanguageData/Sources/README.md), [`ios.md`](agents/ios.md), [`data-sources.md`](data-sources.md) | `rebuild_language_data.py` rebuilds everything on the pinned Python and runs the contract tests; then re-record the suites on a Mac |

- **Language-data pipeline, B.** Every pull request that changes the data or the pipeline
  rebuilds and validates the release. Main gap: publishing has run only against the fake bucket,
  since the `language-data-release` environment has no R2 token, and no client reads a release
  yet (#463, #473).
- **iOS data tools, B.** The `iOS` workflow runs the four contract tests before merge, and a
  rebuild is one command, on a pinned Python, from sources archived beside their records. But the
  importers, such as `apps/ios/Tools/import_jmdict.py`, have no tests of their own. Main gap: an
  importer change is checked only through the files it writes.

## Delivery

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Website and service deploys | C | 2026-10-09 | `.github/workflows/web-deploy.yml`, `.github/workflows/dictionary-api-deploy.yml`, `.github/workflows/account-api-deploy.yml`, `apps/web/scripts/`, `deploy/`, `apps/account-api/deploy/`, `apps/dictionary-api/Dockerfile`, `apps/account-api/Dockerfile` | `apps/web/scripts/smoke.sh` after each deploy, where staging's run gates production, though from CI it skips its dictionary checks; `apps/web/src/lib/dictionary-service-deploy.test.ts`, which runs `use-dictionary-service.sh` on a copy of `wrangler.jsonc`; the image checks in `Dictionary API deploy` and `Account API deploy`; `apps/web/scripts/wait-for-dictionary-service.sh`, which ships the service's image before the site | The image checks, ShellCheck on the deployer and the backups, and actionlint in `Repository`. The deploy workflows run after merge | [`web.md`](agents/web.md), Environments and deploys; [`api-servers.md`](agents/api-servers.md); [`dictionary-api.md`](agents/dictionary-api.md) and [`account-api.md`](agents/account-api.md), Ship it | `verify-web` on staging; the dictionary service's earlier deployer was checked by hand on staging |
| iOS releases | D | 2026-09-30 | None | None | None | None: no doc says how a build reaches TestFlight or the App Store | Outside the repository |

- **Website and service deploys, C.** The image is checked and signed before it's published, and
  the server runs only images main signed. But Bot Fight Mode challenges CI runners, so nothing in
  CI sees the server deploy, and the smoke test skips its dictionary checks there. Main gaps: no
  alert when a deploy fails on the server (#542); a change to the deploy path is first exercised
  on `main`; the server runs whichever `deploy/deployer.sh` someone last installed, which nothing
  compares with the repository's; and the deployer, now shared by both services, and the account
  backups have no tests and haven't run on the server yet.
- **iOS releases, D.** Nothing in the repository builds, checks, or documents a release. Main
  gap: #381.

## Repository

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Repository checks | A | 2026-10-06 | `tools/checks/src/`, `.claude/`, `knip.json`, `lefthook.yml`, `.github/workflows/repository.yml`, `.github/workflows/code-review.yml`, `.github/workflows/claude.yml`, `.github/workflows/maintenance.yml` | The checks' tests in `tools/checks/src/`: docs and the doc rules (`tools/checks/src/doc-rules/`), sizes, secrets, duplicates and their exceptions, imports (on scratch packages with a cycle, an unused module, and a test import), fix branches, the report, and the comment checks' in `tools/checks/src/comments/`; the agent tooling's in `tools/checks/src/agents/`: the permission rules, `.mcp.json`, and the inline scripts of the review, `@claude`, and both gardening jobs | `Repository`, on every pull request: the checks' own tests, then `pnpm verify` (no comments, docs, sizes, secrets, duplicate code, dead code, imports, and the linters), and on a `fix/` branch, a changed test | [`code.md`](agents/code.md) | `pnpm verify`; the git hooks; Claude Code's edit hook |

- **Repository checks, A.** They run on every pull request and in the git hooks, and each failure
  says how to fix it. Main gap: Swift has no linter (#516), and nothing refuses a cast of parsed
  JSON ([`tech-debt.md`](tech-debt.md), Checks). The docs' links, anchors, paths, and scripts are
  checked on every pull request, but whether their prose still matches the code is checked only
  weekly, by doc gardening in `Weekly maintenance`.

Re-grade an area, and set its Graded date to that day, in the same pull request that changes its
tests, CI, or docs, even when its grade stays the same.
