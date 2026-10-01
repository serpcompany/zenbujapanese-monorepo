# Tech debt

Known debt: shortcuts, duplicated code, and gaps in checks that the repository lives with for now,
each with the issue that tracks it. Bugs and features stay in issues
([`issue-tracker.md`](agents/issue-tracker.md)), and how well each area is tested and documented is
in [`quality.md`](quality.md).

Add a row in the pull request that knowingly leaves debt, and remove it in the one that pays it
off. A row without an issue says "No issue yet"; open one before starting the work.

## Code

| Debt | Why it matters | Issue |
| --- | --- | --- |
| Search, example, and word and kanji detail logic exist twice: the app's Swift, and its port in `packages/dictionary-core`. | Every change is made in both. `Search parity` checks that both sides of a pair change, not that they agree, and nothing tests the Swift before merge. | #481 |
| Eleven Swift files are over the 500-line limit, listed with their sizes and reason in `tools/checks/src/sizes.ts`. Splitting them needs a developer or agent with a Mac, since nothing here can build or test Swift. | A long file is hard to read and change in one pass. Each may only shrink, and leaves the list once it's under the limit. | #547 |
| The iOS data tools (`apps/ios/Tools/`) keep their comments, and `apps/ios/Tools/import_jmdict.py` its 1,181 lines, because each records its own SHA-256 in the data it built. Whoever next rebuilds that data, on a Mac that can check the app with it, removes the comments, splits the file, and records the new hashes. | They're the only code with comments, and the only non-Swift file over the limit. | #547 |
| The iOS app is one target, `SearchExperience` (`apps/ios/Modules/Sources/SearchExperience/`), holding Search, Player, Account, Lists, and Profile. | Nothing keeps one feature from reaching into another's code. Splitting it by feature needs a decision, and an ADR if so. | #516 |
| Word notes and encounter media are keyed by `WordNoteID`, a hash of a word's meanings (ADR 0006). PR #480 re-keys them. | A JMdict edit to a word's meanings detaches its notes and media, and sync (#374) needs Language Reference IDs. | #474 |

## Checks

| Debt | Why it matters | Issue |
| --- | --- | --- |
| `SearchExperienceTests` runs only when someone runs it on a Mac: the `iOS` workflow's macOS job waits for the owners to set `IOS_SWIFT_TESTS` to `on` ([`ci.md`](agents/ci.md), iOS). | The Swift can drift from the recorded suites the website is held to, and a change that breaks the app's build can merge. | #381, #516 |
| The iOS manual checks in `docs/agents/ios.md` are checklists a person walks through in the Simulator. | An agent can't check a change to Player, Lists, Known Words, or Image Search on screen, or keep evidence of what it saw. | #516 |
| No app-recorded suite covers sentence search (Discovered Words). The service checks its own cases in `apps/dictionary-api/src/conformance/sentence-search.test.ts`. | The website's sentence search isn't held to what the app shows. Recording it needs the Japanese Text Analysis pack in the test host. | #470 |
| The kanji detail suite leaves out the JLPT metric until the level scale is decided. | The app and the website show KANJIDIC2's pre-2010 levels as N-levels, and no suite compares them. | #485 |
| The iOS data tools' importers have no tests; only the contract tests on what they write run before merge (`apps/ios/Tools/tests/`, in the `iOS` workflow). | An importer change is checked only through a rebuild of what it writes. | No issue yet |
| Swift has no linter. `pnpm verify` runs ShellCheck, actionlint, and Ruff. | Swift mistakes that a linter would catch are left to review. | #516 |
| Apple's accessibility audit found 144 Dynamic Type, 14 hit-region, and 4 clipped-text problems in the app. | Large text and small targets fail on Search, its results, Word Detail, Kanji Detail, and Examples. | #380 |

## Website

| Debt | Why it matters | Issue |
| --- | --- | --- |
| 4 of the 67 behaviors in `apps/web/docs/product/dictionary.md` have no automated check, and 12 more have a part without one, mostly layout and speech. | A change that breaks them passes CI. | #511 |
| The website lacks app behaviors that the product docs require, under Required, not built yet: Reading Aids, handwriting and radical input (#526), kanji element detail, the kanji details' Share and menu, and more. | The website is meant to show what the app shows; each difference without a decision on file is a bug. | #511 |
| Search result pages are in no sitemap. #463 dropped its precomputed search-sitemap query set after ADR 0009, and the route audit decides which search pages stay indexable at all. | Search engines find search pages only through links. | #544 |

## Language data

| Debt | Why it matters | Issue |
| --- | --- | --- |
| No language-data release is published. The `language-data-release` environment has no R2 token, so every `Language data release` run on `main` stops before uploading. The bucket has no public domain, and releases record no core hash (`core_sha256` is `null`). | ADR 0006's shared, versioned release doesn't exist yet for any client. | #463 |
| The dictionary records no retired entries: `retired()` in `packages/dictionary-core/src/artifact/dictionary.ts` returns none. | A word that a new JMdict drops answers 404, rather than ADR 0007's 410, or 308 to its replacement. | #463 |
| The language-data sources, tools, and conformance suites live under `apps/ios`. | Every client depends on the iOS app's folders, which `language-data/release-inputs.json` names through its `roots`. | #469 |
| The app bundles its own committed data rather than pinning a published release. | Once releases are published, nothing checks that the app holds the same files. | #473 |
| Frequency-pack sources are uploaded from a workstation with `apps/ios/Tools/publish_frequency_pack_sources.py`, which ADR 0006 allowed until the release pipeline exists. The pipeline exists but doesn't upload them. | Uploads to the CDN happen outside CI, with a person's Cloudflare login. | No issue yet |
| `apps/ios/LanguageData/Sources/Zenbu-Word-Relationships-v1.json` holds two relationships with no source or reviewer, pending a removal decision ([`data-sources.md`](data-sources.md)). | They're built into `LanguageReferenceData.sqlite3`, which the app and the website read. | No issue yet |

## Harness

| Debt | Why it matters | Issue |
| --- | --- | --- |
| The website's log lines (`log()` in `apps/web/src/lib/log.ts`) stay in Workers Logs and the service's on its server, neither of which agents can query, and the smoke test has no latency budget. | An agent can't read why staging or production failed, or see a slowdown. | #516 |
| `zenbujapanese/research`, which `AGENTS.md` routes to and ADR 0005 links into, isn't readable by every maintainer: `gh` can't resolve it for at least one. | Agents working for them can't follow those links. | #516 |
| The Clipy skill, `/wayfinder`, and XcodeBuildMCP, which `docs/agents/clipy.md`, `docs/agents/issue-tracker.md`, and `docs/agents/ios.md` rely on, are installed per user. `.mcp.json` holds only the Chrome DevTools server. | Cloud agents and teammates' agents don't get them. | #516 |
| `docs/agents/web.md` is still one guide for running, the dictionary, deploys, the database, and sitemaps. | A small page change sends an agent through all of it. | #516 |
| A GitHub token exposed in issue comments isn't recorded as revoked. | A published credential stays usable until it's revoked. | #379 |
