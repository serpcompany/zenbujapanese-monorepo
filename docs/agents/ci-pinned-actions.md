# Pinned actions

Every workflow, and every action in `.github/actions/`, runs each action it names at a commit, not
a tag. This doc says why, which commit each is at, and how to move one. Every workflow and what
starts it is in [`ci.md`](ci.md).

## Why every action is pinned

A tag such as `@v5` can be moved to new code. In the release workflow, the three deploy workflows,
the three that run Claude, and the JMdict monthly update, that code would run with the bucket's
token, the registry's, Cloudflare's, Claude's, or one that pushes. The others hold less, but not
nothing: each job that installs holds a token that reads the private `@serpcompany/verify`, the
`Pull request` jobs one that reads the pull request, and `Dictionary API`'s run on a push to `main`
saves the Git LFS cache that `Dictionary API deploy` restores under the same key. A pin also runs the same code on every run.

`tools/checks/src/workflow-rules.test.ts` fails a workflow or action that names another by
anything but its commit, and holds the table below to the pins. The last workflows were pinned on
2026-10-25, to the commits their major tags named that day, so pinning them changed no code that
runs.

## The pins

- `anthropics/claude-code-action` is at v1.0.258, its latest release on 2026-10-22, which installs
  Claude Code 2.1.308. The three workflows that run it run only when their file is `main`'s, so a
  pull request that moves the pin can't try it: the first review after the merge is its test
  ([`ci-agents.md`](ci-agents.md), Code review). Moving it also moves the Claude Code version a
  dry run of the review uses ([`ci-review.md`](ci-review.md), Trying a change to the review).
- `pnpm/action-setup` is at v6.0.10, the commit its `v6` tag named when it was pinned.
- `astral-sh/setup-uv` is at v10.3.2, its latest release on 2026-10-22; the project keeps no
  floating major tag. Only the JMdict monthly update uses it, with its cache off.

To update one, pin the new release's commit and change this table in the same pull request.

| Action | Commit | Version | Used in |
| --- | --- | --- | --- |
| `actions/checkout` | `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09` | v5.1.0 | `.github/workflows/account-api-deploy.yml`, `.github/workflows/account-api.yml`, `.github/workflows/claude.yml`, `.github/workflows/code-review.yml`, `.github/workflows/dictionary-api-deploy.yml`, `.github/workflows/dictionary-api.yml`, `.github/workflows/dictionary-core.yml`, `.github/workflows/extension-packages.yml`, `.github/workflows/extension.yml`, `.github/workflows/ios.yml`, `.github/workflows/jmdict-update.yml`, `.github/workflows/language-data-build.yml`, `.github/workflows/language-data-release.yml`, `.github/workflows/maintenance.yml`, `.github/workflows/pull-request.yml`, `.github/workflows/repository.yml`, `.github/workflows/web-deploy.yml`, `.github/workflows/web.yml` |
| `actions/setup-node` | `a0853c24544627f65ddf259abe73b1d18a591444` | v5.0.0 | `.github/workflows/account-api.yml`, `.github/workflows/claude.yml`, `.github/workflows/dictionary-api.yml`, `.github/workflows/dictionary-core.yml`, `.github/workflows/extension-packages.yml`, `.github/workflows/extension.yml`, `.github/workflows/ios.yml`, `.github/workflows/jmdict-update.yml`, `.github/workflows/maintenance.yml`, `.github/workflows/repository.yml`, `.github/workflows/web-deploy.yml`, `.github/workflows/web.yml` |
| `pnpm/action-setup` | `0977fd99725f1db4007ccb2928dbb4e90d06cc86` | v6.0.10 | `.github/workflows/account-api.yml`, `.github/workflows/claude.yml`, `.github/workflows/dictionary-api.yml`, `.github/workflows/dictionary-core.yml`, `.github/workflows/extension-packages.yml`, `.github/workflows/extension.yml`, `.github/workflows/jmdict-update.yml`, `.github/workflows/maintenance.yml`, `.github/workflows/repository.yml`, `.github/workflows/web-deploy.yml`, `.github/workflows/web.yml` |
| `actions/upload-artifact` | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | v7.0.2 | `.github/workflows/account-api.yml`, `.github/workflows/claude.yml`, `.github/workflows/code-review.yml`, `.github/workflows/extension-packages.yml`, `.github/workflows/extension.yml`, `.github/workflows/ios.yml`, `.github/workflows/language-data-build.yml`, `.github/workflows/maintenance.yml`, `.github/workflows/web.yml` |
| `actions/cache` | `caa296126883cff596d87d8935842f9db880ef25` | v5.1.0 | `.github/actions/package-language-data/action.yml`, `.github/workflows/dictionary-api-deploy.yml`, `.github/workflows/dictionary-api.yml`, `.github/workflows/ios.yml` |
| `actions/setup-python` | `ece7cb06caefa5fff74198d8649806c4678c61a1` | v6.3.0 | `.github/actions/package-language-data/action.yml`, `.github/workflows/ios.yml`, `.github/workflows/language-data-build.yml` |
| `docker/setup-buildx-action` | `f87e5991a6d7451dcb8d9637bfbc97413f497069` | v4.4.1 | `.github/workflows/account-api-deploy.yml`, `.github/workflows/dictionary-api-deploy.yml` |
| `docker/build-push-action` | `c3c9e263c25d99ce0380d002d59b67737d91b0dc` | v7.4.0 | `.github/workflows/account-api-deploy.yml`, `.github/workflows/dictionary-api-deploy.yml` |
| `docker/login-action` | `dbcb813823bdd20940b903addbd779551569679f` | v4.6.0 | `.github/workflows/account-api-deploy.yml`, `.github/workflows/dictionary-api-deploy.yml`, `.github/workflows/web-deploy.yml` |
| `sigstore/cosign-installer` | `6f9f17788090df1f26f669e9d70d6ae9567deba6` | v4.1.2, installing cosign v3.1.3 | `.github/workflows/account-api-deploy.yml`, `.github/workflows/dictionary-api-deploy.yml` |
| `astral-sh/setup-uv` | `07a047e608db84b3d8c06cd9a7c7dcc9c355c18e` | v10.3.2 | `.github/workflows/jmdict-update.yml` |
| `anthropics/claude-code-action` | `6b6870e649b5ff408753befeaee5fc7989d4e6a9` | v1.0.258 | `.github/workflows/claude.yml`, `.github/workflows/code-review.yml`, `.github/workflows/maintenance.yml` |
