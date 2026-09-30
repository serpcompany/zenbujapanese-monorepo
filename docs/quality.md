# Quality

A grade for each product area and layer, from what the repository holds: its automated tests,
whether CI runs them before a pull request merges, whether docs describe its behavior, and how a
change is checked by hand. The line under each table gives the evidence for each grade and the
main gap, which is what would raise it. Known debt, each item with its issue, is in
[`tech-debt.md`](tech-debt.md).

| Grade | Means |
| --- | --- |
| A | Tests cover the behavior, CI runs them on every pull request that changes it, and docs describe it. What's left is small and tracked. |
| B | Tests, CI, and docs cover the main behavior, but a notable part is checked only by hand, or not at all. |
| C | Tests and docs exist, but one leg is missing: no CI runs the tests before merge, or no doc describes the behavior. |
| D | Almost nothing is tested, run before merge, or written down. |

"By hand" means a person or an agent checking the running app or site.

## iOS app

The app's tests are the `SearchExperienceTests` target, in
`apps/ios/Modules/Tests/SearchExperienceTests/`, run with `xcodebuild` on a Mac
([`ios.md`](agents/ios.md), Current verification boundary). The `iOS` workflow runs them on a
macOS runner only once the owners turn it on (`IOS_SWIFT_TESTS`), so until then they run only by
hand. The product docs are in
[`apps/ios/docs/product/`](../apps/ios/docs/product/index.md), and the manual checks named below
are sections of `ios.md`.

| Area | Grade | Tests | CI before merge | Product docs | By hand |
| --- | --- | --- | --- | --- | --- |
| Search | C | `SearchResultOrderingTests`, `JapaneseDeinflectionTests`, `SearchFrequencyChipTests`, `SearchFrequencyOrchestrationTests`, `FrequencyPackLifecycleTests`, `PartOfSpeechFormatterTests`, `PitchAccentTests`, and the app-recorded suites `SearchConformanceTests`, `SearchResultsConformanceTests`, and `ExampleSearchConformanceTests` | None. `Search parity` checks only that a ported Swift file and its TypeScript port change together | [Search](../apps/ios/docs/product/dictionary.md#search) | Search manual checks, in the Simulator |
| Word and kanji detail | C | The app-recorded suites `WordDetailConformanceTests` and `KanjiDetailConformanceTests`, and `KanjiReadingSplitterTests`, `LinkedWordResolutionTests`, `KanaHeadwordExampleTests`, `CompoundPitchTests`, `JapaneseInflectionGroupingTests`, `WordSheetPresentationTests` | None | [Dictionary and kanji details](../apps/ios/docs/product/dictionary.md#dictionary-and-kanji-details) | The parsing comparison harness; no checklist for the screens themselves |
| Player | C | `YouTubeCaptionsTests`: links, caption-track choice, timed text, translation pairing, card size, word meanings, and comprehension | None | [Player](../apps/ios/docs/product/player.md) | Player manual checks, with four videos |
| Lists and Known Words | C | `WordListsTests`, `WordKnowledgeTests`, `SavedKanjiTests`: storage, reloads, unreadable and newer-version files, and failed writes | None | [Known Words and Lists](../apps/ios/docs/product/index.md#known-words) | Word lists and Known words manual checks |
| Image Search | C | `ImageTextRecognitionTests` (Vision on the images in `apps/ios/Modules/Tests/SearchExperienceTests/Fixtures/ImageText`), `ImageTextTranslationTests`, `ImageTextExplanationTests`, `ImageTextContextNotesTests` | None | [Image Search](../apps/ios/docs/product/dictionary.md#image-search) | Image Search manual checks; Apple Translation only on a device |

- **Search, C.** Thorough tests, three suites the website is held to, and a checklist, but no CI.
  Main gap: nothing runs the Swift against its own recorded suites before merge, and no suite
  records sentence search (#470).
- **Word and kanji detail, C.** The recorded suites cover what both screens draw, but only on a
  Mac. Main gap: no CI, and the kanji suite leaves out the JLPT metric (#485).
- **Player, C.** The caption model is tested; the player isn't. Main gap: playback, the
  highlighted card, the controls, and the live caption fetch are checked only by hand.
- **Lists and Known Words, C.** Storage is well tested. Main gap: the screens (swipes, Edit,
  menus, and the list picker) are checked only by hand.
- **Image Search, C.** Recognition runs on real images. Main gap: Apple Translation doesn't run
  in the Simulator, and the on-device model runs only where the Simulator's runtime matches the
  Mac, so translation and Context are checked by hand, on a device.

## Website

The website's tests are Vitest files beside its code in `apps/web/src/`. The `Web` workflow runs
`pnpm check` (Biome, typecheck, tests, and the build) on pull requests that change `apps/web/**`
or the core. The product docs are in [`apps/web/docs/product/`](../apps/web/docs/product/index.md).
A change is checked by hand in a browser with the `verify-web` skill
([`SKILL.md`](../.claude/skills/verify-web/SKILL.md)).

| Area | Grade | Tests | CI before merge | Product docs | By hand |
| --- | --- | --- | --- | --- | --- |
| Dictionary pages | B | The rendered-page gate in `apps/web/src/components/dictionary/` (`search-results.test.tsx`, `search-examples.test.tsx`, `word-page.test.tsx`, `conjugations.test.tsx`) and its interaction tests, unit tests in `apps/web/src/lib/dictionary/`, route tests under `apps/web/src/app/dictionary/`, and `apps/web/scripts/smoke.sh` after each deploy | `Web`; `Dictionary API` runs the gate against the service it builds | [Dictionary](../apps/web/docs/product/dictionary.md), which names the check for each behavior | `verify-web`, on the fixtures or the whole dictionary |
| Other pages | C | `apps/web/src/lib/pages.test.ts`, `apps/web/src/lib/sitemap.test.ts`, `apps/web/src/components/site-footer.test.tsx`; `smoke.sh` asks for `/`, `/support/`, and `/legal/privacy/`, the `/privacy` redirect, and each environment's search-engine rules | `Web` | None for the home, about, support, contact, legal, sources, and sitemap pages. The header, footer, and URL rules are in [Dictionary](../apps/web/docs/product/dictionary.md#header-footer-and-site-wide) | `verify-web` |

- **Dictionary pages, B.** What each page shows is held to the app's recorded suites before
  merge, and every behavior names its check. Main gap: 11 of the 70 behaviors have no automated
  check, 13 more have a part without one (mostly layout, menus, and redirects), and some app
  behaviors aren't built yet (#511).
- **Other pages, C.** Tests check their paths, the sitemaps, and the footer's Legal link, and the
  smoke test checks that three of them answer. Main gap: no product doc says what these pages
  show, so nothing checks their content.

## Dictionary service and core

| Area | Grade | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- |
| Dictionary service, `apps/dictionary-api` | A | The five app-recorded suites, replayed on the app's data in `apps/dictionary-api/src/conformance/`, beside `sentence-search.test.ts`, `full-text.test.ts`, `conjugation-examples.test.ts`, and `conjugation-sitemap.test.ts`; the routes in `apps/dictionary-api/src/app.test.ts` | `Dictionary API`, where the suites fail rather than skip without the data; `Dictionary API deploy` builds the image and checks that it answers | [`dictionary-api.md`](agents/dictionary-api.md), ADR 0009 | `pnpm dev` and its routes; `verify-web` on the whole dictionary |
| Shared dictionary core, `packages/dictionary-core` | A | Unit tests beside the code in `packages/dictionary-core/src/` (`search`, `results`, `detail`, `examples`, and `artifact`); the service's suites run through it | `Dictionary core` (Biome with its import rules, typecheck, and tests); `Search parity`; `Dictionary API` | [`dictionary-core.md`](agents/dictionary-core.md), ADR 0008 | Through the service and the website |

- **Dictionary service, A.** Every recorded suite runs on the real data on each pull request that
  changes the service, the core, a suite, or the data, and the image is checked before it ships.
  Main gap: sentence search is held to the service's own cases, not to the app (#470).
- **Shared dictionary core, A.** Unit tests, the recorded suites, and import rules that keep it
  free of any runtime all run before merge. Main gap: the Swift it ports still exists, and nothing
  checks before merge that the Swift still agrees (#481).

## Language data

| Area | Grade | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- |
| Language-data pipeline, `language-data/pipeline` | B | `language-data/pipeline/tests/`: the packager, the publisher against a fake bucket, and the schemas | `Language data build`: the tests, then packaging and validating the release | [`language-data/README.md`](../language-data/README.md), ADR 0006 | `package.py build` and `validate` on a workstation |
| iOS data tools, `apps/ios/Tools` | B | `apps/ios/Tools/tests/`: contract tests for the frequency packs, the example word index, and compound pitch | `iOS` runs the contract tests on pull requests that change `apps/ios`; Ruff lints the tools in `pnpm verify`. `Language data build` checks the pins between the files they write, when those files change | [`apps/ios/Tools/README.md`](../apps/ios/Tools/README.md), [`ios.md`](agents/ios.md), [`data-sources.md`](data-sources.md) | Rebuild on a workstation, then run the contract tests |

- **Language-data pipeline, B.** Every pull request that changes the data or the pipeline
  rebuilds and validates the release. Main gap: publishing has run only against the fake bucket,
  since the `language-data-release` environment has no R2 token, and no client reads a release
  yet (#463, #473).
- **iOS data tools, B.** The `iOS` workflow runs the three contract tests before merge, but the
  importers, such as `apps/ios/Tools/import_jmdict.py`, have no tests of their own. Main gap: an
  importer change is checked only through the files it writes.

## Delivery

| Area | Grade | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- |
| Website and service deploys | B | `apps/web/scripts/smoke.sh` after each deploy, where staging's run gates production; the image check in `Dictionary API deploy`; `apps/web/scripts/wait-for-dictionary-service.sh` and `apps/dictionary-api/deploy/await-build.sh`, which deploy the service before the site | The image check, and ShellCheck and actionlint in `Repository`. `Web deploy` and `Dictionary API deploy` run after merge | [`web.md`](agents/web.md), Environments and deploys; [`dictionary-api.md`](agents/dictionary-api.md), Ship it | `verify-web` on staging; the server's deployer was checked by hand on staging |
| iOS releases | D | None | None | None: no doc says how a build reaches TestFlight or the App Store | Outside the repository |

- **Website and service deploys, B.** Staging's smoke test gates production, and the image is
  checked before it's published. Main gap: a change to the deploy path is first exercised on
  `main` (`Web deploy` failed on both of its runs there after #532 merged), and the server runs
  whichever `apps/dictionary-api/deploy/deployer.sh` someone last installed, which nothing
  compares with the repository's.
- **iOS releases, D.** Nothing in the repository builds, checks, or documents a release. Main
  gap: #381.

## Repository

| Area | Grade | Tests | CI before merge | Docs | By hand |
| --- | --- | --- | --- | --- | --- |
| Repository checks, `tools/checks` | A | `tools/checks/src/docs.test.ts`, `tools/checks/src/sizes.test.ts`, and the comment checks' tests in `tools/checks/src/comments/` | `Repository`, on every pull request: the checks' own tests, then `pnpm verify` | [`code.md`](agents/code.md) | `pnpm verify`; Claude Code's edit hook |

- **Repository checks, A.** They run on every pull request, and each failure says how to fix it.
  Main gap: Swift has no linter, and no scheduled run compares the docs' prose with the code
  (#516).

Last graded 2026-09-30. An area's grade is updated in the same pull request that changes its
tests, CI, or docs.
