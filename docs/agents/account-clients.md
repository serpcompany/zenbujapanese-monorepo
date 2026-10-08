# Building an app on the Zenbu account

How an app, such as the Zenbu iOS app or Tomodachi, signs a learner in to their Zenbu account and
keeps its copy of their known words and lists in step. The contract is
[`apps/account-api/openapi.json`](../../apps/account-api/openapi.json), OpenAPI 3.1, and its
readable form is the [API reference](../api/account-api.md): every route with its auth and scopes,
every field with its type and bounds, every answer and error code, and each synced entity's
operations, with an example of each. This guide is the order to use them in, and the rules no
schema shows. How the service works inside is [`account-api.md`](account-api.md).

Every app stays local-first: everything works signed out and offline, the device's copy is what the
app shows, and the account only carries changes between devices and apps (#374).

## The host

`https://api.zenbujapanese.com`, and `https://api-staging.zenbujapanese.com` for staging. Every
route is under `/v1`, and every body is JSON (`Content-Type: application/json`), at most 64 KB. An
error is `{ "error": { "code": "...", "message": "..." } }`: branch on `code`, show or log
`message` (Errors, below).

Staging and production are separate: an account, a session, or an access token from one means
nothing to the other, so a build talks to one host for everything, the dictionary service's app
routes included. Cloudflare's Bot Fight Mode is on for the zone, so a request from a data center,
such as a CI runner, may get a challenge page instead of an answer, and so, rarely, may an app's
(ADR 0012): treat an answer that isn't JSON as a network failure.

## Your app

Each app is listed in the account service (`apps/account-api/src/domain/clients.ts`) with an ID
and the scopes its tokens carry. To add one, add it there, with its Apple bundle IDs, in a pull
request the owners review; a Google client ID for it goes in the service's `GOOGLE_CLIENT_IDS`
setting ([`account-api.md`](account-api.md), Settings).

| App | ID | Scopes |
| --- | --- | --- |
| Zenbu Japanese for iOS | `zenbu-ios` | `account`, `account:delete`, `profile`, `lists:read`, `lists:write`, `known:read`, `known:write` |
| zenbujapanese.com | `zenbu-web` | the same |
| Tomodachi | `tomodachi` | `account:delete`, `lists:read`, `known:read`, `known:mark`, `dictionary:read` |

- `account` manages how the account signs in and where: linking and unlinking a way in, listing
  the ways in, and listing or signing out sessions. `profile` reads and changes the profile, and
  `GET /v1/auth/get-session`, which shows the email and name.
- `known:mark` marks a word Known and never clears one: only the learner un-marks a word.
- `dictionary:read` is for the dictionary service's routes for apps (#571).
- An app without a scope gets `403 insufficient_scope` from the route, or `not_allowed` for a sync
  change, and sync never sends it the entities it can't read: Tomodachi never gets the profile.
- **Scopes keep a cooperating app to what it needs; they don't stop a hostile one.** An app is a
  public client with no secret, and names itself in a header, so a program can claim to be any
  app. Every token is still only the signed-in learner's own account, so what's at stake is that
  learner's own data in an app they chose, not anyone else's.
- The cursor passes the entities an app can't read. When an app's scopes grow, sync once with no
  cursor.

**Adding an app** takes a pull request to the service and a person in Apple Developer and Google
Cloud ([`account-api.md`](account-api.md), Set up the server):

1. **Its entry** in `apps/account-api/src/domain/clients.ts`: an `id` (lowercase, sent as
   `X-Zenbu-Client`), its `name`, the fewest `scopes` it needs, its Apple bundle IDs
   (`appleBundleIds`), `signsInOnTheWeb: false`, and `requestsPerMinute` (30,000, as
   the others), with a row in the table above. The service ships with the next `Account API
   deploy`; until then a sign-in naming it is refused `unknown_client`.
2. **Sign in with Apple:** its App ID, in the same Apple Developer team as the iOS app
   (`W3GXL2NQQP` while #616 is open), with Sign in with Apple on, grouped with
   `com.zenbujapanese.app` as its primary App ID, so the service's one key covers it and a learner's
   Apple user ID is the same in every app. A Mac build with its own bundle ID needs that ID listed
   and grouped too; one sharing the iOS build's bundle ID needs nothing more.
3. **Google:** an OAuth client of type iOS for its bundle ID (a Mac build with the same bundle ID
   uses it too), whose client ID goes on the end of the service's `GOOGLE_CLIENT_IDS` in both
   environments. The ID isn't secret: the app ships it.
4. **Check it on staging:** each way in signs a learner in, `GET /v1/auth/token` answers a token
   whose `azp` is the new ID and whose `scope` is its scopes, and deleting the account works with
   an Apple account.

## Signing in

Send `X-Zenbu-Client: <your app's ID>` with every sign-in. Without it, or with an ID the service
doesn't list, a sign-in is refused (`unknown_client`).

- **Sign in with Apple:**
  1. `POST /v1/auth/sign-in/nonce` with `{}` for a nonce, good for one sign-in within 10 minutes.
  2. Ask Apple (`ASAuthorizationAppleIDRequest`), with the nonce's SHA-256, in lowercase hex, as
     its `nonce`, and `.email` and `.fullName` as its scopes.
  3. `POST /v1/auth/sign-in/social` with `{ "provider": "apple", "idToken": { "token": "<Apple's
     ID token>", "nonce": "<the nonce>" } }`.

  A token made for another app's bundle ID is refused (`client_mismatch`). Apple's token holds no
  name, and Apple hands the app the learner's name only on their first sign-in
  (`ASAuthorizationAppleIDCredential.fullName`): send it then as
  `"idToken": { "token": "…", "nonce": "…", "user": { "name": { "firstName": "Kana", "lastName": "Fan" } } }`,
  so a new account has a name. Keep the credential's `authorizationCode` only while deleting the
  account (Deleting the account, below).
- **Google:** the same, with `"provider": "google"`, Google's ID token, and the nonce itself
  (not hashed) as the `nonce` the app gives Google. The token's audience is the app's Google client
  ID, which must be in the service's `GOOGLE_CLIENT_IDS`, so the iOS client's ID, not the web
  client's. The iOS app needs no SDK: it opens Google's OAuth for iOS with PKCE in
  `ASWebAuthenticationSession` and exchanges the code for the ID token
  ([`ios.md`](ios.md), Account and sync).
- **An emailed code:** `POST /v1/auth/email-otp/send-verification-otp` with
  `{ "email": "...", "type": "sign-in" }`, then `POST /v1/auth/sign-in/email-otp` with the email
  and the code. The first answers `200` whether or not the email has an account, so it shows
  nothing about who has one. A code is six digits, lasts 10 minutes, and allows five wrong
  guesses: `invalid_otp` is a wrong one, and `otp_expired` or `403 too_many_attempts` means ask
  for a new code. A first sign-in may send a `name` too, which becomes the account's name.

An email sign-in:

```http
POST /v1/auth/sign-in/email-otp HTTP/1.1
Host: api-staging.zenbujapanese.com
Content-Type: application/json
X-Zenbu-Client: tomodachi

{ "email": "learner@example.com", "otp": "123456" }
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
set-auth-token: <the signed session token>

{
  "token": "<the session's bare token, which signs nothing in>",
  "user": {
    "id": "<the account's ID>",
    "name": "",
    "email": "learner@example.com",
    "emailVerified": true,
    "image": null,
    "createdAt": "2026-10-07T03:17:00.000Z",
    "updatedAt": "2026-10-07T03:17:00.000Z"
  }
}
```

An Apple or Google sign-in answers the same, to:

```http
POST /v1/auth/sign-in/social HTTP/1.1
Content-Type: application/json
X-Zenbu-Client: zenbu-ios

{ "provider": "apple", "idToken": { "token": "<Apple's ID token>", "nonce": "<the nonce>" } }
```

A sign-in answers the learner, and the **session token** in the `set-auth-token` header. Keep it in
the Keychain: it's the refresh token, good for 60 days from its last use. Send it only to
`/v1/auth`. An app with no `account` scope uses only the sign-in routes, `GET /v1/auth/token`, and
`POST /v1/auth/sign-out`; the rest manage the account and need `account` or `profile`. At most five
codes go to one email in 10 minutes. Each address Cloudflare sees may also ask for five codes and
try ten in 10 minutes, ask for 30 nonces and make 20 Apple or Google sign-ins a minute, and send
at most 100 other requests to `/v1/auth` a minute, fewer to some of Better Auth's routes. Past any of them the answer is `429`, with
`Retry-After`: wait that many seconds. The same
Apple account, Google account, or email signs in to the same Zenbu account in
every app, as long as the account has that way in; an email that already has an account through
another way is refused until the learner adds it there, signed in (`401 oauth_link_error`,
`403 account_not_linked`).

An app with no `profile` scope, such as Tomodachi, can't read `GET /v1/me`: it keeps the `user`
its sign-in answered (the account's `id` and `email`) to show who is signed in, and compares that
`id` to tell the same account signing in again from another.

**Ways in.** An app with `account` lets the learner manage how they sign in, each change needing a
sign-in from the last 10 minutes (`403 session_not_fresh`: sign in again first), and the account's
email is told of each:

- **Add Apple or Google:** `POST /v1/auth/link-social`, with the session token, a fresh nonce, and
  the provider's token, as for signing in.
- **Add email:** sign in with a code for the account's email, sending the session token as
  `Authorization: Bearer`.
- **List them:** `GET /v1/auth/list-accounts`; **remove one:** `POST /v1/auth/unlink-account` with
  its `id` as `accountId`. The last way in can't go (`failed_to_unlink_last_account`).

Signing in without an ID token (`POST /v1/auth/sign-in/social` with only `provider` and
`callbackURL`) is the website's redirect sign-in: whatever starts it, the session it makes is the
website's (`zenbu-web`). An app signs in with an ID token.

## The website

zenbujapanese.com (`zenbu-web`) signs in from the learner's browser, on an origin the service
trusts (`ACCOUNT_API_TRUSTED_ORIGINS`), and keeps no token of its own
([`web.md`](web.md), Account pages):

- **Every call to `/v1/auth`** is a `fetch` with `credentials: 'include'`. The session is the
  service's HttpOnly cookie on its own host: a sign-in answers no `set-auth-token` to the website,
  so the page never holds the signed session token. `GET /v1/auth/get-session` shows it the
  session's bare `token`, which signs nothing in; the page sends it only to
  `POST /v1/auth/revoke-session`, to sign this browser's earlier session out after a fresh sign-in.
  `GET /v1/auth/token` with the cookie answers the access token, which the page keeps in memory
  and sends, without cookies, to `/v1/me`.
- **Apple** runs in Sign in with Apple JS's popup, as the Services ID, with the nonce's SHA-256
  and a return URL on the page's own origin, `<site>/account/`, since Apple answers a popup only
  there. The page signs in with the ID token and the nonce, as an app does, and on a first sign-in
  passes the name Apple hands it, as `idToken.user.name`.
- **Google** goes through the service: `POST /v1/auth/sign-in/social` with `{ "provider":
  "google", "callbackURL": "<page>", "errorCallbackURL": "<page>" }` answers the page to send the
  browser to; Google comes back to `/v1/auth/callback/google`, which sets the cookie and sends the
  browser to `callbackURL`, or to `errorCallbackURL` with `?error=<code>`. `link-social` adds Google
  the same way. The codes include `account_not_linked` (the email has an account another way),
  `account_already_linked_to_different_user` (that Google account belongs to another Zenbu
  account), `access_denied` (the learner cancelled at Google), `state_mismatch` (the sign-in took
  over 5 minutes, or started in another browser or tab), and `EMAIL_NOT_VERIFIED`, which may come
  in capitals, so compare ignoring case; treat any other code as a failed sign-in, to try again.
  A missing state, or a callback reused or reloaded, ends at `/v1/auth/error`, a JSON
  `404 not_found` the browser shows: the page can't catch it.
- **On `429`**, wait what `Retry-After` says.

## Access tokens

`GET /v1/auth/token`, with the session token as `Authorization: Bearer`, answers a 15-minute access
token, `{ "token": "<JWT>" }`. Send that, never the session token, to `/v1/me`, `/v1/sync`, and
the dictionary service, as `Authorization: Bearer <token>`.

- **Refresh** it a minute before its `exp`, or after a request answers `401`, then send that
  request once more; keep it in memory only. If `/v1/auth/token` itself answers `401`
  (`unauthorized`, or `sign_in_again` for a session that belongs to no listed app), the session is
  over: sign the learner out on the device, keeping their data, and offer to sign in again.
- **The session token** lasts 60 days from its last use (each use moves its end at most once a
  day), so an app opened at least every 60 days stays signed in. Keep it in the Keychain, for this
  device only.
- **What it holds:** an EdDSA JWT with the account (`sub`), your app (`azp`), its scopes
  (`scope`, space-separated), when the learner signed in (`auth_time`, seconds), the service
  (`iss` and `aud`, both the host, such as `https://api.zenbujapanese.com`), and `iat` and `exp`.
  No email or name. A route your scopes don't cover answers `403 insufficient_scope`, with
  `WWW-Authenticate` naming the scope; a sync change they don't allow is rejected (`not_allowed`).
- **A fresh sign-in.** `auth_time` is when the session was made. Deleting the account needs one
  from the last 10 minutes, as do adding and removing a way in: sign the learner in again, and use
  the new session's tokens.
- **Another service** checks a token itself: its signature against `GET /v1/auth/jwks` (EdDSA,
  Ed25519), `iss` and `aud` equal to the host, `exp`, and the scope it needs in `scope`, as the
  dictionary service does ([`dictionary-api.md`](dictionary-api.md)).

## The profile

An app with `profile` reads and changes the learner's name and username at `/v1/me`. Sync carries
the same profile (`profile`, below), so an app that syncs needn't call `/v1/me` too.

```http
GET /v1/me HTTP/1.1
Authorization: Bearer <access token>
```

```json
{
  "id": "<the account's ID>",
  "name": "Kana Fan",
  "username": "kana_fan",
  "email": "learner@example.com",
  "version": 3,
  "createdAt": "2026-10-07T03:17:00.000Z",
  "updatedAt": "2026-10-07T04:02:11.000Z"
}
```

`PATCH /v1/me` with `{ "baseVersion": 3, "name": "Kana" }` (name, username, or both; `null`
removes the username) answers the profile as changed, at version 4. If the profile moved past
`baseVersion`, nothing changes: `409 version_conflict`, with the profile as it is now in `current`,
which the app shows before the learner tries again. `409 username_taken` and `400 invalid_fields`
are the learner's to fix; the reference lists each field's bounds.

## When to sync

Never on a fixed timer (#374). Sync:

- after a local change, when there's a connection;
- on launch and on returning to the foreground, if there are queued changes or the last sync is
  more than 15 minutes old (a setting in your app, not the API);
- when the system grants background time, as a chance, not a schedule;
- when the learner asks to refresh.

On a network failure or a `5xx`, retry with exponential backoff and jitter, and stop retrying
while the app is in the background. On `429`, wait the seconds `Retry-After` says. Keep the queue
and the cursor across launches.

## How to sync

`POST /v1/sync` with the queued changes and the cursor from the last sync you applied, or none the
first time:

1. **Queue each change as it's made**, with:
   - a new UUID as its `id`, kept with it;
   - its `entity`, `operation`, and `entityId`;
   - its `fields`;
   - as `baseVersion`, the version of the entity your app had when the change was made: 0 for one
     it never had from the server.

   Apply it on the device at once.
2. **Send up to 50** queued changes with the cursor. If the answer is lost, send the same request
   again: each change applies once, by its `id`.
3. **Each result is final:**
   - `applied`: keep its `version` as the entity's version.
   - `conflict`: the entity changed elsewhere first. Take `current`, the entity as it is now, over
     your copy.
   - `rejected`: undo the change on the device. To try something else, queue a new change with a
     new `id`; never send a result's `id` again with a different change.
4. **Apply each change in `changes`** over your copy, by entity and `entityId`: `put` is the
   entity as it is now, `delete` is gone. Keep the `cursor`. While `hasMore` is true, sync again.
   A list word can arrive a page before its list: hold it until `hasMore` is false.
5. **On `410 invalid_cursor`**, sync again with no cursor, and take what comes back over your copy;
   queued changes still go.

A request and its answer:

```http
POST /v1/sync HTTP/1.1
Authorization: Bearer <access token>
Content-Type: application/json

{
  "cursor": "<the last cursor, or leave it out>",
  "mutations": [
    {
      "id": "6f1c0e7a-3b5d-4c2e-9a8f-1d2e3f4a5b6c",
      "entity": "knownWord",
      "operation": "mark",
      "entityId": "9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90",
      "baseVersion": 0,
      "fields": { "headword": "見る", "reading": "みる" }
    }
  ]
}
```

```json
{
  "results": [{ "id": "6f1c0e7a-3b5d-4c2e-9a8f-1d2e3f4a5b6c", "status": "applied", "version": 1 }],
  "changes": [
    {
      "entity": "knownWord",
      "entityId": "9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90",
      "operation": "put",
      "version": 1,
      "data": {
        "itemId": "9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90",
        "headword": "見る",
        "reading": "みる",
        "known": true
      }
    }
  ],
  "cursor": "<opaque>",
  "hasMore": false
}
```

The reference's [Sync entities](../api/account-api.md#sync-entities) gives each entity's ID, the
scopes each operation needs, its fields with their bounds, whether it reads `baseVersion`, and an
example. The bounds of a request:

- **50 mutations** at most (`400 bad_request` past them), and a body of **64 KB** at most
  (`413 too_large`): send fewer at a time. Each mutation's `id` is 8
  to 64 letters, digits, `-`, or `_`, unique in the request (`400 bad_request` otherwise); its
  `entityId` at most 200 characters, with no spaces or control characters; its `fields` names at
  most 64 characters, and their values strings, numbers, booleans, or null.
- **`limit`**, the most journal entries an answer reads, is 100 unless the request says, from 1 to
  500. `cursor` is at most 200 characters.
- **A `400 bad_request`** applies nothing: the request is malformed, a bug to fix, not to retry.
  **A `500`** may have applied the mutations before the failure: send the same request again,
  backing off, and those answer as before.

### The rules, from your side

- **The profile**, by the account's ID (or none): `update` with `name`, `username`, or both, at
  the version your app had, conflicts if the profile changed since. Only an app with `profile`
  reads or changes it.
- **Known words**, by item: a Language Reference ID, or `kanji:` and the kanji.
  - `mark` and `clear` take the version your app had. If the word changed since, it's a conflict.
  - Marking a known word, or clearing one not known, is applied and changes nothing.
  - **Tomodachi:** mark a word the first time it reaches "knows it". If the mark conflicts because
    the learner un-marked the word in Zenbu, don't send it again: mark it again only once the word
    climbs back to "knows it" (#563, decision 4).
- **Lists**, by UUID:
  - A rename or move conflicts if the list changed since.
  - A delete wins over everything done to the list since, and takes its words: when a list is
    deleted, drop its words on the device.
- **List words**, `<list>/<item>`:
  - An add always applies.
  - A remove applies only if your app had the latest add: an add from elsewhere wins.
  - An add to a list that's gone is rejected (`unknown_list`): undo it.

## Errors

Every error names a `code`, and the reference lists the codes each route answers, with an
[index of every code](../api/account-api.md#error-codes). What a client does with them:

| Answer | What to do |
| --- | --- |
| `401 unauthorized` from `/v1/me` or `/v1/sync` | Get a new access token and send the request once more. If `GET /v1/auth/token` answers `401` too, the learner is signed out. |
| `401 unauthorized` or `sign_in_again` from `GET /v1/auth/token` | Sign out on the device, keeping its data, and offer to sign in. |
| `403 insufficient_scope` | Your app may not do this. Don't retry; don't offer it. |
| `403 sign_in_again`, `403 session_not_fresh` | Sign the learner in again, then do it within 10 minutes. |
| `400 bad_request`, `400 validation_error` | A bug in the request. Don't retry it unchanged. |
| `400 invalid_otp`, `otp_expired`, `403 too_many_attempts` | Ask for the code again, or a new one. |
| `401 invalid_nonce`, `invalid_token`, `400 nonce_required` | Start the Apple or Google sign-in over, with a new nonce. |
| `401 oauth_link_error`, `403 account_not_linked` | The email has an account through another way in: sign in that way, then add this one. |
| `403 email_not_verified`, `client_mismatch`, `400 unknown_client` | A sign-in this app can't make; `unknown_client` is a missing or unlisted `X-Zenbu-Client`. |
| `409 version_conflict` | Take `current`, show it, and let the learner try again. |
| `410 invalid_cursor` | Sync again with no cursor. |
| `413 too_large` | The body is over 64 KB: send fewer mutations at a time. |
| `429 too_many_requests` | Wait the seconds `Retry-After` says, whatever started the request. |
| `500 internal`, a network failure, an answer that isn't JSON | Retry with exponential backoff and jitter, in the foreground. |
| `503 apple_unavailable` | Nothing was deleted: sign in with Apple again for a new code, and try again (Deleting the account). |
| `503 email_unavailable` | The service sends no email here: offer Apple or Google, and don't retry the code. |
| A code not listed | Act on its status as above. A newer service, or Better Auth, may add one. |

A rejected sync mutation carries its own code in its result, never as the answer's status: the
reference lists them under [Rejected mutations](../api/account-api.md#rejected-mutations).

## Calling from a browser

The service answers CORS only for the origins in its `ACCOUNT_API_TRUSTED_ORIGINS`, which are the
website's (`https://zenbujapanese.com`, and `https://staging.zenbujapanese.com` on staging), with
credentials, never `*`: it allows `GET`, `POST`, `PATCH`, and `DELETE` with the `Authorization`,
`Content-Type`, and `X-Zenbu-Client` headers, lets the page read `Retry-After` and `X-Retry-After`,
and lets a browser keep its preflight for 10 minutes. A page on another origin can't call it. A
sign-in from one of those origins is the website's (`zenbu-web`) unless it names another app in
`X-Zenbu-Client`, and a redirect sign-in (Apple's or Google's page, back to
`/v1/auth/callback/<provider>`) is always the website's. Every answer to those origins leaves out
`set-auth-token`, so a page there keeps the cookie session, as the website does. So a new web app
needs a change to the service first: its origin in that setting, its sign-ins naming it in
`X-Zenbu-Client`, ID-token sign-ins only, and a decision about whether a cookie session suits it.
Apps on a device aren't held to CORS.

## Deleting the account

Every app that signs in offers deleting the account (App Review guideline 5.1.1(v)):

1. Ask the learner to confirm, and to sign in again: deleting needs a sign-in from the last 10
   minutes (`403 sign_in_again`).
2. If the account signs in with Apple, sign in with Apple, and keep the **authorization code**
   Apple gives with that sign-in. An app with `account` knows from `GET /v1/auth/list-accounts`
   (a `providerId` of `apple`). One without it, such as Tomodachi, sends step 3 without a code: an
   Apple account answers `400 apple_authorization_needed`, so it then signs in with Apple and
   sends the code. If the fresh sign-in in step 1 was Apple's, send its code at once.
3. `DELETE /v1/me` with `{ "confirm": true }`, and `"appleAuthorizationCode"` for an Apple
   account: the code from signing in with the Apple ID the account uses. The website sends its
   popup's return URL too, as `"appleRedirectUri"`. The service revokes your
   app's Apple access with it before deleting. `apple_authorization_needed`,
   `apple_authorization_invalid`, `apple_account_mismatch`, and `503 apple_unavailable` delete
   nothing: sign in with Apple again for a new code, and try again.
4. On `200`, sign out on the device: forget the session token and the cursor, and keep the
   device's data. The account, and everything it synced, is gone; signing in again makes a new
   one.

The fresh sign-in in step 1 makes a new session: use its tokens, and sign the earlier session out
(`POST /v1/auth/sign-out` with its token) so it doesn't linger. Refuse a fresh sign-in into another
account (its `user.id` differs) rather than deleting that one. If the answer to `DELETE /v1/me` is
lost, ask `GET /v1/auth/token`: a `401` means the account is gone.

## Signing out

`POST /v1/auth/sign-out` with the session token, then forget it and the cursor. Keep the device's
copy: it's the learner's.
