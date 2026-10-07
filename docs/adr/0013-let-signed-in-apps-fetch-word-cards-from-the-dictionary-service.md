---
status: accepted
---

# Let signed-in apps fetch word cards from the dictionary service

An app that bundles the language data, such as the iOS app, keeps querying it on the device,
offline ([ADR 0006](0006-share-language-data-as-a-versioned-artifact.md)). An app that doesn't,
such as Tomodachi, gets the dictionary in two ways: it ships baked cards, and it fetches from the
dictionary service when the learner is signed in.

- **Bake.** It ships a word card for every word its own content teaches, exported from the
  language data by the shared core when the app is built
  ([issue 569](https://github.com/serpcompany/zenbujapanese-monorepo/issues/569)). The cards work
  offline and with no account. Each export records the language data's version and SHA-256, and
  carries its sources' notices.
- **Fetch.** When the learner is signed in, it may fetch the cards for the words in a linked Zenbu
  list, and send a learner's short answer to be split into words. It caches what it gets
  ([issue 571](https://github.com/serpcompany/zenbujapanese-monorepo/issues/571)).

The word-card and segmentation routes are the only ones an app may call. The service accepts the
app's access token, verified through the account service's JWKS, with a dictionary scope
([issue 570](https://github.com/serpcompany/zenbujapanese-monorepo/issues/570),
[ADR 0012](0012-run-accounts-and-sync-in-their-own-service-on-the-api-servers.md)). No app ever
holds the website's service token. Each answer names the language data's version, so a cache knows
when to fetch again.

## Why

- **The data is too big for a companion app.** The bundled language data is about 480 MB, too big
  for Tomodachi to bundle
  ([tomo-app#28](https://github.com/serpcompany/zenbujapanese-tomo-app/issues/28)).
- **Its own content needs no account.** Baked cards keep Tomodachi's own content offline and free
  of an account.
- **Each account can be limited.** Fetching only for signed-in learners lets the service limit
  each account (issue 571), rather than serve anyone who asks.

## Costs

- **A connection, the first time.** A fetched word needs one when it's first shown; the cache
  covers it after.
- **A second kind of caller.** The service gets batch-size, text-length, and per-account rate
  limits.
- **Bot Fight Mode.** It may challenge an app's requests to the dictionary service, as it may the
  account service's (ADR 0012).
- **A second output to keep stable.** Word cards are a versioned format, checked against what the
  word-detail suite records.

## What this changes

- **ADR 0006:** "no client sends dictionary lookups to a server" still holds for every app that
  bundles the data. A signed-in app without it may fetch cards and segmentation. Offline, it has
  its baked cards and its cache.
- **[ADR 0007](0007-publish-the-dictionary-at-permanent-urls-from-the-websites-copy.md):** "the
  apps still don't" send lookups to a server no longer holds for these apps. The website is still
  a publisher that no app queries.
- **[ADR 0009](0009-serve-the-websites-dictionary-from-a-service-running-the-shared-core.md):**
  the website is no longer the only client of the dictionary service. Signed-in apps may call
  these routes too, each with its own token.

The owners decided this on 2026-10-06, on
[issue 563](https://github.com/serpcompany/zenbujapanese-monorepo/issues/563) (decision 5). Issue
571 settles that segmentation, too, needs the learner signed in. This decision amends ADR 0006,
ADR 0007, and ADR 0009.
