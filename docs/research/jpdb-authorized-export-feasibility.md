# JPDB authorized export feasibility

Research date: 2026-09-25

Scope: public first-party JPDB materials only. No authentication, API requests, or scraping were performed. This is a product/engineering assessment, not legal advice.

## Current decision

On 2026-09-25, the user explicitly stated that they own JPDB and authorized
automated acquisition of its public surfaces for this task. That owner
authorization supersedes the public scraping restriction for the scoped
internal acquisition, but it does not authorize access-control bypass, private
user-data collection, or app redistribution. The exact engineering scope is
recorded in
`apps/ios/LanguageData/Sources/JPDB.owner-authorization.json`; redistribution
remains disabled.

The implementation therefore uses public pages only, conservative throttling,
resumable content-addressed storage outside the repository, deterministic
offline normalization, and a separate redistribution gate. A complete run
still requires owner-known expected record counts and seed URLs for any records
that are not reachable from public indexes.

## Public frontend discovery map (2026-09-25)

A bounded browser inspection found no sitemap (`/sitemap.xml` returns 404), no
embedded JSON inventory, and no background XHR/fetch inventory on the examined
server-rendered pages. `robots.txt` permits the inspected public routes for the
default user agent and disallows `/prebuilt_decks`.

The homepage links five exhaustive-looking difficulty indexes. Their first
pages reported 1,399 anime, 1,518 novels, 529 visual novels, 1,053 web novels,
and 1,273 live-action entries. Each index exposes 50 rows per page and an
ordinary `offset` next link; the inspected final anime page reported
`Showing 1351..1399 from 1399 entries` and had no next link. Canonical links
retain the page offset.

Each inspected media page linked an aggregate vocabulary list plus its public
subdeck lists. Each vocabulary list likewise reported `Showing A..B from N
entries`, exposed concrete `/vocabulary/<id>/...` links, and used ordinary
offset pagination. The sample media list reported 2,272 unique vocabulary
entries. These pages were server-rendered and contained no application/JSON
scripts or background inventory request.

Vocabulary pages expose related vocabulary but do not enumerate all dictionary
entries or link their constituent kanji. Kanji search resolves a supplied
character to a canonical `/kanji/<character>` page; kanji pages link components,
related kanji, and example vocabulary, but there is no public browse-all kanji
index. Numeric vocabulary IDs and unlinked kanji therefore cannot be enumerated
from the frontend without guessing. The strongest justified guarantee is full
closure over the five indexed media catalogs and their vocabulary, plus kanji
derived from that vocabulary and recursively linked kanji pages—not the whole
JPDB dictionary.

## Original public-source assessment

No public first-party JPDB source located authorizes the complete automated acquisition or redistribution contemplated by issue #352.

- JPDB's [Terms of use](https://jpdb.io/terms-of-use) expressly treat automated access, including scraping, as abuse that triggers an automatic ban. They also say to contact JPDB before doing something clearly not intended by the service.
- JPDB publishes a bearer-authenticated [public API reference](https://jpdb.stoplight.io/docs/jpdb/mgsimhgxpjpqe-jpdb-io-public-api), but its documented read operations do not provide a complete dictionary/corpus export or a way to enumerate all JPDB vocabulary IDs, kanji, components, examples, media entries, or deck appearances.
- The only first-party export found is a logged-in user's review-history export. JPDB's [changelog](https://jpdb.io/changelog) describes it as “Export vocabulary reviews (.json)” and later says it also includes kanji reviews. That is user study history, not the JPDB dataset.
- No blanket license or redistribution grant for JPDB's compiled/derived data was found. The [About page](https://jpdb.io/about) attributes some constituent data to JMdict/EDICT and KANJIDIC, some definitions to Wiktionary under CC BY-SA, and some examples to Tatoeba under CC BY. It does not grant a license for JPDB-specific frequency ranks, pitch accent data, corpus/media relationships, kanji decomposition/keywords, the full example corpus, or the compiled database as a whole.

Therefore, implementation should be blocked on written authorization from JPDB that defines the permitted acquisition mechanism, fields, volume/rate, storage, derived-database rights, and redistribution/app-distribution rights. The [contact page](https://jpdb.io/contact-us) invites business and other inquiries and lists `jpdb@jpdb.io`.

## Documented API scope

The official Stoplight reference identifies `https://jpdb.io` as the production server and requires the user's API key as a bearer token. The published specification documents 16 paths: ping (GET/POST), parse text, vocabulary lookup, list user decks, list special decks, user-deck create/rename/list-vocabulary/add/remove/clear/delete, set card sentence, add review, and Japanese/English machine translation. These are service and account workflows, not a bulk export API.

The acquisition-relevant operations are:

| Operation | Documented capability | Completeness limitation |
| --- | --- | --- |
| [Parse text](https://jpdb.stoplight.io/docs/jpdb/609bb98ccd378-parse-text) | Tokenizes caller-supplied text and can return matching vocabulary rows. | Caller must supply text; it does not enumerate the database. |
| [Lookup vocabulary](https://jpdb.stoplight.io/docs/jpdb/69c37fdb9f769-lookup-vocabulary) | Returns selected fields for `(vid, sid)` pairs. | The docs explicitly say it is for vocabulary “for which you already have the IDs.” |
| [List user decks](https://jpdb.stoplight.io/docs/jpdb/cfe08d68ca570-list-user-decks) | Lists the authenticated user's decks. | User-scoped, not JPDB's built-in media catalog. |
| [List special decks](https://jpdb.stoplight.io/docs/jpdb/2def3910eb4ad-list-special-decks) | Lists account special decks. | The published schema names `blacklist` and `never-forget`; it is not a global corpus listing. |
| [List deck vocabulary](https://jpdb.stoplight.io/docs/jpdb/19e6647044a9a-list-deck-vocabulary) | Returns vocabulary IDs and optional occurrence counts for an identified user/special deck. | Requires a deck ID and does not document access to built-in media decks. |

JPDB's changelog says the “All vocabulary” special deck is the union of vocabulary in **the user's decks**, not all vocabulary in JPDB. The changelog also records newer public-API additions (for example image/audio upload) that are absent from the exported Stoplight path list, so the published reference may lag the live API; that does not establish a bulk-export capability or permission.

### Documented fields

The API reference documents positional rows whose columns follow the requested field order:

- Token fields: `vocabulary_index`, `position`, `length`, `furigana`; positions/lengths can use `utf8`, `utf16`, or `utf32`.
- Vocabulary fields: `vid`, `sid`, `rid`, `spelling`, `reading`, `frequency_rank`, `meanings`, `card_level`, `card_state`, `due_at`, `alt_sids`, `alt_spellings`, `part_of_speech`, `meanings_part_of_speech`, `meanings_chunks`, `pitch_accent`.
- Deck fields: `id`, `name`, `vocabulary_count`, `word_count`, `vocabulary_known_coverage`, `vocabulary_in_progress_coverage`, `is_built_in`.

The documented vocabulary surface is materially narrower than issue #352's desired schema: it has no documented export fields for kanji/components, example sentences, media/deck appearances, source/license provenance, or complete corpus statistics. `card_level`, `card_state`, `due_at`, user deck data, and review exports are account-specific and should not be collected for a distributable dictionary artifact.

## Limits, privacy, and redistribution

- The API documents HTTP `429` / `too_many_requests` and tells clients to slow down, but publishes no numeric requests-per-period rate, bulk quota, retry interval, or maximum lookup batch size. It also tells clients not to request unused fields to save bandwidth and server resources. A safe acquisition rate cannot be inferred from the public docs.
- The [Terms of use](https://jpdb.io/terms-of-use) prohibit scraping, flooding, account intrusion, and vulnerability probing; the list is non-exhaustive. They provide no exception for public pages or research acquisition.
- The [Privacy policy](https://jpdb.io/privacy-policy) says JPDB indefinitely stores access logs including IP address, URLs, and access times, and stores account/deck/review data needed for the service. Any approved importer should isolate credentials and exclude account-specific information from raw or distributed artifacts.
- The Terms provide no license to copy or redistribute JPDB's displayed/API data. The upstream-source notices on the About page are provenance statements, not a blanket authorization for the combined JPDB database. Redistribution must remain disabled until JPDB supplies written permission and the applicable per-source license obligations are mapped field by field.

## Feasible authorized next step

Ask JPDB for a provider-supplied snapshot or an expressly approved bulk endpoint, together with written terms covering: exact fields and record universe; refresh cadence; request/bandwidth limits; retention; attribution and share-alike obligations; treatment of JPDB-derived ranks, pitch accents, corpus/media links, examples, and kanji data; permission to transform into SQLite; and whether the raw or normalized data may ship in Zenbu. Without that response, the only clearly documented machine-readable export is the authenticated user's own review history, which does not satisfy issue #352.
