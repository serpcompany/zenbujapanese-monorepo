# Tech debt

Known debt: shortcuts, duplicated code, and gaps in checks that the repository lives with for now,
each with the issue that tracks it. Bugs and features stay in issues
([`issue-tracker.md`](agents/issue-tracker.md)), and how well each area is tested and documented is
in [`quality.md`](quality.md).

Add a row, with its Size, in the pull request that knowingly leaves debt, and remove it in the one
that pays it off. A row without an issue says "No issue yet"; open one before starting the work.

Size is `small` (an hour or two, with no migration, deploy, or decision), `medium` (one focused
pull request), or `large` (a plan of its own, or several pull requests). An item that needs a
person's decision is never `small`. The weekly maintenance report counts the rows by Size and
names the first small one from the top of this file, which the weekly code gardener takes unless
it must pass it over ([`ci.md`](agents/ci.md), Weekly maintenance).

## Code

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| Search, example, and word and kanji detail logic exist twice: the app's Swift, and its port in `packages/dictionary-core`. | Every change is made in both. `Search parity` checks that both sides of a pair change, not that they agree, and nothing tests the Swift before merge. | #481 | large |
| `RankedLists.sqlite3` has no index by Language Reference ID, so each word-cards request, and each export, reads all of its ~730,000 ranks once to find its words' ranks in the seven lists (`listRanks` in `packages/dictionary-core/src/artifact/word-cards.ts`). | A word-cards request holds a worker thread for about 0.1 seconds, plus each card's word read, which the per-account limit bounds. An index in `build_ranked_lists.py` makes it a lookup, at the cost of a rebuilt language-data release. | #571 | small |
| The iOS app is one target, `SearchExperience` (`apps/ios/Modules/Sources/SearchExperience/`), holding Search, Translate's screens, Player, Account, Lists, and Profile. Only Translate's engine has its own target, `TranslatorCore` (ADR 0011). | Nothing keeps one feature from reaching into another's code. Splitting the rest by feature needs a decision, and an ADR if so. | #516 | large |
| Translate's on-device engine is tuned on three recordings of synthesized voices from one iPhone. The recorded-audio check (`translate-replay`) runs only by hand, because CI has no speech models; no real conversation has been recorded yet; and a short noise can still become a phantom 「うん」. | A real conversation can still lose words or gain a phantom sentence, and a recognizer change regresses unnoticed unless someone runs the check. | #640 | medium |
| Translate repeats helpers the app already has: History's file writes, and the synced bookmarks' file, repeat `LocalJSONFile`'s write queue, JSON settings, and unreadable-file handling, `SpokenLanguage.detect` is a third set of Japanese-script rules beside `SearchQuery.isJapanese` and `containsJapaneseText`, and `SystemSpeechPlayer` is a second `AVSpeechSynthesizer` adapter beside `SpeechSynthesisClient`. `TranslatorCore` can't import `SearchExperience`, so sharing them needs a lower target. | The copies drift: their script ranges and Japanese speech rates already differ, and a History write that fails is logged and lost, where the other stores retry. | No issue yet | medium |
| Word notes and encounter media are keyed by `WordNoteID`, a hash of a word's meanings (ADR 0006). PR #480 re-keys them. | A JMdict edit to a word's meanings detaches its notes and media, and sync (#374) needs Language Reference IDs. | #474 | medium |

## Checks

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| No check is required to merge: `main`'s ruleset requires a pull request, resolved review threads, and the merge queue, but no status checks. No workflow runs on `merge_group`, and seven run only when their paths change. | A red `Repository`, `Web`, or `Dictionary API` check doesn't stop a merge, and the merge queue lands changes without running anything; the git hooks can be skipped. Making the checks requirable means running each workflow on `merge_group` and on every pull request, passing quickly when nothing relevant changed; then the owners require them in the ruleset. | No issue yet | medium |
| `SearchExperienceTests` runs only when someone runs it on a Mac: the `iOS` workflow's macOS job waits for the owners to set `IOS_SWIFT_TESTS` to `on` ([`ci.md`](agents/ci.md), iOS). | The Swift can drift from the recorded suites the website is held to, and a change that breaks the app's build can merge. | #381, #516 | medium |
| The iOS manual checks in `docs/agents/ios.md` are checklists a person walks through in the Simulator. | An agent can't check a change to Player, Lists, Known Words, or Image Search on screen, or keep evidence of what it saw. | #516 | large |
| No app-recorded suite covers sentence search (Discovered Words). The service checks its own cases in `apps/dictionary-api/src/conformance/sentence-search.test.ts`. | The website's sentence search isn't held to what the app shows. Recording it needs the Japanese Text Analysis pack in the test host. | #470 | medium |
| The iOS data tools' importers have no tests; only the contract tests on what they write run before merge (`apps/ios/Tools/tests/`, in the `iOS` workflow). | An importer change is checked only through a rebuild of what it writes. | No issue yet | medium |
| Swift has no linter. `pnpm verify` runs ShellCheck, actionlint, and Ruff. | Swift mistakes that a linter would catch are left to review. | #516 | medium |
| The website casts the dictionary service's JSON to its types without checking its shape (`apps/web/src/lib/dictionary/api.ts`), and nothing refuses a cast of parsed JSON (`JSON.parse`, `response.json()`). The site compares only the contract number. | A service answering another shape under the same contract number renders wrong pages instead of failing where the data enters. Needs a decision on how to validate without a schema library in the core. | No issue yet | medium |
| Apple's accessibility audit found 144 Dynamic Type, 14 hit-region, and 4 clipped-text problems in the app. | Large text and small targets fail on Search, its results, Word Detail, Kanji Detail, and Examples. | #380 | large |

## Website

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| 4 of the 75 behaviors in `apps/web/docs/product/dictionary.md` have no automated check, and 14 more have a part without one, mostly layout and speech. Phone layout's tap targets (WCAG 2.2, 2.5.8) wait on #679's axe setup, to run axe's `target-size` rule in `apps/web/e2e/phone-layout.spec.ts`. | A change that breaks them passes CI. | #511 | medium |
| The website lacks app behaviors that the product docs require, under Required, not built yet: Reading Aids, handwriting and radical input (#526), kanji element detail, and more. | The website is meant to show what the app shows; each difference without a decision on file is a bug. | #511 | large |
| The website's Sign in with Apple and Google run only against stand-ins before merge: Apple takes no `localhost` return URL, and Google's web client returns only to the deployed account services. Staging offers both. Deleting an Apple account from the website, where the service takes the popup's code with its return URL, is first exercised on staging. | A mistake in Apple's popup, its return URL, or Google's redirect shows up only on staging. A browser test on staging would sign in with a test Apple ID and Google account. | No issue yet | medium |
| The header, footer, homepage, and the product page's Get the app link 20 placeholders to `#` in production and 19 on staging (`linkTargets` in `apps/web/src/lib/site.ts`): pages not built yet (the tools index and its three converters, the browser extension, reference guides, courses, and the videos index, which shows only once there are videos), Log in where the account pages are closed, the App Store, and ten social accounts. Log in opens `/login/` on staging, whose account pages are open, and stays `#` in production until production's account pages open. The owner chose to show them before their pages exist (#650). | A learner who follows one stays on the page. `apps/web/e2e/placeholders.spec.ts` lists them on every run, and fails on a `#` link that isn't in the list. | #579 (tools); Log in: done on staging (#468), and in production once its account service runs (#565's, #566's, and #567's server steps) and its account pages open ([`web.md`](agents/web.md), Account pages); No issue yet for the App Store and social accounts | medium |
| The stock shadcn carousel (`apps/web/src/components/ui/carousel.tsx`) disables its arrows at either end, as on the product page's screenshot row and the homepage's area showcase. | A keyboard user who presses Next to the end loses focus to the page. `aria-disabled` instead of `disabled` would keep it. | No issue yet | small |
| The homepage's area showcase (`apps/web/src/components/showcase-stage.tsx`) and the product page's feature demo (`apps/web/src/components/products/feature-demo.tsx`) each draw their own carousel dots and read Embla's state with their own hook. | A change to how the dots look or behave has to be made twice. The product page can take the showcase instead of its demo, which removes the second copy. | No issue yet | small |
| The products appear in two lists: the catalog's (`apps/web/src/lib/products/catalog.ts`) and the header's Products menu and footer (`apps/web/src/lib/site-menus.ts`, `apps/web/src/lib/site-footer.ts`), each with its own titles and lines. The menu links the planned products to `#`, where the catalog shows them as Coming soon. | A product added, renamed, or shipped in one list can be missed in the other. | No issue yet | small |
| No videos yet: the iPhone app's page leaves out Watch it work and Watch demo until `appVideos` in `apps/web/src/lib/videos.ts` lists some. Add each video's YouTube ID, title, and a thumbnail hosted on the site there. | The page has no video of the app, which the #648 design gives a section. The videos have to be made and published first. | #425 | medium |
| The homepage's previews (`apps/web/src/lib/home-previews.ts`) copy their words, readings, meanings, frequency chips, and Tatoeba sentences from the app's data and App Store screenshots as of 2026-10-08, and the screenshots in `apps/web/public/screenshots/app-store/` are copies of the App Store set. Only 食べる is checked, against the dictionary fixtures (`apps/web/src/lib/home-previews.test.ts`); the fixtures hold none of the other words, and nothing compares the screenshots with the App Store set. The App Store set predates the Translate tab, so its tab bars show three tabs where the app has four. | A dictionary or App Store update can leave the homepage showing an old meaning, rank, or screen; new App Store screenshots should replace these. Checking the rest needs them in the fixtures, or a check against the dictionary service. | No issue yet | medium |
| A missing page shows Next.js's default 404: its message sits in the middle of a block the height of the screen, about 370 pixels down on a phone, with no way on but the header (#682's audit). | A learner who follows a dead link sees a mostly blank screen. A not-found page in the site's style, with links to the dictionary and the homepage, is a small page of its own. | No issue yet | small |
| Search result pages are in no sitemap. #463 dropped its precomputed search-sitemap query set after ADR 0009, and the route audit decides which search pages stay indexable at all. | Search engines find search pages only through links. | #544 | medium |

## Language data

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| No language-data release is published. The `language-data-release` environment has no R2 token, so every `Language data release` run on `main` stops before uploading. The bucket has no public domain, and releases record no core hash (`core_sha256` is `null`). | ADR 0006's shared, versioned release doesn't exist yet for any client. | #463 | medium |
| `KanjiReferenceData.json` still holds KANJIDIC2's pre-2010 `jlpt` for each kanji, which nothing reads now that kanji details show Waller's level (#485, #614). | A client could show the old level again by mistake. Dropping the field changes the release's `zenbu.kanji-reference.v1` format, so it waits for a v2. | No issue yet | small |
| The dictionary records no retired entries: `retired()` in `packages/dictionary-core/src/artifact/dictionary.ts` returns none. | A word that a new JMdict drops answers 404, rather than ADR 0007's 410, or 308 to its replacement. | #463 | medium |
| The language-data sources, tools, and conformance suites live under `apps/ios`. | Every client depends on the iOS app's folders, which `language-data/release-inputs.json` names through its `roots`. | #469 | large |
| The app bundles its own committed data rather than pinning a published release. | Once releases are published, nothing checks that the app holds the same files. | #473 | large |
| Frequency-pack sources are uploaded from a workstation with `apps/ios/Tools/publish_frequency_pack_sources.py`, which ADR 0006 allowed until the release pipeline exists. The pipeline exists but doesn't upload them. | Uploads to the CDN happen outside CI, with a person's Cloudflare login. | No issue yet | medium |
| `apps/ios/LanguageData/Sources/Zenbu-Word-Relationships-v1.json` holds two relationships with no source or reviewer, pending a removal decision ([`data-sources.md`](data-sources.md)). | They're built into `LanguageReferenceData.sqlite3`, which the app and the website read. | No issue yet | medium |

## Delivery

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| The server's deployer (`deploy/deployer.sh`) and the account service's backups (`apps/account-api/deploy/backups.sh`) have no tests: ShellCheck is all that runs before merge. | A change to either is first exercised on the server, where it deploys production or backs it up. A test would run them against stand-ins for `docker`, `cosign`, and `aws`, which their fixed `PATH` keeps out. | No issue yet | medium |
| Nothing refuses an account migration that drops or renames what the running code reads. The rule is to add first and remove in a later release ([`account-api.md`](agents/account-api.md), The database). | A deploy migrates while the old image still serves, so such a migration breaks it until the new one takes over. | No issue yet | small |

## Harness

| Debt | Why it matters | Issue | Size |
| --- | --- | --- | --- |
| The website's log lines (`log()` in `apps/web/src/lib/log.ts`) stay in Workers Logs and the service's on its server, neither of which agents can query, and the smoke test has no latency budget. | An agent can't read why staging or production failed, or see a slowdown. | #516 | medium |
| `zenbujapanese/research`, which `AGENTS.md` routes to and ADR 0005 links into, isn't readable by every maintainer: `gh` can't resolve it for at least one. | Agents working for them can't follow those links. | #516 | medium |
| The Clipy skill, `/wayfinder`, and XcodeBuildMCP, which `docs/agents/clipy.md`, `docs/agents/issue-tracker.md`, and `docs/agents/ios.md` rely on, are installed per user. `.mcp.json` holds only the Chrome DevTools server. | Cloud agents and teammates' agents don't get them. | #516 | medium |
| `docs/agents/web.md` is still one guide for running, the dictionary, deploys, and sitemaps. | A small page change sends an agent through all of it. | #516 | small |
| A GitHub token exposed in issue comments isn't recorded as revoked. | A published credential stays usable until it's revoked. | #379 | small |
