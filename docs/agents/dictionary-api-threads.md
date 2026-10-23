# Dictionary service threads

How the website's dictionary service ([`dictionary-api.md`](dictionary-api.md)) runs: its main
thread, its worker threads and their caches, which thread answers a call, the browse index, and how
long a broad query takes.

## The main thread

The main thread hashes the artifact and Sudachi's dictionary once, refuses to start unless the files
a word card is read from are the pinned language-data release's, checks Sudachi's pins, and serves
HTTP (Hono on Node's HTTP server). Sudachi's native module reads its configuration from the
process's environment, which only the main thread can set, so the main thread sets it
(`prepareSudachi`) before any worker thread starts.

## Worker threads

Worker threads each open the artifact read-only, checking it, its packs, and the tokenizer's pinned
files as they load, and answer calls one at a time: SQLite is synchronous, so a slow query holds
only its own thread. A thread that dies is replaced. Each thread keeps recent searches, word
examples, a query's examples, a form's examples, kanji details, and word lookups in LRU caches, so a
page's first request pays for a broad query and the rest don't. The website's edge cache keeps
answers for 10 minutes on top.

## Which thread answers

`apps/dictionary-api/src/pool.ts` hands each call to a thread, and each thread says with its answer
how long it worked on it. A request for a query (its search and its examples), a word (its page
and its examples), a form's examples, or a kanji reads what the thread that answered that query,
word, form, or kanji before has in its caches: the answer, or the work it was built from, such as a
query's ranked sentences. So it goes back to that thread when the thread is as free as any, and
also while it's busy when computing it again would cost more than waiting: when that thread is
still computing it, or took at least 250 ms over it, as `t*`'s examples (about 4 seconds) or い's
search (about 1) take. One that took less, such as a kanji's details, goes to the thread with the
fewest calls in flight, as the first request for one and every other call do. A query is matched in
its normal form (`normalizeQuery`), as the caches keep it. The pool remembers the thread, and the
longest a call for it took there, of up to 10,000 of them per thread, more than a thread's caches
hold, and forgets the longest unused first. What a thread computed is forgotten when it exits, since
its replacement starts with empty caches, and a call that failed doesn't hold its key there: the
next request for it goes to the thread with the fewest calls in flight (`pool.test.ts`).

No call asks a thread for the build: each thread sends its build, artifact, language data, and
features with the message that says it has loaded, and the pool answers `/healthz`, `/v1/info`, and
the build each answer names (`X-Dictionary-Build`, and an app route's `ETag`) from the first.

## The browse index

The browse routes don't scan the artifact for a request: before a thread reports ready, it builds
the browse index (`packages/dictionary-core/src/artifact/browse-index.ts`) in a few passes, every
word in kana order by its first two kana and every category's words in both its orders, keeps the
totals, the category counts, the kanji and ranked lists' summaries and counts, every kanji list,
and the browse sitemaps' answer, and runs each statement a browse page asks once
(`DictionaryBrowse.warm`). A browse page then reads only its own words, with statements already
prepared. The index holds about 960,000 row IDs, the categories' as 32-bit arrays. On 2026-10-07,
with two threads on this workstation (load average 5 over the last minute, falling from 180 over
fifteen), each thread was ready about 9.4 seconds after it started, and every browse route's first
request took at most 28 ms (a JLPT level's first page); before the index, the totals took 1 second
and the category counts 2. Warming adds about 250 MB to a thread's resident memory, nearly all of
it SQLite's cache of the pages it read; the index itself is under 10 MB of JavaScript heap.

## Broad queries

A broad query takes one to two seconds the first time: い reads 73,000 entries with the app's own
SQL, and "to" matches 50,000 Tatoeba pairs. A one-letter wildcard's examples take longer: `a*`,
`s*`, and `t*` take 3.5 to 5 seconds, `t*` matching over 100,000 pairs, which the app ranks in
full. Grapheme counts and string comparisons take exact fast paths
(`packages/dictionary-core/src/detail/text.ts`, `packages/dictionary-core/src/search/query.ts`);
what remains is the app's SQL.
