# Checks

Every check this repository runs, what it enforces, and where it runs. The rules they enforce are
in [`code.md`](code.md); the shared checks are SERP's, from `@serpcompany/verify`, configured by
[`verify.json`](../../verify.json), and this repository's own are in `tools/checks`.

| Check | What it enforces | Where it runs |
| --- | --- | --- |
| `pnpm verify` | No comments, docs, file size, Swift layers, no XCUITest waits or unlisted pauses in UI tests, secrets, duplicate code, dead code, and imports, then ShellCheck, actionlint, and Ruff: `serp-verify` from [`@serpcompany/verify`](https://github.com/serpcompany/serp/blob/main/packages/verify/README.md), at the version the lockfile pins, configured by [`verify.json`](../../verify.json) | The `Repository` workflow, on every pull request and in the merge queue; the pre-push hook |
| `pnpm verify <checks> [paths]` | Some of the checks (`comments`, `docs`, `sizes`, `layers`, `waits`, `secrets`, `duplicates`, `deadcode`, `dependencies`, `linters`, comma-separated), on the given repository paths or on every file. `deadcode` always reads the whole workspace, and `dependencies` the packages the paths touch | By hand; the pre-commit hook runs `comments,sizes,secrets` on the staged files |
| `pnpm maintenance:report` | A Markdown report: the checks' failures; docs whose named files changed after the doc was edited; the quality rows whose Code changed after their Graded date ("Scores to re-grade"); known debt counted by Size, with the first small item; size and duplicate exceptions; the docs over their size budget; code files within 50 lines of the size limit; and, in the weekly `report` job, the review's findings of the last four weeks by part, with the parts that repeat (`tools/checks/src/report.ts`, which runs `serp-verify` for the checks and reads the exceptions from `verify.json`) | `Weekly maintenance`, on Mondays, where doc gardening and code gardening start from it ([`ci-agents.md`](ci-agents.md)); by hand |
| The edit hook | No comments, file size, Swift layers, and no secrets, on each file Claude Code writes, as it writes it (`.claude/settings.json` runs `serp-verify hook`). Claude Code runs the hook from the checkout the session started in, which needs the package installed: the package then hands a file in a git worktree to that worktree's own copy. Until the session's checkout is installed, every write is answered with the install advice, and a checkout the package hands a file to says so too when it has no install, except in a GitHub Actions job, which chose not to install: the command passes there when the package is missing, which `tools/checks/src/hooks.test.ts` holds. The package also checks a file in another git repository with its defaults, or asks for an install there. From Claude Code 2.1.295 a hook that crashes is reported too (`onFailure`); an older one ignores the setting | Claude Code sessions in this repository |
| The stop hook | The same four checks on every file changed since the last commit, and the docs check, before a turn ends (`serp-verify stop-hook`). It catches what the edit hook can't see: a file a shell command rewrote, and a doc a change elsewhere made wrong. It reports the same failures once per session, and never holds a turn twice in a row; where the session's checkout has no install, it says so at every turn's end without holding the turn. In a GitHub Actions job it does nothing: the jobs that run Claude there run the checks themselves, on a checkout the action has partly reset | Claude Code sessions in this repository |
| The git hooks | Before a commit, `serp-verify comments,sizes,secrets` and each package's Biome on the staged files; before a push, `serp-verify` and each changed package's lint, typecheck, and tests, without its build or the dictionary service's recorded suites, which take over a minute and need the app's data files ([`lefthook.yml`](../../lefthook.yml), `tools/checks/src/git-hooks.test.ts`) | Every clone after `pnpm install` |
| The pull request checks | A Conventional Commit title, a closing issue or a stated reason for none, and a test in every fix ([Fixes](code.md#fixes), [Pull requests](code.md#pull-requests)), from `tools/checks/pull-request.mjs`, which needs no install. The package has the same three, and a fourth for local paths in the text, as an action this public repository can't call from private serp ([`ci.md`](ci.md), Pull request) | The `Pull request` workflow, on every pull request, again when its title or body is edited |
| `pnpm check` | `pnpm verify`, then `pnpm check` in every package | By hand, before a pull request |
| `pnpm check` in a package | Biome (with the package's import and logging rules, and no non-null assertions), typecheck, tests, and its build | The package's workflow, on pull requests that change it |
| Generated files | The core's fixtures match what `pnpm --filter zenbujapanese-dictionary-api fixtures` exports from the language data, `apps/web/cloudflare-env.d.ts` matches what `pnpm cf-typegen` writes from `wrangler.jsonc`, and the app's bundle of the core matches what `pnpm --filter @zenbu/dictionary-core bundle:javascriptcore` writes (`packages/dictionary-core/src/embedded/bundle.test.ts`) | The `Dictionary API`, `Web`, and `Dictionary core` workflows |

`pnpm verify` lists files with `git ls-files`, so it checks new files before they're committed, and
skips ignored ones. It runs ShellCheck, actionlint, and Ruff in Docker, at the versions the
package pins, so a run here and a run in CI agree. Without Docker it runs an installed copy
instead, and with neither it says the linter didn't run and passes; in CI a linter that can't run
fails the check. Ruff reads [`ruff.toml`](../../ruff.toml), and ShellCheck a `.shellcheckrc` beside
a script. `deadcode` and `dependencies` read every package, so they need the whole workspace
installed (`pnpm install`). The shared checks' own tests are in the package, in serp; this
repository's own checks, the tests that hold its workflows, hooks, agent settings, and deployer to
their rules, are in `tools/checks` (`pnpm check` there), which the `Repository` workflow runs too.

## Installing the package

`@serpcompany/verify` is a private package on GitHub Packages and a root devDependency, so every
`pnpm install` reads it there: the committed [`.npmrc`](../../.npmrc) sends the `@serpcompany`
scope to `npm.pkg.github.com`, and each machine's `~/.npmrc` holds a token with `read:packages`
and the scope line. The token `gh auth token` prints after `gh auth refresh -s read:packages`
installs it; the package's [Install](https://github.com/serpcompany/serp/blob/main/packages/verify/README.md#install) describes a personal access token
(classic), which works too. Without one, `pnpm install` fails in this repository. A new release
reaches this repository in a pull request that raises the version in `package.json` and the
lockfile; `tools/checks/src/verify-package.test.ts` holds the pin, the `.npmrc`, and every install
below to this.

## In CI

- **Every job that installs** gets `packages: read`, `actions/setup-node` with the registry and
  the `@serpcompany` scope, and the job's own token as `NODE_AUTH_TOKEN` on the install step
  only. The token reads the package once its settings give this repository Read under Manage
  Actions access; until then every install fails, and `Repository` says which grant it needs.
- **Each service image** installs it with that token in a secret `npmrc`, mounted for the
  install's one `RUN` and kept in no layer: the deploy workflow writes it to the runner's temp
  folder and hands it to the build as `secret-files` ([`ci-deploys.md`](ci-deploys.md)). By hand,
  `docker build --secret id=npmrc,src=$HOME/.npmrc` does the same.
- **Links into GitHub aren't checked here** (`docs.githubLinks.orgs` is empty in `verify.json`),
  as before the package. The package's docs check would open each link into a serpcompany
  repository through GitHub's API, and most of them are private: this public repository's jobs
  could read them only with the `serp-agent` app's token, which `Repository` would hand to the
  pull request's own code, and the jobs that run Claude (`Claude`, both gardening jobs) would
  run the docs check with no token that reads them, under CI, where it fails
  ([`harness-debt.md`](../harness-debt.md), Checks). The weekly report runs the checks without CI's
  setting or any token, so it reads nothing but the repository.
- **SERP's reusable workflows aren't called.** Its Verify and Code review workflows, and its pull
  request checks' action, are in serp, a private repository, and GitHub lets only private and
  internal repositories use a private repository's actions and reusable workflows; this one is
  public. So `Repository` installs and runs the package itself, as
  [Workflows](https://github.com/serpcompany/serp/blob/main/packages/verify/docs/workflows.md#installing-the-package-in-ci) describes for a
  repository's own workflow. `Pull request` keeps `tools/checks/pull-request.mjs`: the package's copy would need
  the install that job skips, and the code review's scripts share the script's reading of closing
  keywords. `Code review` keeps its own workflow ([`ci-review.md`](ci-review.md)): SERP's reviews
  once, and this one reviews again when the first attempt didn't read the whole change.
