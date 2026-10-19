# Speed

How zenbujapanese.com keeps its pages fast for readers and crawlers. A page renders on the
Worker, and a word, search, or browse page waits on the dictionary service while it does, which
took 0.8 s at the median and 2.8 s at the 99th percentile on production in October 2026 (#873).
So each rendered page is kept at Cloudflare's edge and answered from there the next time.

Abbreviations: Web paths are under `apps/web/`. **Page cache spec** is `e2e/page-cache.spec.ts`, a
browser test on the production build; `next dev` doesn't run `worker.ts`, so it keeps nothing.

## The page cache

**A page is kept at the edge after it renders.** `worker.ts` answers a GET for a page from the
Worker's edge cache (the Cache API, in the Cloudflare data center that took the request) when it
has it, and keeps each page it renders. A kept page answers in milliseconds, without the
dictionary service. The `X-Page-Cache` header says how a page was answered: `MISS` (rendered
now), `HIT`, or `STALE`.

- Source: #873 (Ahrefs' slow-page and slow-for-AI-crawlers issues, #871 F1).
- Check: `src/lib/page-cache.test.ts`, "renders a page once, then answers the next request from the
  edge"; Page cache spec, "a word page asked for again comes from the edge, as the browser was first
  sent it".

**Fresh for 10 minutes, then served stale while it renders again.** A kept page is fresh for 10
minutes, as long as the site keeps the service's answers, so a new dictionary build shows within
that. After that it is still answered at once (`STALE`) for up to 7 days, while the Worker renders
it again for the next request. A list that loads more from an older build offers a reload, which
gets the new page (Dictionary, Word page).

- Source: #873.
- Check: `src/lib/page-cache.test.ts`, "keeps a page for its fresh time and the stale time after
  it" and "answers a page past its fresh time at once, and renders it again for the next request".

**Each deploy starts its own cache.** The cache's key names the deployed Worker version
(`CF_VERSION_METADATA`), so a page never names the scripts and styles of an earlier deploy, which
are gone. The first request for each page after a deploy renders it.

- Source: #873.
- Check: `src/lib/page-cache.test.ts`, "doesn't read a copy another deploy kept, whose page names
  that deploy's scripts".

**Only whole pages are kept.** A page is kept only when it answers 200 with HTML, sets no cookie,
and rendered on the server in full: never Next.js' fallback that renders in the browser (`<html
id="__next_error__">`), which Ahrefs once read as twelve word pages with no heading and no links
(#871 F8), nor a page that lost a part to an error. Missing pages, failures, and redirects are
never kept, so an outage is never served later.

- Source: #873; #871 F8.
- Check: `src/lib/page-cache.test.ts`, "doesn't keep a missing page", "… a failure", "… a page that
  sets a cookie", "doesn't keep a page whose server render fell back to rendering in the browser, so
  the next request renders it again", and "keeps a page with a part Next.js renders only in the
  browser by design".

**What is never kept.** The account pages (`/login/`, `/register/`, `/forgot-password/`,
`/account/`, and their Japanese pages), navigations inside the site (requests with Next.js' `RSC`
header or `_rsc` parameter, which answer data rather than HTML), files, and anything but GET.

- Source: #873.
- Check: `src/lib/page-cache.test.ts`, "leaves a sign-in page to the page itself" and the other
  "leaves …" cases; Page cache spec, "an account page is never kept" and "a navigation inside the
  site is left to Next.js".

**The browser is told what the page said.** A kept page answers with the `Cache-Control` it was
rendered with, so browsers keep pages no longer than before; the cache's own headers never leave
the Worker.

- Source: #873.
- Check: `src/lib/page-cache.test.ts`, "sends the browser the Cache-Control the page was rendered
  with, and no internal header".

**Staging still asks for its password first.** The cache sits behind staging's password and its
`noindex`, and the moved and retired-word redirects, which answer before it. On a workers.dev
address the Cache API keeps nothing, so the smoke tests there always render.

- Source: [`staging-access.md`](../../../../docs/agents/staging-access.md); #873.
- Check: `src/lib/staging-access.test.ts`.
