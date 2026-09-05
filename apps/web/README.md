# Zenbu dictionary design prototype — #295

Throwaway design work on `issue-295-website-ui-prototype`.

From the repository root: `pnpm install`, then `pnpm prototype:web`.

Open http://localhost:3000/prototype/dictionary?variant=A (or B / C). The development-only floating control and Left/Right keys switch variants. Search only has the frozen `hello` fixture; another query shows an explicit unsupported-fixture state.

Sources and adaptation inventory: [sources.md](prototype-artifacts/issue-295-iteration-4/sources.md). Tailark source is MIT, pinned before composition; its license is retained next to the inventory. Results are domain compositions, not claimed upstream sections.

Validation: `pnpm prototype:web:lint`, `pnpm prototype:web:typecheck`, `pnpm prototype:web:build`. No automated tests were introduced, following the prototype skill. Browser checks cover responsive screenshots, search submission, switcher, mobile navigation, example disclosure, and device-voice preview.
