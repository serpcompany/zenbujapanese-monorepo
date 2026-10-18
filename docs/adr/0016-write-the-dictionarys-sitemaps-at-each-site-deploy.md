---
status: accepted
---

# Write the dictionary's sitemaps at each site deploy

zenbujapanese.com's dictionary sitemaps are static files. Each site deploy writes them from the
dictionary build its environment runs, and Cloudflare serves them from the site's static assets.
No crawler request reaches the dictionary service. This amends ADR 0009, whose site "precomputes
nothing", for sitemaps only: every page still reads the service per request.

## Context

Until #805 the Worker built each dictionary sitemap per request: `/sitemap-index.xml` asked the
service which word sitemaps there were, and each word sitemap streamed its 50,000 URLs from the
service, 10,000 at a time. Search Console then reported that it couldn't read the index (a 500),
and every verified search-engine crawler's fetch of a word sitemap over the week before got a
500. The zone's Bot Fight Mode Managed-Challenges the Worker's requests to
`dictionary-api.zenbujapanese.com`, which come from Cloudflare's shared Workers address with no
user agent, and the free plan can't skip it with a rule. Even when it answered, a word sitemap
took 4 to 7 seconds to build its 5 MB, and the Worker's cache is per data center and lasts 10
minutes, so a crawler rarely found one cached.

A dictionary sitemap changes only when the dictionary build does: its URLs come from the artifact
and the site's URL rules, both fixed for a deploy.

## Decision

- **The site's deploy writes the files.** Before it builds, each environment's deploy job runs
  that environment's service image (`:staging` or `:production`, the tag the server runs) on the
  CI runner, with a token made for the run, and `pnpm sitemaps` writes the word and browse
  sitemaps into `apps/web/public/` on the environment's canonical host. The request goes to
  `127.0.0.1`, so nothing between them can challenge it. A deploy that can't write them fails.
- **Static assets, not object storage.** The files ship with the deploy they were written for,
  so the site and its sitemaps never disagree, and Cloudflare serves them without running the
  Worker. A bucket would have needed its own token in CI, a key for each build, and a pointer to
  the live one.
- **The index stays a route, and asks no one.** The build lists the files it finds in `public/`
  into the index (`writtenDictionarySitemaps`, through `next.config.ts`), and the route writes them
  after the pages and tools sitemaps, on the origin the site is served at, as before. A local build
  has no such files, so its index lists the pages and tools sitemaps alone.
- **A new dictionary build redeploys the site.** `Web deploy` also runs on a push that changes
  what the service's image holds, after it waits for that commit's service deploy, so the files
  follow each build.

## Consequences

- **Search engines read sitemaps whatever the service or Bot Fight Mode is doing.** The smoke test
  checks them even when Cloudflare challenges the runner.
- **A sitemap can lead its build by a few minutes.** The server pulls a new image on its own
  schedule after its tag moves, while the deploy writes from the tagged image at once, so a new
  word's URL can be listed briefly before its page answers. Word URLs are permanent (ADR 0007),
  and a retired one redirects or answers 410.
- **A service rollback leaves the newer sitemaps** until the site deploys again. Run `Web deploy`
  by hand after one.
- **Each deploy pulls the service image** (about half a gigabyte) and starts it, adding about a
  minute.
- **Staging's sitemap files answer without its password**, as its other static files do; they
  list only URLs that ask for it.
