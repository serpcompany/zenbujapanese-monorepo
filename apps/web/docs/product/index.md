# Website product documentation

This folder describes user-facing behavior that is built and live on zenbujapanese.com, and the
automated check that enforces each behavior. It is updated with the implementation and is not a
roadmap. The one exception is [Required, not built yet](dictionary.md#required-not-built-yet-511),
which lists features the website must have but doesn't yet, with the check each will get.

The website is a public mirror of the app's dictionary. Its pages show what the app's Search tab
shows for the same word or kanji, laid out as the #462 designs chose: stock shadcn components in
one column, with sections in the app's order. There is no sign-in yet, so actions that keep
learner data (lists, notes, known words, photos) open a prompt to get the app. That prompt becomes
a sign-in prompt once account pages (#468) exist.

## Pages

- **Dictionary home**, `/dictionary/`: a search box.
- **Search results**, `/dictionary/search/<query>/`: the words, and the kanji, a query finds.
- **Word page**, `/dictionary/<slug>-<ent_seq>/`: one JMdict entry, as the app's Word Detail
  shows it.
- **Kanji page**, `/dictionary/kanji/<character>/`: one kanji, as the app's Kanji Detail shows it.

The shared header and footer, and the URL, indexing, and sitemap rules, apply to all of them.
[Dictionary](dictionary.md) describes every behavior, page by page.

## What defines the website's behavior

The app's product documentation, [`apps/ios/docs/product/`](../../../ios/docs/product/index.md),
and the Swift views it describes define what the website shows. The website differs only where a
decision on file says so: the #462 designs, and the decisions on #464, #465, #466, #485, #499, and
#511. Each difference names its decision. A difference without one is a bug, listed under
[Required, not built yet](dictionary.md#required-not-built-yet-511).

The owner's decision on #511 makes every app dictionary feature the #511 inventory found missing
a requirement for the website, and sets the order of work: a behavior is written here first, with
its app source and planned check, and is then built with its check in the same PR.

## How behavior is verified

Each behavior in [Dictionary](dictionary.md) names its automated check, or says "No automated
check yet (#511)". The checks come in four kinds:

- **App-recorded conformance suites** in `apps/ios/LanguageData/Conformance/`, recorded from the
  app on the iOS Simulator: `search-retrieval.json`, `word-detail.json`, and `kanji-detail.json`.
  Each pins, by SHA-256, the app data files it was recorded from.
  `src/lib/dictionary/search/conformance.test.ts` and `src/lib/dictionary/detail/conformance.test.ts`
  replay them through the website's search and detail cores on a locally built release database, reading it as the pages do.
- **Unit tests** (Vitest) next to the code under `apps/web/src/`. `pnpm check` runs them, and the
  `Web` workflow runs it on every pull request that changes `apps/web/**`.
- **Import gates.** Each release database import runs its conformance suite before anything
  reaches D1; `pnpm check` skips the suites. [`docs/agents/web.md`](../../../../docs/agents/web.md)
  describes the gates and how to run the suites locally.
- **Smoke checks** in `apps/web/scripts/smoke.sh`, run against staging and production after each
  deploy. Each is named here by the message it prints.

The suites and the unit tests check the data a page is built from, not the rendered page. No test
renders a page component yet, so layout, toolbar, and wording rows say "No automated check yet
(#511)". #511 plans an app-recorded suite for the search results screen, rendered-page checks
against the suites, rendered-HTML checks for the designs, and more smoke checks.

When a behavior changes, update its entry here and its check in the same PR.
