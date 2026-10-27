# The word components

`packages/ui`, published in the workspace as `@zenbu/ui`, is the website's look as a package: the
shadcn primitives, the theme, and the components that draw a word, a kanji, and their examples.
The website renders every dictionary page with it, and the browser extension is to draw its
popup with the same components (ADR 0006), so the two show a word the same way. It draws what the
dictionary core answers; it never looks anything up, and it holds no interface text of its own.

Run every command below from `packages/ui`, after `pnpm install` at the repository root.

## What's in it

| Folder | What it holds |
| --- | --- |
| `src/components/` | The stock shadcn primitives (style `base-nova`, base colour neutral), as the CLI wrote them. Add one with `pnpm dlx shadcn@latest add <name>` here; `components.json` points the CLI at this package. |
| `src/dictionary/` | The word components: the word header, the word page's sections (`WordSections`), kanji details, example lists and their paging, conjugations, frequency, source credits, and the pieces they share, such as furigana, pitch, and the pronounce button. |
| `src/styles/theme.css` | The theme: the shadcn tokens on `:root`, `.dark` redefining them, and the utilities `muted-surface`, `meaning-clamp`, and `furigana`. |
| `src/lib/`, `src/hooks/` | `Fill`, which puts components into a template's slots; `PortalContainer`, which sends menus and dialogs into a shadow root; and `useMediaQuery`. |

The package ships its TypeScript source: a client compiles it (the website lists it in
`transpilePackages`, `apps/web/next.config.ts`). Inside the package, imports are relative, and
`cn` comes from the `cn` package.

## What the package may import

The package runs in a Next.js server component, in the browser, and in an extension's shadow
root, so a check refuses anything only one of them has:

- **No client and no framework.** Biome (`packages/ui/biome.json`, `noRestrictedImports`)
  refuses `next`, `next/*`, `@opennextjs/*`, `server-only`, `next-themes`, `sonner`, and the
  website's `@/` paths; `pnpm verify` refuses an import of `apps/` or `tools/`
  (`ui-imports-no-client`) and anything that reaches Next.js, the theme switcher, or the toasts,
  however indirectly (`ui-needs-no-next`, `verify.json`).
- **Only the core's answers.** Of `@zenbu/dictionary-core`, only `detail/` and `sources/`: a
  component takes what a lookup returns as a prop (Biome, and `ui-takes-only-detail-from-core`).
- **No data, storage, or logs.** Outside tests, Biome's `noRestrictedGlobals` refuses `fetch`,
  `XMLHttpRequest`, `localStorage`, `chrome`, and `console`.

And the other way: neither service imports the package (`service-draws-no-ui`,
`account-service-draws-no-ui`), and the website's `src/lib` takes only its types
(`lib-takes-only-types-from-ui`), since `src/lib` builds the data the components draw.

## Text, links, and actions come from the client

- **Text.** Each component names the text it needs in a type of its own, such as
  `ExampleListText` or `ConjugationsText`, and the client passes it in its interface language.
  Data a component shows comes already localized, in the package's `Shown…` types
  (`ShownWordSections`, `ShownKanjiDetails`, `ShownConjugations`). A text object's `lang` is the
  interface language; a component's `lang` prop is the language of the dictionary's own
  glosses, which it marks on them.
- **Links.** A component asks `renderWordLink({ target, ...props })` for a link to a word
  (`{ entSeq }`), a search (`{ query, entSeqs }`), or a kanji (`{ kanji }`)
  (`src/dictionary/word-link.tsx`). The client returns its own link element, or `null` when it
  has no page for that target, and the component then draws the text unlinked.
- **Actions.** Callbacks: `onUnsupported` when the browser can't speak Japanese,
  `paging.loadMore(from)` and `paging.onReload` for an example list, which answers a
  `LoadedPage` (`items`, `stale`, or `failed`), and `loadFormExamples(surface)` for a conjugated
  form. Slots take what the client draws itself: the actions menu of a kanji, the prompt to get
  the app, and the word page's conjugations and examples.

## How the website uses it

- `apps/web/src/lib/dictionary/screen-text.ts` and `word-screen.ts` turn the service's answers
  and the site's dictionaries into the package's text and `Shown…` types.
- `apps/web/src/components/dictionary/word-links.tsx` keeps a map from each link target to the
  path the service's Linked data gave it, and renders Next.js's `Link`.
- `site-examples.tsx` (client) wraps the example lists and conjugations with the site's fetches
  (`apps/web/src/lib/dictionary/page-fetch.ts`), adding each new page's links to the map;
  `kanji-props.tsx` and `word-page-props.tsx` build the props of kanji details, the word header,
  and the word page's sections; `item-actions.tsx` wraps `SavedItemActions` with Share, Copy
  link, and the toasts; `site-actions.ts` holds the callbacks a server component may pass.
- `apps/web/src/app/globals.css` imports the theme and adds `@source` for the package's source,
  so Tailwind writes the classes its components use; the page-level rules stay in the website.

The website's UI rules ([`web.md`](web.md), UI components) hold for the package: stock
components, not restyled, and colours only from the theme's tokens.

## Check it

```sh
pnpm check
```

It runs Biome, the typecheck, and the tests: plain tests in Node, and `*.interaction.test.tsx` in
happy-dom (`vitest.config.ts`). The website's own tests render its pages through the package, and
its browser tests and the rendered-page gate run them in CI ([`ci.md`](ci.md)). The Web workflow
runs this check when the package changes, and a change here redeploys the site.
