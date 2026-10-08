# Zenbu dictionary service's routes for apps

Written from [`apps/dictionary-api/openapi.json`](../../apps/dictionary-api/openapi.json), the contract's version 1, by `packages/node-service/src/api-reference.ts`, and a test fails when the two differ. Don't edit it by hand: after changing a route, run `pnpm test -u` in `apps/dictionary-api`, and commit both files.

How a client uses these routes, in order, is the [client guide](../agents/account-clients.md#word-cards).

Word cards and segmentation for a signed-in app that doesn't bundle the language data, such as Tomodachi (ADR 0013). They're the only dictionary routes an app calls; the website's own routes take its service token and are in docs/agents/dictionary-api.md.

- **Errors** are `{ "error": { "code": "...", "message": "..." } }`, a missing route's `404 not_found` included. Branch on `code`.
- **Caching.** Each answer carries `languageData`, and is `Cache-Control: private, max-age=86400` with the build as its `ETag`. Keep it a day, then revalidate with `If-None-Match`; a `304` means it holds. Key what you keep on all of `languageData`, and fetch again when any of it changes. An error is never cached.
- **Browsers.** The routes send no CORS headers: an app calls them from a device, not a web page.

## Servers

- Production: `https://api.zenbujapanese.com`
- Staging: `https://api-staging.zenbujapanese.com`

## Authentication

- `accessToken` (http, bearer): An access token from the account service's GET /v1/auth/token, on the same host, with `dictionary:read` in its `scope`: an EdDSA JWT whose `iss` and `aud` are that host. The service checks it against the account service's JWKS. Never the website's service token.

## Routes

| Route | Auth | What it does |
| --- | --- | --- |
| [`GET /v1/apps/word-cards`](#get-v1appsword-cards) | `accessToken` with `dictionary:read` | Word cards for the words an app asks for |
| [`GET /v1/apps/segmentation`](#get-v1appssegmentation) | `accessToken` with `dictionary:read` | A text split into words, as the app links captions and example sentences |

### `GET /v1/apps/word-cards`

Word cards for the words an app asks for.

The cards for up to 100 Language Reference IDs, in the format an app's baked cards use, with the license and sources to show, and the IDs no entry has.

**Auth:** `accessToken` with `dictionary:read`.

**Header parameters:**

- `if-none-match` (string, optional): The `ETag` of the copy the app keeps; a match answers `304`.

**Query parameters:**

- `ids` (string, required): 1 to 100 Language Reference IDs (32 hex digits, in either case), comma-separated. One asked twice is answered once.

**Answers:**

- **200**, [`WordCardsAnswer`](#wordcardsanswer): The cards.
- **304**: `If-None-Match` named this build: the copy the app has still holds.
- **400** `bad_request`: `ids` names no word, more than 100, or something that isn't a Language Reference ID.
- **401** `unauthorized`: No access token, or one that's expired, forged, or not the account service's. Get a new one from GET /v1/auth/token, and send the request once more.
- **403** `insufficient_scope`: The app's token has no `dictionary:read`. Don't retry.
- **429** `rate_limited`: This account sent more than its requests a minute (60 unless the service is set otherwise).
- **500** `internal`: The dictionary failed to answer. Retry with backoff.
- **503** `unavailable`: The service can't check account tokens yet, or can't read the account service's keys. Retry with backoff.
- **503** `starting`: The dictionary is still loading. Retry with backoff.

**Headers:**

- A 200 sends `ETag`: The service's build, quoted. Send it back as `If-None-Match` to revalidate.
- A 200 sends `Cache-Control`: `private, max-age=86400`: keep the answer a day, then revalidate.
- A 304 sends `ETag`: The service's build, quoted. Send it back as `If-None-Match` to revalidate.
- A 304 sends `Cache-Control`: `private, max-age=86400`: keep the answer a day, then revalidate.
- A 401 sends `WWW-Authenticate`: `Bearer`.
- A 403 sends `WWW-Authenticate`: Names the scope: `scope="dictionary:read"`.
- A 429 sends `Retry-After`: The seconds to wait.

### `GET /v1/apps/segmentation`

A text split into words, as the app links captions and example sentences.

Each token with its reading, its dictionary form, and the entry it is, or the entries it may be.

**Auth:** `accessToken` with `dictionary:read`.

**Header parameters:**

- `if-none-match` (string, optional): The `ETag` of the copy the app keeps; a match answers `304`.

**Query parameters:**

- `text` (string, required): 1 to 200 characters, not all blank, URL-encoded.

**Answers:**

- **200**, [`SegmentationAnswer`](#segmentationanswer): The tokens.
- **304**: `If-None-Match` named this build: the copy the app has still holds.
- **400** `bad_request`: `text` is blank, or over 200 characters.
- **401** `unauthorized`: No access token, or one that's expired, forged, or not the account service's. Get a new one from GET /v1/auth/token, and send the request once more.
- **403** `insufficient_scope`: The app's token has no `dictionary:read`. Don't retry.
- **429** `rate_limited`: This account sent more than its requests a minute (60 unless the service is set otherwise).
- **500** `internal`: The dictionary failed to answer. Retry with backoff.
- **503** `unavailable`: The service can't check account tokens yet, or can't read the account service's keys. Retry with backoff.
- **503** `starting`: The dictionary is still loading. Retry with backoff.

**Headers:**

- A 200 sends `ETag`: The service's build, quoted. Send it back as `If-None-Match` to revalidate.
- A 200 sends `Cache-Control`: `private, max-age=86400`: keep the answer a day, then revalidate.
- A 304 sends `ETag`: The service's build, quoted. Send it back as `If-None-Match` to revalidate.
- A 304 sends `Cache-Control`: `private, max-age=86400`: keep the answer a day, then revalidate.
- A 401 sends `WWW-Authenticate`: `Bearer`.
- A 403 sends `WWW-Authenticate`: Names the scope: `scope="dictionary:read"`.
- A 429 sends `Retry-After`: The seconds to wait.

## Error codes

Every `error.code` a route answers, with its status. Branch on the code; show or log the `message`.

| Code | Status | Routes |
| --- | --- | --- |
| `bad_request` | 400 | [`GET /v1/apps/word-cards`](#get-v1appsword-cards), [`GET /v1/apps/segmentation`](#get-v1appssegmentation) |
| `insufficient_scope` | 403 | [`GET /v1/apps/word-cards`](#get-v1appsword-cards), [`GET /v1/apps/segmentation`](#get-v1appssegmentation) |
| `internal` | 500 | [`GET /v1/apps/word-cards`](#get-v1appsword-cards), [`GET /v1/apps/segmentation`](#get-v1appssegmentation) |
| `rate_limited` | 429 | [`GET /v1/apps/word-cards`](#get-v1appsword-cards), [`GET /v1/apps/segmentation`](#get-v1appssegmentation) |
| `starting` | 503 | [`GET /v1/apps/word-cards`](#get-v1appsword-cards), [`GET /v1/apps/segmentation`](#get-v1appssegmentation) |
| `unauthorized` | 401 | [`GET /v1/apps/word-cards`](#get-v1appsword-cards), [`GET /v1/apps/segmentation`](#get-v1appssegmentation) |
| `unavailable` | 503 | [`GET /v1/apps/word-cards`](#get-v1appsword-cards), [`GET /v1/apps/segmentation`](#get-v1appssegmentation) |

## Schemas

### WordCardsAnswer

- `format` (`"zenbu.word-cards.v1"`, required)
- `license` (object, required): The license the cards are shared under, and a statement to show with them.
  - `name` (string, required)
  - `url` (string, required)
  - `statement` (string, required)
- `sources` (array of [`WordCardSource`](#wordcardsource), required)
- `cards` (array of [`WordCard`](#wordcard), required): A card for each ID with an entry, in the order asked, each once.
- `missing` (array of string, required): The IDs no entry has, lowercased.
- `languageData` ([`LanguageData`](#languagedata), required)

### WordCardSource

- `name` (string, required)
- `supplies` (string, required)
- `license` (string, required)
- `url` (string, required)
- `notice` (string, required): A notice's file name in the language-data release.

### WordCard

One word as the app shows it (`zenbu.word-cards.v1`, language-data/word-cards.md, A card).

- `languageReferenceID` (string, required): The entry, in lowercase hex.
- `entSeq` (integer, required): Its JMdict entry number.
- `headword` (string, required)
- `reading` (string, required)
- `furigana` (array of object, required)
  - `base` (string, required)
  - `reading` (string, optional)
  - `kanjiReadings` (array of string, optional)
- `pitch` (object or null, required)
  - `downstep` (integer, required): 0 for flat.
  - `moraCount` (integer, required)
  - `morae` (array of string, required)
  - `levels` (string, required): `H` or `L` for each of `morae`.
  - `particle` (`"H"` or `"L"`, required)
  - `estimated` (boolean, required)
  - `source` (string, required)
- `partOfSpeech` (string, required)
- `meanings` (array of object, required)
  - `meaning` (string, required)
  - `notes` (array of string, required)
  - `partsOfSpeech` (array of string, required)
- `jlpt` (object or null, required)
  - `source` (string, required): The chip's label, such as `JLPT` or `YouTube`.
  - `value` (string, required): What the chip shows, such as `N5`, `1,234`, or `No rank`.
  - `tier` (`"veryCommon"`, `"common"`, `"moderate"`, `"uncommon"`, `"rare"`, or `null`, required): How common the rank makes the word, or `null` with no rank.
  - `spokenTier` (string or null, required): The tier in words, for a screen reader, or `null`.
  - `level` (integer, required, 1 to 5)
- `frequency` (array of object, required)
  - `source` (string, required): The chip's label, such as `JLPT` or `YouTube`.
  - `value` (string, required): What the chip shows, such as `N5`, `1,234`, or `No rank`.
  - `tier` (`"veryCommon"`, `"common"`, `"moderate"`, `"uncommon"`, `"rare"`, or `null`, required): How common the rank makes the word, or `null` with no rank.
  - `spokenTier` (string or null, required): The tier in words, for a screen reader, or `null`.
  - `list` (string, required): The ranked list's slug, such as `youtube`.
  - `rank` (integer or null, required)

### LanguageData

Which language data answered. Key a cache on all of it: a field that changes means fetch again.

- `release` (string, required): The language-data release, such as `2026.10.1`.
- `files` (map to string, required): The SHA-256 of each file a card is read from, by file name.

### SegmentationAnswer

- `format` (`"zenbu.segmentation.v1"`, required)
- `text` (string, required): The text, as sent.
- `tokens` (array of [`SegmentedToken`](#segmentedtoken), required)
- `languageData` ([`LanguageData`](#languagedata), required)

### SegmentedToken

- `text` (string, required)
- `reading` (string, optional): In hiragana, when the token has kanji.
- `dictionaryForm` (string, optional): When it differs from `text`.
- `languageReferenceID` (string, optional): The entry, when the token is one word.
- `candidates` (array of string, optional): The entries it may be, when it may be several.
