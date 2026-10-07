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
| Search | C | 2026-10-06 | `apps/ios/Modules/Sources/SearchExperience/SearchView.swift`, `apps/ios/Modules/Sources/SearchExperience/SearchResultsView.swift`, `apps/ios/Modules/Sources/SearchExperience/LookupClient.swift`, `apps/ios/Modules/Sources/SearchExperience/LookupDatabase.swift`, `apps/ios/Modules/Sources/SearchExperience/JapaneseDeinflection.swift` | `SearchResultOrderingTests`, `JapaneseDeinflectionTests`, `SearchFrequencyChipTests`, `SearchFrequencyOrchestrationTests`, `FrequencyPackLifecycleTests`, `PartOfSpeechFormatterTests`, `PitchAccentTests`, and the app-recorded suites `SearchConformanceTests`, `SearchResultsConformanceTests`, and `ExampleSearchConformanceTests` | None. `Search parity` checks only that a ported Swift file and its TypeScript port change together | [Search](../apps/ios/docs/product/dictionary.md#search) | Search manual checks, in the Simulator |
| Word and kanji detail | C | 2026-10-06 | `apps/ios/Modules/Sources/SearchExperience/WordDetailView.swift`, `apps/ios/Modules/Sources/SearchExperience/WordDetailSections.swift`, `apps/ios/Modules/Sources/SearchExperience/KanjiDetailView.swift`, `apps/ios/Modules/Sources/SearchExperience/KanjiDetailSections.swift` | The app-recorded suites `WordDetailConformanceTests` and `KanjiDetailConformanceTests`, and `KanjiReadingSplitterTests`, `LinkedWordResolutionTests`, `KanaHeadwordExampleTests`, `CompoundPitchTests`, `JapaneseInflectionGroupingTests`, `WordSheetPresentationTests` | None | [Dictionary and kanji details](../apps/ios/docs/product/dictionary.md#dictionary-and-kanji-details) | The parsing comparison harness; no checklist for the screens themselves |
| Player | C | 2026-10-06 | `apps/ios/Modules/Sources/SearchExperience/WatchAndListenView.swift`, `apps/ios/Modules/Sources/SearchExperience/WatchSessionView.swift`, `apps/ios/Modules/Sources/SearchExperience/WatchHistory.swift`, `apps/ios/Modules/Sources/SearchExperience/PlaybackScrubber.swift`, `apps/ios/Modules/Sources/SearchExperience/YouTubePlayer.swift`, `apps/ios/Modules/Sources/SearchExperience/YouTubeCaptions.swift`, `apps/ios/Modules/Sources/SearchExperience/CaptionCard.swift` | `YouTubeCaptionsTests`: links, caption-track choice, timed text, translation pairing, card size, word meanings, and comprehension | None | [Player](../apps/ios/docs/product/player.md) | Player manual checks, with four videos |
| Lists and Known Words | C | 2026-10-06 | `apps/ios/Modules/Sources/SearchExperience/WordLists.swift`, `apps/ios/Modules/Sources/SearchExperience/WordListsView.swift`, `apps/ios/Modules/Sources/SearchExperience/WordKnowledge.swift`, `apps/ios/Modules/Sources/SearchExperience/KnownWordsView.swift`, `apps/ios/Modules/Sources/SearchExperience/SavedItem.swift` | `WordListsTests`, `WordKnowledgeTests`, `SavedKanjiTests`: storage, reloads, unreadable and newer-version files, and failed writes | None | [Known Words and Lists](../apps/ios/docs/product/index.md#known-words) | Word lists and Known words manual checks |
| Image Search | C | 2026-10-06 | `apps/ios/Modules/Sources/SearchExperience/ImageTextFlowModel.swift`, `apps/ios/Modules/Sources/SearchExperience/ImageTextFlowView.swift`, `apps/ios/Modules/Sources/SearchExperience/ImageTextRecognitionClient.swift`, `apps/ios/Modules/Sources/SearchExperience/ImageTextExplanationClient.swift` | `ImageTextRecognitionTests` (Vision on the images in `apps/ios/Modules/Tests/SearchExperienceTests/Fixtures/ImageText`), `ImageTextTranslationTests`, `ImageTextExplanationTests`, `ImageTextContextNotesTests` | None | [Image Search](../apps/ios/docs/product/dictionary.md#image-search) | Image Search manual checks; Apple Translation only on a device |
| Translate | C | 2026-10-07 | `apps/ios/Modules/Sources/TranslatorCore/LiveConversation.swift`, `apps/ios/Modules/Sources/TranslatorCore/LiveConversationSpeech.swift`, `apps/ios/Modules/Sources/TranslatorCore/BilingualTranscriptMerger.swift`, `apps/ios/Modules/Sources/TranslatorCore/ConversationHistory.swift`, `apps/ios/Modules/Sources/SearchExperience/Translate/OnDeviceSpeechRecognition.swift`, `apps/ios/Modules/Sources/SearchExperience/Translate/LiveConversationView.swift` | `TranslatorCoreTests`: the conversation engine (turns, held audio, the 30-second cutoff, silence, pause, background, leaving, modes), bilingual transcript merging, typed-language detection, and History storage | None | [Translate](../apps/ios/docs/product/translate.md) | Translate manual checks: the scripted Simulator harness for every screen; the microphone, speech recognition, and Apple Translation only on a device |

- **Search, C.** Thorough tests, three suites the website is held to, and a checklist, but no CI.
  Main gap: nothing runs the Swift against its own recorded suites before merge, and no suite
  records sentence search (#470).
- **Word and kanji detail, C.** The recorded suites cover what both screens draw, but only on a
  Mac. Main gap: no CI.
- **Player, C.** The caption model is tested; the player isn't. Main gap: playback, the
  highlighted card, the controls, and the live caption fetch are checked only by hand.
- **Lists and Known Words, C.** Storage is well tested. Main gap: the screens (swipes, Edit,
  menus, and the list picker) are checked only by hand.
- **Translate, C.** The engine and History are tested with fakes, and every screen runs in the
  Simulator on a scripted conversation. The on-device recognizers were checked on an iPhone with
  a scripted conversation (#627). Main gap: no automated check runs them on recorded audio
  (#640).
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
| Dictionary pages | B | 2026-10-07 | `apps/web/src/app/dictionary/`, `apps/web/src/components/dictionary/`, `apps/web/src/lib/dictionary/`, `apps/web/src/test/`, `apps/web/e2e/` | The rendered-page gate in `apps/web/src/components/dictionary/` (`search-results.test.tsx`, `search-examples.test.tsx`, `word-page.test.tsx`, `conjugations.test.tsx`) and its interaction tests, unit tests in `apps/web/src/lib/dictionary/`, route tests under `apps/web/src/app/dictionary/`, the browser tests in `apps/web/e2e/` (search, word, and browse pages, their conjugations and kanji details, URLs, and layout, failing on any console error), and `apps/web/scripts/smoke.sh` after each deploy | `Web` (`check` and `e2e`); `Dictionary API` runs the gate against the service it builds | [Dictionary](../apps/web/docs/product/dictionary.md) and [Browse pages](../apps/web/docs/product/browse.md), which name the check for each behavior | `verify-web`, on the fixtures or the whole dictionary |
| Other pages | C | 2026-10-07 | `apps/web/src/app/page.tsx`, `apps/web/src/app/about/`, `apps/web/src/app/contact/`, `apps/web/src/app/legal/`, `apps/web/src/app/sources/`, `apps/web/src/app/support/`, `apps/web/src/components/site-header.tsx`, `apps/web/src/components/site-nav.tsx`, `apps/web/src/components/site-menu.tsx`, `apps/web/src/components/site-brand.tsx`, `apps/web/src/components/site-footer.tsx`, `apps/web/src/lib/pages.ts`, `apps/web/src/lib/sitemap.ts` | `apps/web/src/lib/pages.test.ts`, `apps/web/src/lib/sitemap.test.ts`, `apps/web/src/components/site-footer.test.tsx`, `apps/web/src/components/site-header.test.tsx`, and the browser tests in `apps/web/e2e/site.spec.ts` (the header's nav and phone menu, and the footer's groups); `smoke.sh` asks for `/`, `/support/`, and `/legal/privacy/`, the `/privacy` redirect, and each environment's search-engine rules | `Web` (`check` and `e2e`) | None for the home, about, support, contact, legal, and sources pages. The header, footer, and URL rules are in [Dictionary](../apps/web/docs/product/dictionary.md#header-footer-and-site-wide), and the footer's browse links and the sitemap page in [Browse pages](../apps/web/docs/product/browse.md#site-wide) | `verify-web` |

- **Dictionary pages, B.** What each page shows is held to the app's recorded suites before
  merge, every behavior names its check, and the browser tests drive the pages as a learner does.
  Main gap: 10 of the 70 behaviors have no automated check, 11 more have a part without one (mostly
  layout, sheets, and speech), the browser tests see only the fixtures' 12 words and the browse
  answers exported beside them, and some app behaviors aren't built yet (#511).
- **Other pages, C.** Tests check their paths, the sitemaps, the footer's groups and links, and the
  header's current section, phone menu, and Get the app icon, and the smoke test checks that three of them
  answer. Main gap: no product doc says what these pages
  show, so nothing checks their content.

## Dictionary service and core

| Area | Grade | Graded | Code | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dictionary service | A | 2026-10-07 | `apps/dictionary-api/src/` | The five app-recorded suites, replayed on the app's data in `apps/dictionary-api/src/conformance/`, beside `sentence-search.test.ts`, `full-text.test.ts`, `conjugation-examples.test.ts`, `browse.test.ts`, and `browse-categories.test.ts`; the routes in `apps/dictionary-api/src/app.test.ts` | `Dictionary API`, where the suites fail rather than skip without the data, and the core's fixtures must match what the service exports from it; `Dictionary API deploy` builds the image and checks that it answers | [`dictionary-api.md`](agents/dictionary-api.md), ADR 0009 | `pnpm dev` and its routes; `verify-web` on the whole dictionary |
| Shared dictionary core | A | 2026-10-07 | `packages/dictionary-core/src/` | Unit tests beside the code in `packages/dictionary-core/src/` (`search`, `results`, `detail`, `examples`, `browse`, and `artifact`); the service's suites run through it | `Dictionary core` (Biome with its import rules, typecheck, and tests); `Repository`'s import check, which refuses any runtime the core reaches; `Search parity`; `Dictionary API`, which also checks the fixtures against the data | [`dictionary-core.md`](agents/dictionary-core.md), ADR 0008 | Through the service and the website |

- **Dictionary service, A.** Every recorded suite runs on the real data on each pull request that
  changes the service, the core, a suite, or the data, and the image is checked before it ships.
  Main gap: sentence search is held to the service's own cases, not to the app (#470).
- **Shared dictionary core, A.** Unit tests, the recorded suites, and import rules that keep it
  free of any runtime all run before merge. Main gap: the Swift it ports still exists, and nothing
  checks before merge that the Swift still agrees (#481).

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
| Website and service deploys | C | 2026-10-06 | `.github/workflows/web-deploy.yml`, `.github/workflows/dictionary-api-deploy.yml`, `apps/web/scripts/`, `apps/dictionary-api/deploy/`, `apps/dictionary-api/Dockerfile` | `apps/web/scripts/smoke.sh` after each deploy, where staging's run gates production, though from CI it skips its dictionary checks; the image check in `Dictionary API deploy`; `apps/web/scripts/wait-for-dictionary-service.sh`, which ships the service's image before the site | The image check, and ShellCheck and actionlint in `Repository`. `Web deploy` and `Dictionary API deploy` run after merge | [`web.md`](agents/web.md), Environments and deploys; [`dictionary-api.md`](agents/dictionary-api.md), Ship it | `verify-web` on staging; the server's deployer was checked by hand on staging |
| iOS releases | D | 2026-09-30 | None | None | None | None: no doc says how a build reaches TestFlight or the App Store | Outside the repository |

- **Website and service deploys, C.** The image is checked and signed before it's published, and
  the server runs only images main signed. But Bot Fight Mode challenges CI runners, so nothing in
  CI sees the server deploy, and the smoke test skips its dictionary checks there. Main gaps: no
  alert when a deploy fails on the server (#542); a change to the deploy path is first exercised
  on `main`; and the server runs whichever `apps/dictionary-api/deploy/deployer.sh` someone last
  installed, which nothing compares with the repository's.
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
