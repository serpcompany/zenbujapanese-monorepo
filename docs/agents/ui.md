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
| `src/components/` | The stock shadcn primitives (style `base-nova`, base colour neutral), as the CLI wrote them but for one edit (below). Add one with `pnpm dlx shadcn@latest add <name>` here; `components.json` points the CLI at this package. |
| `src/dictionary/` | The word components: the word header, the word page's sections (`WordSections`), kanji details, example lists and their paging, conjugations, frequency, source credits, and the pieces they share, such as furigana, pitch, and the pronounce button, which speaks in the voice `voice.ts` chooses (below). |
| `src/styles/theme.css` | The theme: the shadcn tokens on `:root`, `.dark` redefining them, and the utilities `muted-surface`, `meaning-clamp`, and `furigana`. |
| `src/lib/`, `src/hooks/` | `Fill`, which puts components into a template's slots; `PortalContainer`, which sends menus and dialogs into a shadow root; and `useMediaQuery`. |

One edit to the CLI's files: `dialog.tsx` (`DialogPortal`), `drawer.tsx` (`DrawerPortal`), and
`dropdown-menu.tsx` (`DropdownMenuContent`) pass `container={usePortalContainer()}` (from
`../lib/portal`) to their primitive's `Portal`, so a menu or dialog opens inside an extension's
shadow root. The CLI drops it when it adds one of these again with `--overwrite`: put it back,
then run `pnpm check`.

The package ships its TypeScript source: a client compiles it (the website lists it in
`transpilePackages`, `apps/web/next.config.ts`). Inside the package, imports are relative, and
`cn` comes from the `cn` package.

## What the package may import

The package runs in a Next.js server component, in the browser, and in an extension's shadow
root, so a check refuses anything only one of them has:

- **No client and no framework.** Biome (`packages/ui/biome.json`, `noRestrictedImports`)
  refuses `next`, `next/*`, `@opennextjs/*`, `server-only`, `next-themes`, and the website's `@/`
  paths, in every file; `pnpm verify` refuses an import of `apps/` or `tools/`
  (`ui-imports-no-client`) and anything that reaches Next.js or the theme switcher, however
  indirectly (`ui-needs-no-next`, `verify.json`).
- **One Toaster.** shadcn's Sonner, `components/sonner.tsx`, is the one file that imports
  `sonner`. It takes the theme as a prop, so each client passes its own: the website its
  `next-themes` theme. The extension mounts none: Word Detail's notices show in the word popup
  that holds it (#1124). Nothing else in the package
  reaches it, however indirectly (`ui-toasts-only-in-toaster`, `verify.json`), so Biome doesn't
  list `sonner` and lifts nothing for that file: a component takes a notice as a callback, and the
  client shows the toast. Sonner adds its styles to the page's head, so a shadow root mounts no
  Toaster.
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

## Speaking

`speak` in `pronounce-button.tsx`, which every speaker and the pitch capsule call, speaks as the
app's `SpeechSynthesisClient.swift` does: at 0.82 of the default rate, in the voice `bestLocalVoice`
(`src/dictionary/voice.ts`) picks from `speechSynthesis.getVoices()`. It takes only a voice on the
computer itself, never a network one (`localService` false), of the language asked for: one of the
region asked for (`ja-JP`, or `en-US` for a meaning) before one of another, then a premium voice, an
enhanced one (by its name or voice URI, in English or Japanese), any other, and Apple's Eloquence
voices last, with the browser's order between equals. With none, `voiceToSpeak` applies the rule
the surface passes through `PronounceWithoutLocalVoice`: the website keeps the default,
`browser-voice`, so the utterance names only its `lang` and the browser speaks in its own voice,
which may be an online one; the extension's roots (`mountPage` and `mountInShadowRoot`) pass
`unsupported`, so it calls `onUnsupported` and speaks nothing (#1122's D4 is the extension's). An
empty list after the wait gets the `lang`-only utterance on the website, and `unsupported` in the
extension. `onUnsupported` also gets a `clearWhen`, which runs the clear it is given once a
`voiceschanged` lists a local voice of the language, so the popup's notice, on its card or in its
full entry, goes and the next click speaks. `useWithoutLocalVoice` asks for
`getVoices()` when a speaker mounts, so a click usually speaks inside its handler and keeps the user
gesture. A click before the voices load waits for a `voiceschanged` that lists a local voice of the
language, up to a second, and a later click drops that wait. Each click cancels what is being
spoken first. The extension's Translate tab takes its voice from `bestLocalVoice` too, for
`ja-JP` or `en-US` ([`extension.md`](extension.md)). The order is the owner's choice (#1122's D4,
#1125): the app gets the system's Japanese voice (Kyoko, on a Mac with no better one), and a Mac
also has Apple's older Eloquence voices (Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, and
Shelley; Chrome names them as "Eddy (Japanese (Japan))"), which come last. The Web Speech rate's
default is 1, so 0.82 is the app's `AVSpeechUtteranceDefaultSpeechRate * 0.82`.

## How the website uses it

- `apps/web/src/lib/dictionary/screen-text.ts` and `word-screen.ts` turn the service's answers
  and the site's dictionaries into the package's text and `Shown…` types.
- `apps/web/src/components/dictionary/word-links.tsx` keeps a map from each link target to the
  path the service's Linked data gave it, and renders Next.js's `Link`.
- `site-examples.tsx` (client) wraps the example lists and conjugations with the site's fetches
  (`apps/web/src/lib/dictionary/page-fetch.ts`), adding each new page's links to the map;
  `kanji-props.tsx` and `word-page-props.tsx` build the props of kanji details, the word header,
  and the word page's sections; `site-item-actions.tsx` (`SiteItemActions`) wraps `SavedItemActions` with Share, Copy
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
