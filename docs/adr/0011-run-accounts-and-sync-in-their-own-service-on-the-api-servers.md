---
status: accepted
---

# Run accounts and sync in their own service on the API servers

Zenbu accounts, sign-in, and sync run in `apps/account-api/`, a Node service beside the
dictionary service on the API servers, with its own Postgres database there. Clients reach
account data only through its `/v1` API, the one
[issue 374](https://github.com/serpcompany/zenbujapanese-monorepo/issues/374) specifies:
`/v1/health`, `/v1/me`, and `/v1/sync`. Only the service reaches Postgres. Every Zenbu app stays
local-first: an app without a connection or an account loses sign-in and sync, never a local
feature.

The service ships as a signed Docker image and deploys the way the dictionary service does: two
slots per environment behind nginx, and the deployer on the server
([`dictionary-api.md`](../agents/dictionary-api.md#ship-it)). It is a host on
`zenbujapanese.com`, through Cloudflare: `account-api.zenbujapanese.com`, and
`account-api-staging.zenbujapanese.com` for staging
([issue 565](https://github.com/serpcompany/zenbujapanese-monorepo/issues/565)).

## Sign-in

Sign-in runs on Better Auth, as serplists' does, with Sign in with Apple, Google, and a one-time
code sent by email. App Review guideline 4.8 requires an app that offers Google to also offer a
login that limits data to a name and email and lets the learner hide their email; Sign in with
Apple is that login. Passkeys can come later.

Issue 374's identity rules stand:

- The Zenbu user ID is the identity.
- An Apple, Google, or email identity is a row in `user_identities`, unique by provider and
  subject.
- One email never makes two accounts, and accounts are never merged by email: a second method
  with the same email has to sign in to the first account before it's linked.
- There is no production bypass.

Apps get a short-lived access token, which other services verify through the account service's
JWKS, and a refresh token. The website uses a cookie session on `zenbujapanese.com`
([issue 566](https://github.com/serpcompany/zenbujapanese-monorepo/issues/566)).

The codes are emailed as SERP's
[transactional email standard](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/transactional-email.md)
says, from `Zenbu Japanese <support@zenbujapanese.com>`, an address that receives mail and is
monitored, through Cloudflare Email Service. The standard sends from a Worker binding, which the
API servers don't have, so the service calls Email Service's REST API with a token that can only
send. That token can't restrict the sender or the recipients the way the binding does, so the
service checks both itself. The rest of the standard holds, including:

- the same fail-closed order: send, or else capture in a dev mailbox that answers only locally, or
  else send nothing;
- no `Reply-To` other than the sender;
- staging sends only to test recipients;
- nothing logs a recipient, a code, or a link.

The sender sits behind one function, so moving to useSend is a configuration change.

## Why

- **One backend stack.** The dictionary service already runs on the API servers, with its image,
  signing, slots, and deployer. A second service reuses all of them, where Workers would add D1,
  Wrangler migrations, and a second way to deploy.
- **D1's limits.** A D1 database holds at most 10 GB and runs one query at a time. Sync for every
  learner in one database would have to be split across databases past about 10,000 active
  learners. Postgres has neither limit at Zenbu's scale.
- **Lookups beside accounts.** Signed-in apps fetch from the dictionary service
  ([ADR 0012](0012-let-signed-in-apps-fetch-word-cards-from-the-dictionary-service.md)), which
  verifies their tokens through this service's JWKS. Both run on the same servers.

Cost didn't decide it. Sync is light: an active learner reads about 1,000 rows and writes about
350 a day, which D1 would also have carried cheaply.

## Costs

- **A database to run.** Each migration keeps the deployed code working: add first, and remove
  in a later release, as issue 374's planning notes of 2026-09-28 say. Backups leave the server
  nightly, and a restore is tried before launch (issue 565).
- **A way out to the internet.** The service fetches Apple's and Google's signing keys and calls
  Email Service, so its slots can't be as closed as the dictionary service's, which reach only
  nginx.
- **Bot Fight Mode.** It's on for the zone, can't be skipped on the free plan, and "may challenge
  API or mobile app traffic". It stays on until it actually blocks an app, and then the owners turn
  it off. The first request from the iOS app to staging checks this.
- **One server today.** Staging and production run on the same server as the dictionary service,
  so sign-in and sync wait while it's down. The apps keep working, since they're local-first.

## What this changes

- **Issue 374:** its Cloudflare Workers and D1 contract is superseded: Workers, D1, Wrangler
  migrations and configuration, D1 consistency, Workers-native test tooling, and the `backend/api`
  and `backend/db` paths. The service sits under `apps/`, as
  [ADR 0005](0005-keep-a-lightweight-product-family-monorepo.md) places every delivery surface.
  Its account model, authentication boundary, `/v1` API, sync protocol, client policy, and
  required test coverage stand.
- **[ADR 0006](0006-share-language-data-as-a-versioned-artifact.md):** it left the sync backend
  open; this is it.
- **[ADR 0007](0007-publish-the-dictionary-at-permanent-urls-from-the-websites-copy.md):** "the
  backend" that holds accounts and learner data behind `/v1` is this service.
- **The website:** it stopped using D1 on 2026-10-05, and its account pages
  ([issue 468](https://github.com/serpcompany/zenbujapanese-monorepo/issues/468)) use this
  service.

The owners decided this on 2026-10-06, on
[issue 563](https://github.com/serpcompany/zenbujapanese-monorepo/issues/563) (decisions 1 to 3)
and [issue 477](https://github.com/serpcompany/zenbujapanese-monorepo/issues/477). Issues 565 and
566, which build it, hold the details above that the decisions leave to them. This decision amends
ADR 0006 and ADR 0007.
