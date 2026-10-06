---
status: accepted
---

# Serve the website's dictionary from a service running the shared core

The website's dictionary pages get their data from a Node service, `apps/dictionary-api/`, that
runs the shared TypeScript core (`packages/dictionary-core/`) against the language-data artifact
the app bundles. The service supplies every capability the core has: Sudachi for sentence search,
the app's Kuromoji for text analysis at request time, and the full example-sentence indexes. The
website stays on Cloudflare Workers and calls the service; for now, only the website may.
([ADR 0012](0012-let-signed-in-apps-fetch-word-cards-from-the-dictionary-service.md) lets signed-in apps call its word-card and segmentation routes too.) The
service ships as one Docker image holding a pinned artifact version, so it runs on a VM, bare
metal, or Cloudflare Containers; the host is chosen separately.

## Why

A Worker has 128 MB of memory and D1, which has no FTS4, runs one query at a time per database, and
takes imports as SQL files under 100 MB. So the website imported a projection of the artifact into
release D1 databases, translated the app's FTS4 queries to FTS5, precomputed broad queries and
every word's examples, and left out what needs more: sentence search (Sudachi's dictionary is
217 MB), the app's example search over all Tatoeba pairs (FTS4 Porter), and a conjugated form's
examples (text analysis at request time). A process beside the artifact runs the app's own
queries on the app's own file, so none of that is needed.

## The core

There is still one TypeScript core, and every client runs it: the website through this service,
and later the browser extension and the apps, offline, against the same artifact (ADR 0006, issue
481). The core queries the artifact's schema directly (its FTS4 indexes and binary IDs), holds no
Node, Next.js, or Workers code, and takes its database, files, and capabilities from the client.
A client without a capability has that feature off, as ADR 0008 decided.

The JavaScript apps and packages share one pnpm workspace at the repository root, so the website's
bundler and OpenNext build the core in, and one lockfile pins what they share. Each app still owns
its build, tests, and deploys (ADR 0005); the iOS app keeps its own toolchain.

## What this changes

- **ADR 0007:** the website no longer reads its own D1 copy of the artifact. It reads the
  service, which reads one pinned artifact version. The website is still a publisher and not a
  lookup service: no app queries it, and apps keep working offline (ADR 0006). URLs don't change.
  A word's slug comes from the shared core (`wordSlug`), which every client runs, rather than
  from the artifact, so the app's share links and the website still build the same URL.
- **ADR 0008:** the core is no longer built for the website as the most constrained client. It
  still has to run on the constrained ones (the extension, and the app's JavaScriptCore), and
  what they can't run stays a capability. The website gets sentence search.

## Costs

- A service to run: deploys, uptime, and a host. Every dictionary page depends on it, so the
  Worker keeps its answers in the edge cache, and the website can't deploy an environment until
  that environment's service answers.
- Node's SQLite is synchronous, and the broadest queries (い) take one to two seconds the first
  time, so the service runs the core in worker threads and caches recent results.
- The Worker's requests to the service add a round trip to wherever the service runs.

This decision refines ADR 0006 and changes parts of ADR 0007 and ADR 0008, as listed above. The
owner approved the service route on 2026-09-29 (PR #532), which removed the D1 route: the release
databases, their imports and workflows, and everything they precomputed.
