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
- **Search results**, `/dictionary/search/<query>/`: the words, and the kanji, a query finds,
  with the kanji's details, and an English search's example sentences.
- **Word page**, `/dictionary/<slug>-<ent_seq>/`: one JMdict entry, as the app's Word Detail
  shows it, with what the app opens from it: its conjugation table and forms, its kanji's details,
  and its examples.

The dictionary has only these three page types (ADR 0010); the kanji, conjugation, and Example
Sentences pages that came before it redirect to the nearest of them. The shared header and footer,
and the URL, indexing, and sitemap rules, apply to all of them.
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
check yet (#511)". The checks come in five kinds:

- **App-recorded conformance suites** in `apps/ios/LanguageData/Conformance/`, recorded from the
  app on the iOS Simulator: `search-retrieval.json`, `search-results.json`, `example-search.json`,
  `word-detail.json`, and `kanji-detail.json`. Each pins, by SHA-256, the app data files it was
  recorded from. The dictionary service's tests (`apps/dictionary-api/src/conformance/`) replay
  them through the shared core on the app's own data, as the service answers the pages.
- **Unit tests** (Vitest) next to the code, under `apps/web/src/`, `packages/dictionary-core/src/`,
  and `apps/dictionary-api/src/`. Each one's `pnpm check` runs them; the `Web`, `Dictionary core`,
  and `Dictionary API` workflows run them on pull requests.
- **The rendered-page gate.** The `Dictionary API` workflow starts the service it built and renders
  what it answers for the suites' cases through the pages' components; `pnpm test` skips it.
  [`docs/agents/web.md`](../../../../docs/agents/web.md) describes it and how to run it locally.
- **Browser tests** (Playwright) in `apps/web/e2e/`, which open the site on the dictionary fixtures
  at a desktop and a phone width, and click through it as a reader does. The `Web` workflow runs
  them on the production build; [`docs/agents/web.md`](../../../../docs/agents/web.md) says how to
  run them locally.
- **Smoke checks** in `apps/web/scripts/smoke.sh`, run against staging and production after each
  deploy. Each is named here by the message it prints.

The suites and most unit tests check the data a page is built from. Rendered-page tests
(`*.test.tsx`) render a page's components to HTML with `renderToStaticMarkup`, as the server does,
and read back what a reader sees; the search results page's, its Example Sentences section's, the
word page's, and its Conjugations section's run the app-recorded suites through the components
from the service. Interaction tests
(`*.interaction.test.tsx`) click through a component in a DOM (happy-dom). Rows without either say
"No automated check yet (#511)". #511 plans more rendered-HTML checks for the designs, and more
smoke checks.

When a behavior changes, update its entry here and its check in the same PR.
