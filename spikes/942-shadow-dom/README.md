# Spike #942: the website's shadcn components in a Shadow DOM

Throwaway. Never merged.

Renders the website's own `Card`, `Badge`, `Button`, `RubyText` and `DropdownMenu`
(`apps/web/src/components`) with React 19 and Base UI 1.8 inside a shadow root, on a page with
hostile styles (`html{font-size:10px}`, `body{color:red;letter-spacing:2px;line-height:3}`,
`:root{--card:green;--radius:0}`), and reads computed styles in Chrome for Testing 149.0.7827.55.

The CSS is the website's `src/app/globals.css` compiled with Tailwind 4.3.3, in four variants:

- A: as the website ships it (tokens on `:root`).
- B: the token block on `:root, :host`.
- C: B with every `rem` turned into px (x16).
- D: C with `:host{all:initial}` first.
- E: C with Tailwind's own `@property` fallback block (its `@supports` for browsers without
  `@property`) made unconditional.

C and D also run with the CSS's 80 `@property` rules copied into the page's `<head>`.

## Run

Needs the main checkout's `apps/web/node_modules` (pnpm install there):

    ln -s <main>/apps/web/node_modules node_modules
    ln -s <main>/apps/web/node_modules ../../apps/web/node_modules
    cp <next>/dist/next-devtools/server/font/geist-latin.woff2 out/geist.woff2
    node build.mjs
    SPIKE_CHROME=<Chrome for Testing binary> node run.mjs

`build.mjs` imports postcss, @tailwindcss/postcss and esbuild by their paths in the main
checkout's `node_modules/.pnpm`; change them to yours.

## Results (Chrome for Testing 149.0.7827.55, Apple M3 Max, 128 GB, macOS 27.2)

- A: the page's `:root` tokens win: the card is the page's green with radius 0.
- B: tokens right; sizes follow the page's 10px root (`p-4` 10px, a button 20px tall).
- C: sizes right (16px, 32px); no ring or shadow (`box-shadow: none`).
- C with `@property` copied to the page, and E: ring and `shadow-md` drawn.
- D: the page's `letter-spacing` and `line-height` stop leaking in; `--font-sans` must be set.
- `@font-face` inside the shadow root is ignored; in the document it loads.
- `DropdownMenu` as the website has it portals to `document.body`, unstyled; Base UI's
  `Portal container` inside the shadow root draws it styled.
