# Zenbu web prototype

Throwaway code-first design prototype for GitHub issue #295. Run from the repository root:

```sh
pnpm install
pnpm prototype:web
```

Then open `http://localhost:3000/prototype/dictionary?variant=A`. Use `variant=A`, `B`, or `C`; the development-only switcher also supports pointer clicks and Left/Right arrow keys.

This branch is design evidence, not production architecture. It has frozen fixtures and no backend, database, analytics, deployment, or shared iOS UI.
