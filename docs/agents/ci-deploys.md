# Deploy and release workflows

The workflows that deploy the site, ship the services' images, and publish language data, with the
action the language-data workflows share and the actions pinned by commit. Every workflow and what
starts it is in [`ci.md`](ci.md). Change a workflow's section in the same pull request as the
workflow.

## A job never deploys over a later run's

Each job that pushes an image or deploys starts with the `latest-run` action
(`.github/actions/latest-run/`), which fails the job when a later run of its workflow on `main`
has already run that same job. Deploying then would put old code over new, and nothing would put
the new code back. It asks on every attempt: a workflow's runs go one at a time, but GitHub
doesn't promise their order, and anyone can start an old run again.

- **What counts.** A later run's job counts once it is running or has finished, in any of that
  run's attempts, whatever its result. A later run still waiting behind this one doesn't count,
  nor one cancelled before it ran the job, nor one that skipped it: a push stops at staging while
  `DEPLOY_PRODUCTION` is `false`, so it never blocks an earlier run's `production` job.
- **The job fails, rather than passing with nothing deployed.** The site's deploy reads a green
  `staging` job of the service's run as "this commit's service is deployed"
  (`apps/web/scripts/wait-for-dictionary-service.sh`), and an image job that pushed again would
  leave `sha-<release>` naming an image main never signed, which a rollback then refuses.
- **To deploy an old build on purpose, start a new run:** an image workflow's `tag` input, or a
  revert for the site.
- **When a commit's service run can no longer deploy,** because a later one has, the commit's
  site run stops at its wait for it. Run `Web deploy` by hand: that run deploys `main`'s tip
  against the service as it is.
- **Starting an old run again while another runs** takes the one waiting place GitHub keeps for
  the workflow, which cancels a newer run that was waiting there. Start the newer run again.
- **A run from before this guard has none:** a run uses the workflow file of its own commit.

`tools/checks/src/deploy-workflows.test.ts` holds every such job to it and runs the action's
script against a stand-in for the GitHub API.

## Web deploy

`.github/workflows/web-deploy.yml` deploys the site on a push to `main` that changes the same files
as `Web` ([`ci.md`](ci.md), Web) or what the dictionary service's image holds (the paths
`Dictionary API deploy` runs on, below, which `tools/checks/src/deploy-workflows.test.ts` holds it
to), since the site's sitemaps are written from it, and by hand. Runs never overlap, and a running one is never cancelled. The `staging`
job, then the `production` job, each in the GitHub environment of that name:

1. waits for this commit's `Dictionary API deploy` run, if it has one, to sign and tag the image
   for the environment (`apps/web/scripts/wait-for-dictionary-service.sh`, up to 20 minutes), so a
   commit that changes both ships the service first; a run that failed, skipped the environment,
   or was cancelled stops it. The workflow's `actions: read` permission lets it see that run. It
   can't see the server deploy: Bot Fight Mode on the zone challenges CI runners
   ([`dictionary-api.md`](dictionary-api.md), How a deploy works).
2. points the site at the environment's service (`apps/web/scripts/use-dictionary-service.sh`, with
   the environment's `DICTIONARY_API_URL` variable);
3. writes the dictionary's sitemaps (`apps/web/scripts/write-dictionary-sitemaps.sh`): it pulls the
   environment's service image (`:staging` or `:production`), with the job's `packages: read`
   permission, starts it on the runner, and runs `pnpm sitemaps` against it, failing the job when it
   can't ([`web.md`](web.md), Sitemaps; ADR 0016);
4. deploys and smoke-tests (`apps/web/scripts/smoke.sh`)
   the workers.dev URL the deploy printed, since the zone's bot protection blocks CI runners. When
   Cloudflare challenges the site's Worker for the runner too, the smoke test skips its dictionary
   checks with a warning ([`web.md`](web.md), Dictionary service). On staging it also checks the
   password gate, and skips, with a warning, its one request to the canonical host when the runner
   is blocked ([`staging-access.md`](staging-access.md), Checks).

Production runs once staging passes. Its environment has no required reviewer, by the owner's
decision; add one to gate it by hand. The repository variable `DEPLOY_PRODUCTION` set to `false`
stops pushes at staging; a run by hand still deploys production. The production build gets
`NEXT_PUBLIC_GTM_ID`, the public analytics ID, from the `production` environment's variables. The
environments, the secrets, and the SERP standard the deploy follows are in [`web.md`](web.md),
Environments and deploys.

## Dictionary API deploy

`.github/workflows/dictionary-api-deploy.yml` ships the service's Docker image
(`apps/dictionary-api/Dockerfile`, ADR 0009). It runs on a push to `main` that changes what the
image holds: the service, the core, what the services share, the package files it installs from
(the root ones and `apps/web/package.json`), the app's files it copies (the `.sqlite3` files, the
`Kanji*ReferenceData.json` files, the pack catalog, and Kuromoji's),
`language-data/release.json`, the release the app routes name, the pinned manifests
(`language-data/releases/*/manifest.json`), which the service checks its files against, and the
release's retired entries (`language-data/derived/RetiredEntries.json`). Tests and the service's
conformance code (`apps/dictionary-api/src/conformance/`) aren't in the image, so they don't start
it. A pull request that
changes the same files runs only the `image` job, which builds and checks without pushing; a new
push cancels its last run. Other runs go one at a time, and a running one is never cancelled. By
hand, the `tag` input deploys an image already pushed (`sha-<commit>`) without building, to roll
back, but only to an image main signed before.

- **`image`** builds the image, with Docker's layer cache in the Actions cache, or pulls the one
  `tag` names, and starts it. The build's install reads the private `@serpcompany/verify`, a root
  devDependency, with the job's own token: a step writes an `npmrc` with it to the runner's temp
  folder, and the build mounts it as the secret `npmrc` for that one `RUN`, so no layer keeps it
  ([`checks.md`](checks.md), In CI). It checks that `/v1/info` refuses a request without the
  token, that a search, its examples, a word, and a kanji (見る, JMdict entry 1259290, and 見)
  answer with it, and, for a build, that `/healthz` names this commit's release (the first 12
  characters of its SHA). A build is then pushed as `:sha-<release>`, and as `:main` from `main`
  only.
- **`staging`** signs the image's digest with cosign, keylessly, then moves the `:staging` tag to
  it. Its `id-token: write` permission gives cosign a certificate for the run's
  GitHub identity, which names this workflow and the branch it ran from; since the `staging`
  environment only accepts `main`, that identity is always
  `.github/workflows/dictionary-api-deploy.yml@refs/heads/main`, the one the server's deployer
  requires. It signs before moving the tag, so the tag never names an image the deployer would
  refuse. On a rollback, it first checks that main signed the image, so an image a branch pushed
  can't be promoted. cosign's version is the one the server verifies with.
- **`production`** moves the `:production` tag to the image once `staging` has signed and tagged
  it, and not while `DEPLOY_PRODUCTION` is `false` unless run by hand, as for `Web deploy`.

Nothing here reaches the server. Its deployer (`deploy/deployer.sh`, run by cron every 5 minutes;
[`api-servers.md`](api-servers.md)) sees a tag move and swaps the image in, keeping the old one if the new one
doesn't come up, within 5 minutes of the tag moving. The workflow doesn't wait for that: Bot
Fight Mode on the zone challenges CI runners asking the service, and the website's Worker when a
runner sets it off, so nothing in CI can see which build runs. The server's journal says, and so
does Slack once the deployer has a webhook ([`deployer-alerts.md`](deployer-alerts.md)). With
`DEPLOY_PRODUCTION` set to `false`, nothing moves `:production` before a person has checked
staging. The jobs that push or move tags have `packages: write`. The
image's reference reaches each step's shell through `env:`, never inside `run:`, since a
rollback's comes from an image the run pulled. The whole deploy is in
[`dictionary-api.md`](dictionary-api.md), How a deploy works.

## Account API deploy

`.github/workflows/account-api-deploy.yml` ships the account service's Docker image
(`apps/account-api/Dockerfile`, ADR 0013) as `Dictionary API deploy` ships the dictionary
service's, with the same three jobs, the same secret `npmrc` for the build's install, the same
signing, the same `staging` and `production` environments, and the same rollback by `tag`. It
runs on a push to `main` that changes what the image holds: the service, what the services share,
and the package files it installs from (the root ones). Tests, the username cases they read
(`apps/account-api/src/domain/username-cases.json`), and the backups script
(`apps/account-api/deploy/`) aren't in the image, so they don't start it.

Its `image` job starts the image beside a Postgres 18 service container, on the runner's network,
with a read-only file system as the server runs it. It checks that the image migrates the empty
database, that `/healthz` names this commit's release, that `/v1/health` answers
`{"status":"ok"}`, and that `/v1/auth/jwks` publishes a signing key. The image runs with CI-only
values for its required settings (`ACCOUNT_API_URL`, `ACCOUNT_API_SECRET`), and no sign-in
method on. The `staging` job signs with this workflow's identity,
`.github/workflows/account-api-deploy.yml@refs/heads/main`, which the deployer requires of the
account service's images. The first push creates the image's package in the organization,
private ([`api-servers.md`](api-servers.md), Set up the server). Until the server is set up for
the account service, the deployer skips it, so the tags move and nothing runs. The whole deploy is
in [`account-api.md`](account-api.md), How a deploy works.

## Language data release

`.github/workflows/language-data-release.yml` publishes the release `language-data/release.json`
names to the `zenbujapanese-language-data` R2 bucket (issue 828, step 3). It runs on a push to
`main` that changes any input of a release (the same inputs as the build, which the same tests
check), so changed content can't sit unpublished: it publishes, or fails until `release.json` is
bumped. It also runs by hand. One publish runs at a time, and none is cancelled halfway.

Its one job runs in the `language-data-release` environment, which deploys only from `main` and
has no required reviewer, by the owner's decision (add one in Settings → Environments to review
each release by hand). It:

1. checks that the environment has the R2 token's two secrets and the `CLOUDFLARE_ACCOUNT_ID`
   variable, before the 516 MiB build, so a missing one fails in seconds, by name;
2. rebuilds the release from this commit with the shared action, which fails unless it is the
   pinned release;
3. publishes (`language-data/pipeline/publish.py`), which refuses a staged release that isn't its
   pin, then verifies: reads `releases.json` and the manifest back, checks the manifest against
   the pin, and downloads and hashes every file. Both write to the job summary.

`AWS_REQUEST_CHECKSUM_CALCULATION` and `AWS_RESPONSE_CHECKSUM_VALIDATION` are `WHEN_REQUIRED` so
the AWS CLI sends only the checksum the publisher gives (SHA-256, in `object_store.py`), not its
default CRC trailers.
This is the only workflow with the bucket's token, so every action its job runs, the shared
action's included, is pinned by commit SHA (see Pinned actions). What a publish writes, and why
nothing published is overwritten, is in
[`language-data/publishing.md`](../../language-data/publishing.md).

## The package-language-data action

`.github/actions/package-language-data/action.yml` is shared by both language-data workflows, and
needs a checkout. It:

1. sets up the Python `.python-version` names, installs `language-data/pipeline/requirements.txt` with
   `--require-hashes`, and runs the pipeline's tests;
2. lists the Git LFS files the release holds (`language-data/pipeline/package.py lfs-paths`),
   restores them from the cache, and pulls only those;
3. packages the release into its `out` input (`package.py build`), then validates the manifest and
   the staged files, and checks that it is the release `language-data/releases/` pins
   (`package.py check-pin --built`).

- The list is taken on its own line, so a failure stops the step, and checked not to be empty: an
  empty `--include` would pull every Git LFS file in the repository.
- The cache key hashes the files' pointers, which are in the checkout until the pull, so it's
  their oids. A restored object can't change a release: the build checks every file against its
  pointer's oid.
- Its steps name `shell: bash`, which runs with pipefail, so piping the build into `tee` doesn't
  hide a refusal.

## Pinned actions

A workflow that reads a secret runs every action at a pinned commit. A tag such as `@v5` can be
moved to new code, which would then run with the bucket's token, the registry's, Cloudflare's, or
Claude's. Those are the release workflow, the three deploy workflows, and the three that run
Claude; a workflow with no secret names its actions by major-version tag.
`tools/checks/src/workflow-rules.test.ts` holds the pins, and this table, to that.

- `anthropics/claude-code-action` is at v1.0.247. It was pinned there because v1.0.248 seemed to
  fail every run, but a revoked `CLAUDE_CODE_OAUTH_TOKEN` failed them, and v1.0.247 failed the
  same way ([`ci-agents.md`](ci-agents.md), Claude's app and token). A review ran with the token
  again on 2026-10-11, so nothing waits on it now; moving the pin to the latest release is in
  [`harness-debt.md`](../harness-debt.md).
- `pnpm/action-setup` is at v6.0.10, the commit its `v6` tag named when it was pinned.

To update one, pin the new release's commit and change this table in the same pull request.

| Action | Commit | Version | Used in |
| --- | --- | --- | --- |
| `actions/checkout` | `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09` | v5.1.0 | `.github/workflows/account-api-deploy.yml`, `.github/workflows/claude.yml`, `.github/workflows/code-review.yml`, `.github/workflows/dictionary-api-deploy.yml`, `.github/workflows/language-data-release.yml`, `.github/workflows/maintenance.yml`, `.github/workflows/web-deploy.yml` |
| `actions/setup-node` | `a0853c24544627f65ddf259abe73b1d18a591444` | v5.0.0 | `.github/workflows/claude.yml`, `.github/workflows/maintenance.yml`, `.github/workflows/web-deploy.yml` |
| `pnpm/action-setup` | `0977fd99725f1db4007ccb2928dbb4e90d06cc86` | v6.0.10 | `.github/workflows/claude.yml`, `.github/workflows/maintenance.yml`, `.github/workflows/web-deploy.yml` |
| `actions/upload-artifact` | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | v7.0.2 | `.github/workflows/claude.yml`, `.github/workflows/code-review.yml`, `.github/workflows/maintenance.yml` |
| `actions/cache` | `caa296126883cff596d87d8935842f9db880ef25` | v5.1.0 | `.github/workflows/dictionary-api-deploy.yml`, `.github/actions/package-language-data/action.yml` |
| `actions/setup-python` | `ece7cb06caefa5fff74198d8649806c4678c61a1` | v6.3.0 | `.github/actions/package-language-data/action.yml` |
| `docker/setup-buildx-action` | `f87e5991a6d7451dcb8d9637bfbc97413f497069` | v4.4.1 | `.github/workflows/account-api-deploy.yml`, `.github/workflows/dictionary-api-deploy.yml` |
| `docker/build-push-action` | `c3c9e263c25d99ce0380d002d59b67737d91b0dc` | v7.4.0 | `.github/workflows/account-api-deploy.yml`, `.github/workflows/dictionary-api-deploy.yml` |
| `docker/login-action` | `dbcb813823bdd20940b903addbd779551569679f` | v4.6.0 | `.github/workflows/account-api-deploy.yml`, `.github/workflows/dictionary-api-deploy.yml`, `.github/workflows/web-deploy.yml` |
| `sigstore/cosign-installer` | `6f9f17788090df1f26f669e9d70d6ae9567deba6` | v4.1.2, installing cosign v3.1.3 | `.github/workflows/account-api-deploy.yml`, `.github/workflows/dictionary-api-deploy.yml` |
| `anthropics/claude-code-action` | `2dca132ff0e0c4094ce6048b422c6915a071210b` | v1.0.247 | `.github/workflows/claude.yml`, `.github/workflows/code-review.yml`, `.github/workflows/maintenance.yml` |
