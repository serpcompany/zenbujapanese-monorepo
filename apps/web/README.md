# Zenbu web foundation

From the repository root, with Node 22+ and pnpm 10.14.0:

```sh
pnpm install --frozen-lockfile
pnpm dev
# http://localhost:3300/dictionary
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter web exec playwright install chromium
pnpm test
```

Only `apps/web` is a JavaScript workspace package. The root scripts explicitly
target it; no Swift/Xcode toolchain or dictionary database download is required.
The production server can be started with `pnpm --filter web start --port 3300`.

## Sample boundary

The landing page searches **four verified app records**, in a fixed demonstration
order. Search is submit-first and matches literal substrings in those records'
forms, stored romaji and senses. This is not Dictionary Ranking, full-corpus
search, morphology, app/web result parity, or Best/Additional Match grouping.
Try `taberu`, `hello`, `こんにちは`, or `橋` (two separate entries).
Full delivery/ranking stays with #281/#282. Source extraction, IDs, optional
enrichments and licenses are described in [SAMPLE-PROVENANCE.md](SAMPLE-PROVENANCE.md).
The foundation is marked noindex; final search SEO policy belongs to #280.

`app/layout.tsx` owns theme/font; `app/dictionary/layout.tsx` preserves the two
independent reading preferences across internal navigation. Pages, filtering,
entry cards, pitch and example markup use Server Components. The small reading
provider and official UI controls provide client interaction. `next/form`
submits search to the server, and `next/link` preserves layout state. Preferences
reset on a full reload; persistence is not implemented in this foundation.

`lib/dictionary/types.ts` is the consumed public slice of the existing Swift
types, using their original names, field meanings and value wrappers. Optional
Swift fields use explicit `null`; unavailable frequency is `null` outside the
entry, just as frequency is a separate capability in iOS. Unused fields and
private learner state are not exported. The sample envelope keeps romaji and
frequency separate from `DictionaryEntry`. No full-domain extraction or
database/schema choice is implied.

## Official shadcn setup

Scaffolded `apps/web` with `create-next-app`, then initialized the existing project:

```sh
pnpm dlx shadcn@latest init --preset b1PzeK --yes --pointer
# Only after components.json existed:
pnpm dlx skills add shadcn/ui --skill shadcn --agent codex --yes
pnpm exec shadcn info --json
pnpm exec shadcn preset resolve --json
```

The resolver reports `b1PzeK`, no fallbacks: Nova / Neutral / Blue / Inter,
Base UI, Lucide and default radius. `components.json` records `base-nova`, RSC,
local aliases, Tailwind v4 `app/globals.css` and CSS variables. Global CSS retains
the official light/dark semantic tokens. The separate `--brand: #BC002D` and
native `--pitch-downstep` token leave blue interactions intact. Only components
consumed here (and their official dependencies) were installed. The official
agent skill and its source lock are local to this web package.

References: [existing Next project](https://ui.shadcn.com/docs/installation/next),
[theming](https://ui.shadcn.com/docs/theming),
[skills](https://ui.shadcn.com/docs/skills).

## Web verification and CI

`web.yml` is path-scoped to the web package, root pnpm files and itself. It uses
Ubuntu, no LFS, typecheck/lint/build and Chromium browser journeys at desktop and
mobile sizes. The existing `ios_ci_scope.py` classifies these paths as
`ios_changed=false`; expensive iOS workflow jobs remain gated by that result.
No iOS workflow or app source is changed.

Browser tests cover submitted search, exact route identity including homographs
and invalid headword/ID pairs, independent reading aids across navigation,
optional frequency, sourced pitch/examples, English/no-result searches and mobile
overflow. They use public pages/controls, the pre-approved seams in #271.

## Bounded Cloudflare check (2026-09-05)

Current [Cloudflare Next.js documentation](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
recommends **vinext (beta)** for new Next.js 16 applications. The
[OpenNext adapter](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)
remains an alternative for existing applications and adapts `next build` output.
Both document support for App Router, RSC and SSR, which this foundation uses.

`pnpm dlx vinext check` against this package reported 9 supported, 1 partial and
1 issue (86%): `next/link`, `next/navigation`, `next/form`, `allowedDevOrigins`,
Tailwind and Lucide supported; `next/font/google` partial because vinext loads
fonts from a CDN rather than self-hosting at build time; Vite requires
`"type": "module"`, currently absent. A zero command exit status does not mean
those findings passed. No initializer, adapter install, Cloudflare resource,
Workers build or deployment was performed.

Before #284 chooses the runtime, resolve the font delivery difference, verify
the chosen adapter's exact Next version support, and run Workers-local build and
browser journeys. This normal Next build proves local foundation behavior only;
it is not Cloudflare production-readiness evidence.
