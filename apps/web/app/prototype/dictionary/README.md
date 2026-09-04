# Issue #295 dictionary UI prototype

Three structurally different dictionary result directions, switchable by the
`variant` query parameter on `/prototype/dictionary`:

- `A`: quiet single-column reference layout
- `B`: denser split result/detail-preview layout
- `C`: compact list/table-like scanning layout

This is throwaway, branch-only code with frozen fixtures. It does not access a
backend, database, analytics, persistence, or the iOS app.

Run from the repository root:

```sh
pnpm prototype:web
```
