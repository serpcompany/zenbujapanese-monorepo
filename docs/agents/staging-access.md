# Staging's password

staging.zenbujapanese.com follows SERP's
[Staging Access](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/staging-access.md)
standard (#788). It asks for HTTP Basic auth, so it can describe itself as production will,
indexable to a site audit such as Ahrefs, while search engines and the public stay out. Its content
is the public site's, so the password isn't a secret.

## The gate

- **Where.** `behindStagingAccess` (`apps/web/src/lib/staging-access.ts`) runs from
  `apps/web/worker.ts` on staging alone (`SITE_ENV=staging`), after the Apple association file and
  the canonical-host redirect, and before everything else the Worker answers: moved pages, retired
  words, and OpenNext with its caches. The account and dictionary services, on
  `api-staging.zenbujapanese.com` and `api.zenbujapanese.com`, sit outside it: the apps and the
  website's Worker call them directly.
- **The password** is SERP's shared, public `stagingpassword`, the plain var
  `STAGING_BASIC_AUTH_PASSWORD` in `env.staging.vars` of `apps/web/wrangler.jsonc`, never a secret.
  Only the password is checked; any username works. Without the var, every request but the
  exemptions below is refused.
  Both values are hashed with SHA-256 and the digests compared with `node:crypto`'s
  `timingSafeEqual`, so the time taken says nothing about the password.
- **The 401** carries `WWW-Authenticate: Basic realm="zenbujapanese staging", charset="UTF-8"`,
  `Cache-Control: no-store`, and `X-Robots-Tag: noindex, nofollow`.
- **A request that passes** goes on without its `Authorization` header, so a cache added later
  would keep it like an anonymous one, and gets no environment `noindex`. A page that production also noindexes, such
  as a search that finds nothing, keeps its own tag.

## Served without the password

Each is served with `X-Robots-Tag: noindex, nofollow`, added after the page is built:

- `GET` and `HEAD` `/robots.txt`, so a crawler that reaches staging still reads its disallow;
- a request with the smoke-test header (`x-zenbu-smoke-test`, `src/lib/other-hosts.ts`) and no
  `Authorization`. A smoke-header request with a password is checked, so CI can prove through the
  workers.dev URL that a wrong password gets the 401 and the right one passes;
- `/.well-known/apple-app-site-association`, which `worker.ts` answers before the gate, as on
  every host. No app claims staging's links today (the app's entitlements name
  `zenbujapanese.com` alone), so this keeps staging's file as production's would be, for a check
  of it or an app that claims staging later.

The site has no webhooks. The static files Cloudflare serves from the build's assets
(`/_next/static/`, and `apps/web/public/`, such as the favicon and `site.webmanifest`) never reach
the Worker, so they need no password and carry no `noindex`. They're files, not pages, and a
browser fetches the manifest without credentials, so gating them would break it.

## Where this differs from the standard

- **The Apple association file** is an exemption of Zenbu's own, beyond the standard's list.
- **The comparison** uses `node:crypto`'s `timingSafeEqual`, where the standard names
  `crypto.subtle.timingSafeEqual`; the two do the same.
- **Local runs have no gate.** The standard has them set their own password in `.dev.vars`; here
  the gate runs only where `SITE_ENV` is `staging`, so `pnpm preview` and the browser tests, which
  run without `SITE_ENV`, serve as before. A staging Worker deployed without its `SITE_ENV` would
  serve without the gate; `env.staging.vars` sets it.
- **CI rarely reaches the canonical host.** The zone's Bot Fight Mode blocks CI runners there, so
  the smoke test checks the gate through workers.dev with the smoke-test header. Its check that a
  request with no password at all gets the 401 on `staging.zenbujapanese.com` is reported as
  skipped, with a warning, when the runner is blocked.

## Indexing

Staging's `robots.txt` (`src/lib/robots.ts`) disallows every crawler but `AhrefsSiteAudit`, which
gets production's rules, and names staging's own `/sitemap-index.xml`. Staging writes its own host
in canonicals, Open Graph URLs, structured data, and sitemaps ([`web.md`](web.md), Environment
configuration). A local build still sends `X-Robots-Tag: noindex` on every page, from
`next.config.ts`.

If the site ever turns on OpenNext's incremental cache and its revalidation queue, the queue asks
the Worker itself, through `WORKER_SELF_REFERENCE`, with no password and no smoke-test header, and
on staging would get the 401: give those requests a way through first.

## People and auditors

A browser asks for the password once per session, then sends it with every request to that host,
including when a Google sign-in returns to the site. A site audit puts `stagingpassword` in its
crawl settings. An agent checking staging in a browser gives any username and `stagingpassword`
([`verify-web`](../../.claude/skills/verify-web/SKILL.md)).

## Checks

- `apps/web/src/lib/staging-access.test.ts`: the 401 and its headers, a wrong or missing password,
  any username, a missing var, the exemptions, and which responses get `noindex`.
- `apps/web/src/lib/robots.test.ts`: staging's `robots.txt`.
- `apps/web/scripts/smoke-indexing.sh`, from `scripts/smoke.sh` on every deploy. Through the
  workers.dev URL with the smoke-test header: a wrong password gets the 401 and its challenge; the
  right one gets 200, the staging canonical, and no `noindex`; the header alone gets `noindex`;
  `robots.txt`, and the Apple association file with `noindex`, answer with a wrong password. On
  the canonical host: a request with no password gets the 401, or the check is reported as
  skipped when Bot Fight Mode blocks the machine. On production: a wrong password still gets 200 and no
  `WWW-Authenticate`.
- Nothing runs `worker.ts` on staging's settings before merge: the browser tests run the build
  without `SITE_ENV`. The smoke test after each deploy is the first check of the Worker's order.
