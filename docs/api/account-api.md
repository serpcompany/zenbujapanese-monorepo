# Zenbu account service

Written from [`apps/account-api/openapi.json`](../../apps/account-api/openapi.json), the contract's version 1, by `packages/node-service/src/api-reference.ts`, and a test fails when the two differ. Don't edit it by hand: after changing a route, run `pnpm test -u` in `apps/account-api`, and commit both files.

How a client uses these routes, in order, is the [client guide](../agents/account-clients.md).

Accounts, sign-in, profiles, and sync for every Zenbu app (ADR 0012). Sign-in is Better Auth's, under /v1/auth; a test holds each of its answers to this contract.

- **Errors.** Every error is `{ "error": { "code": "...", "message": "..." } }`. Branch on `code`, which is stable; `message` is for people and may change. A route may answer a code it doesn't list here, such as one from a Better Auth upgrade: handle it by its status.
- **Apps.** A sign-in names its app in `X-Zenbu-Client`, unless it comes from one of the website's origins; the app decides the scopes its tokens carry.
- **Bodies** are JSON, at most 64 KB (`413 too_large`).
- **Rate limits** answer `429 too_many_requests` with `Retry-After`, in seconds (Better Auth's also with `X-Retry-After`).
- **Browsers** may call the service only from the website's origins, with credentials; CORS lets the page read `Retry-After` and `X-Retry-After`.

## Servers

- Production: `https://api.zenbujapanese.com`
- Staging: `https://api-staging.zenbujapanese.com`

## Authentication

- `accessToken` (http, bearer): A 15-minute access token from GET /v1/auth/token, which takes the session token a sign-in returns, never the session token itself. It names the account (`sub`), the app (`azp`), when the learner signed in (`auth_time`), and the app's scopes (`scope`, space-separated). Each route names the scope it needs, and each sync operation its own, in `x-sync-entities`. The dictionary service's routes for apps take `dictionary:read`.
- `sessionToken` (http, bearer): The signed session token from a sign-in's `set-auth-token` header. Send it only to /v1/auth.

## Routes

| Route | Auth | What it does |
| --- | --- | --- |
| [`GET /v1/health`](#get-v1health) | none | Whether the service can answer |
| [`GET /v1/me`](#get-v1me) | `accessToken` with `profile` | The signed-in account's profile |
| [`PATCH /v1/me`](#patch-v1me) | `accessToken` with `profile` | Change the signed-in account's name or username |
| [`DELETE /v1/me`](#delete-v1me) | `accessToken` with `account:delete` | Delete the signed-in account |
| [`POST /v1/sync`](#post-v1sync) | `accessToken` | Send the changes made on the device, and get the changes made elsewhere |
| [`POST /v1/auth/email-otp/send-verification-otp`](#post-v1authemail-otpsend-verification-otp) | none | Email a sign-in code |
| [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp) | none | Sign in with the emailed code |
| [`POST /v1/auth/sign-in/nonce`](#post-v1authsign-innonce) | none | A nonce for one Apple or Google sign-in |
| [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial) | none | Sign in with Apple or Google |
| [`GET /v1/auth/callback/{id}`](#get-v1authcallbackid) | none | Where Apple's or Google's web sign-in comes back |
| [`POST /v1/auth/link-social`](#post-v1authlink-social) | `sessionToken` with `account` | Add Apple or Google as another way to sign in |
| [`POST /v1/auth/unlink-account`](#post-v1authunlink-account) | `sessionToken` with `account` | Remove a way to sign in |
| [`GET /v1/auth/token`](#get-v1authtoken) | `sessionToken` | A 15-minute access token for /v1/me, /v1/sync, and the other services |
| [`GET /v1/auth/jwks`](#get-v1authjwks) | none | The keys an access token is checked with |
| [`GET /v1/auth/get-session`](#get-v1authget-session) | `sessionToken` with `profile` | The session the token names |
| [`POST /v1/auth/sign-out`](#post-v1authsign-out) | `sessionToken` | End this session |
| [`GET /v1/auth/list-accounts`](#get-v1authlist-accounts) | `sessionToken` with `account` | The ways this account signs in |
| [`GET /v1/auth/list-sessions`](#get-v1authlist-sessions) | `sessionToken` with `account` | Where this account is signed in |
| [`POST /v1/auth/revoke-session`](#post-v1authrevoke-session) | `sessionToken` with `account` | Sign one session out |
| [`POST /v1/auth/revoke-sessions`](#post-v1authrevoke-sessions) | `sessionToken` with `account` | Sign every session out, this one too |
| [`POST /v1/auth/revoke-other-sessions`](#post-v1authrevoke-other-sessions) | `sessionToken` with `account` | Sign every other session out |

### `GET /v1/health`

Whether the service can answer.

**Auth:** none.

**Answers:**

- **200**, { status: `"ok"` }: It can.
- **503**, { status: `"unavailable"` }: Its database doesn't answer.

### `GET /v1/me`

The signed-in account's profile.

**Auth:** `accessToken` with `profile`.

**Answers:**

- **200**, [`Profile`](#profile): The profile.
- **401** `unauthorized`: No access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.
- **403** `insufficient_scope`: This app's access to the account doesn't include `profile`.
- **429** `too_many_requests`: This account sent more than 60 requests here from this app in the current minute, or the app more than its limit from all its accounts together. Wait the seconds `Retry-After` says.
- **500** `internal`: The service failed, and nothing says why. Try again later, backing off.

### `PATCH /v1/me`

Change the signed-in account's name or username.

Optimistic concurrency: send the `version` last seen as `baseVersion`. The change goes through only if the profile is still at that version, and then its version goes up by one and it appears in /v1/sync. Sending the current values again changes nothing.

**Auth:** `accessToken` with `profile`.

**Body** (JSON, required, [`ProfilePatch`](#profilepatch)):

- `baseVersion` (integer, required, at least 1): The profile `version` this change was made to. If the profile has changed since, nothing is changed and the answer is a conflict with the current profile.
- `name` (string, optional): 1 to 100 characters once trimmed, with runs of spaces made one and no control characters. Stored in Unicode NFC.
- `username` (string or null, optional): 3 to 30 letters a to z, digits, or underscores, unique across accounts. It's normalized first (Unicode NFKC, trimmed, lowercased), so `Kana_Fan` is `kana_fan`. `null` removes it.

**Answers:**

- **200**, [`Profile`](#profile): The profile, as changed.
- **400** `bad_request`: The body is not JSON, or not this shape.
- **400** `invalid_fields`: A name or username out of bounds, or neither sent.
- **401** `unauthorized`: No access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.
- **403** `insufficient_scope`: This app's access to the account doesn't include `profile`.
- **409** `version_conflict`: The profile changed since `baseVersion`, and nothing changed. `current` is the profile as it is now.
- **409** `username_taken`: Another account has that username.
- **413** `too_large`: The body is over 64 KB.
- **429** `too_many_requests`: This account sent more than 60 requests here from this app in the current minute, or the app more than its limit from all its accounts together. Wait the seconds `Retry-After` says.
- **500** `internal`: The service failed, and nothing says why. Try again later, backing off.

### `DELETE /v1/me`

Delete the signed-in account.

Deletes the account, its ways to sign in, its sessions, and everything it synced, at once; backups age out within 30 days, and the account's email is told. It needs `account:delete`, and a sign-in from the last 10 minutes, so the app asks the learner to sign in again first. An account that signs in with Apple sends a fresh Sign in with Apple authorization code from that sign-in, which the service uses to revoke the app's access with Apple. Each device keeps its own data and works signed out.

**Auth:** `accessToken` with `account:delete`.

**Body** (JSON, required, [`DeleteAccount`](#deleteaccount)):

- `confirm` (`true`, required): The learner confirmed in the app.
- `appleAuthorizationCode` (string, optional, 1 to 4,096 characters): From a fresh Sign in with Apple, for an account that signs in with Apple. It's used once, to revoke the app's access with Apple.
- `appleRedirectUri` (string (uri), optional, at most 2,048 characters): The website only: the return URL its Sign in with Apple popup named, which Apple needs again to take the code. It must be on one of the website's origins. Without it, the website's code is taken as one Apple sent to GET /v1/auth/callback/apple.

**Answers:**

- **200**, { status: `"deleted"` }: Deleted.
- **400** `bad_request`: The body is not JSON, or not this shape, or its `appleRedirectUri` is on none of the website's origins.
- **400** `apple_authorization_needed`: This account signs in with Apple: send the authorization code from a fresh Sign in with Apple.
- **400** `apple_authorization_invalid`: Apple refused that authorization code. Sign in with Apple again for a new one.
- **400** `apple_account_mismatch`: That Sign in with Apple is another Apple ID's. Sign in with the Apple ID this account uses.
- **401** `unauthorized`: No access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.
- **403** `insufficient_scope`: This app's access to the account doesn't include `account:delete`.
- **403** `sign_in_again`: Deleting the account needs a sign-in from the last 10 minutes. Sign in again first.
- **413** `too_large`: The body is over 64 KB.
- **429** `too_many_requests`: This account sent more than 60 requests here from this app in the current minute, or the app more than its limit from all its accounts together. Wait the seconds `Retry-After` says.
- **500** `internal`: The service failed, and nothing says why. Try again later, backing off.
- **503** `apple_unavailable`: Revoking with Apple didn't finish, and nothing was deleted. Sign in with Apple again for a new code, and try again.

### `POST /v1/sync`

Send the changes made on the device, and get the changes made elsewhere.

Applies `mutations` in order, then answers with the changes after `cursor`. Every mutation is idempotent by its ID, so a request can be sent again after a lost answer. Each answer holds at most `limit` journal entries; while `hasMore` is true, sync again with the new cursor. Results and changes are bounded by the request limits.

**Auth:** `accessToken`.

**Body** (JSON, required, [`SyncRequest`](#syncrequest)):

- `cursor` (string or null, optional, 1 to 200 characters): The `cursor` from the last answer whose changes the client applied. Leave it out, or send null, to start from the beginning.
- `limit` (integer, optional, 1 to 500): The most journal entries to read this time. Default 100.
- `mutations` (array of [`Mutation`](#mutation), optional, at most 50 items): Up to 50 changes made on the device, applied in order before the changes are read.

**Answers:**

- **200**, [`SyncAnswer`](#syncanswer): The results and the changes.
- **400** `bad_request`: The body is not JSON, or not this shape.
- **401** `unauthorized`: No access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.
- **410** `invalid_cursor`: The cursor isn't one this service gave this account, or is past what it holds, as after a restore. Nothing was applied. Sync again with no cursor, and keep what comes back.
- **413** `too_large`: The body is over 64 KB.
- **429** `too_many_requests`: This account sent more than 120 requests here from this app in the current minute, or the app more than its limit from all its accounts together. Wait the seconds `Retry-After` says.
- **500** `internal`: The service failed, and nothing says why. The mutations before the failure stand: send the same request again later, backing off, and those answer as before.

### `POST /v1/auth/email-otp/send-verification-otp`

Email a sign-in code.

Answers the same whether or not the email has an account. Five codes per address in 10 minutes.

**Auth:** none.

**Body** (JSON, required):

- `email` (string (email), required)
- `type` (`"sign-in"`, required)

**Answers:**

- **200**, { success: `true` }: Sent, or nothing to send.
- **400** `validation_error`: A field is missing, or of the wrong type; `message` names it.
- **400** `invalid_email`: `email` isn't an email address.
- **400** `sign_in_only`: `type` isn't `sign-in`: a code is sent only to sign in.
- **429** `too_many_requests`: Five codes went to this email in the last 10 minutes, or too many came from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.
- **503** `email_unavailable`: No email sender is set up.

### `POST /v1/auth/sign-in/email-otp`

Sign in with the emailed code.

Makes the account on the first sign-in. A `name` is used only then, held to the profile's name rule. Sent with a session from the last 10 minutes, as `Authorization: Bearer`, it adds the email as a way in to that session's account instead, which needs the session's app to have `account`; the account's email is told.

**Auth:** none.

**Header parameters:**

- `x-zenbu-client` (`"zenbu-ios"`, `"zenbu-web"`, or `"tomodachi"`, optional): The app signing in: its access is the account's, limited to the app's scopes. A browser on one of the website's origins may leave it out.

**Body** (JSON, required):

- `email` (string (email), required)
- `otp` (string, required)
- `name` (string, optional)

**Answers:**

- **200**, [`SignIn`](#signin): Signed in.
- **400** `validation_error`: A field is missing, or of the wrong type; `message` names it.
- **400** `invalid_otp`: The code is wrong, or was used.
- **400** `otp_expired`: The code is over 10 minutes old. Ask for a new one.
- **400** `unknown_client`: No `X-Zenbu-Client`, or one the service doesn't list, from outside the website's origins.
- **403** `account_not_linked`: An Apple or Google account has this email: sign in that way, then add the email.
- **403** `too_many_attempts`: Five wrong guesses used the code up. Ask for a new one.
- **403** `insufficient_scope`: The session's app doesn't have `account`.
- **429** `too_many_requests`: Too many requests from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.

**Headers:**

- A 200 sends `set-auth-token`: The signed session token: the refresh token, good for 60 days from its last use. Send it as `Authorization: Bearer` to GET /v1/auth/token for an access token.

### `POST /v1/auth/sign-in/nonce`

A nonce for one Apple or Google sign-in.

**Auth:** none.

**Body** (JSON, required):

An empty object, `{}`.

**Answers:**

- **200**, { nonce: string, expiresIn: integer }: Pass `nonce` to Apple or Google; it works once, within `expiresIn` seconds.
- **429** `too_many_requests`: Too many requests from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.

### `POST /v1/auth/sign-in/social`

Sign in with Apple or Google.

With `idToken`, signs in with the token the device got, and makes the account on the first sign-in. Without it, starts the web sign-in, which comes back to GET /v1/auth/callback/{id}. A new account's email must be verified by the provider, and an email that already has an account is refused until the learner adds this way while signed in.

**Auth:** none.

**Header parameters:**

- `x-zenbu-client` (`"zenbu-ios"`, `"zenbu-web"`, or `"tomodachi"`, optional): The app signing in: its access is the account's, limited to the app's scopes. A browser on one of the website's origins may leave it out.

**Body** (JSON, required):

- `provider` (`"apple"` or `"google"`, required)
- `idToken` ([`IdToken`](#idtoken), optional)
- `callbackURL` (string, optional): The website's page the browser comes back to from Google, on one of the website's origins.
- `errorCallbackURL` (string, optional): Where it comes back instead when signing in fails, with `?error=` and a code, such as `account_not_linked`, `account_already_linked_to_different_user`, `access_denied`, `state_mismatch`, or `EMAIL_NOT_VERIFIED`, which may come in capitals, so compare it ignoring case and treat any other as a failed sign-in. A missing state, or a callback reused or reloaded, ends at GET /v1/auth/error instead, a JSON `404 not_found`.

**Answers:**

- **200**, [`SignIn`](#signin) or [`WebSignIn`](#websignin): Signed in, or, without `idToken`, the provider page to send the browser to.
- **400** `validation_error`: A field is missing, or of the wrong type; `message` names it.
- **400** `nonce_required`: `idToken` has no `nonce`.
- **400** `unknown_client`: No `X-Zenbu-Client`, or one the service doesn't list, from outside the website's origins.
- **401** `invalid_nonce`: The nonce is unknown, already used, or over 10 minutes old. Ask for a new one.
- **401** `invalid_token`: Apple's or Google's token is malformed, expired, over an hour old, signed by another key or issuer, made for another app, or made for another nonce.
- **401** `oauth_link_error`: That email has an account through another way in: sign in that way, then add this one.
- **403** `email_not_verified`: The provider hasn't verified the email, so it can't make an account.
- **403** `client_mismatch`: The Apple token was made for another app's bundle ID.
- **404** `provider_not_found`: `provider` is neither `apple` nor `google`, or isn't set up here.
- **429** `too_many_requests`: Too many requests from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.

**Headers:**

- A 200 sends `set-auth-token`: The signed session token: the refresh token, good for 60 days from its last use. Send it as `Authorization: Bearer` to GET /v1/auth/token for an access token.

### `GET /v1/auth/callback/{id}`

Where Apple's or Google's web sign-in comes back.

**Auth:** none.

**Path parameters:**

- `id` (`"apple"` or `"google"`, required)

**Answers:**

- **302**: On to the `callbackURL` the sign-in started with.

### `POST /v1/auth/link-social`

Add Apple or Google as another way to sign in.

Needs a sign-in from the last 10 minutes. The account email is told. Without `idToken`, the website starts Google's sign-in, which comes back to `callbackURL` with the way added.

**Auth:** `sessionToken` with `account`.

**Body** (JSON, required):

- `provider` (`"apple"` or `"google"`, required)
- `idToken` ([`IdToken`](#idtoken), optional)
- `callbackURL` (string, optional): The website's page the browser comes back to from Google, on one of the website's origins.
- `errorCallbackURL` (string, optional): Where it comes back instead when signing in fails, with `?error=` and a code, such as `account_not_linked`, `account_already_linked_to_different_user`, `access_denied`, `state_mismatch`, or `EMAIL_NOT_VERIFIED`, which may come in capitals, so compare it ignoring case and treat any other as a failed sign-in. A missing state, or a callback reused or reloaded, ends at GET /v1/auth/error instead, a JSON `404 not_found`.

**Answers:**

- **200**, { status: `true` } or [`WebSignIn`](#websignin): Added, or, without `idToken`, the provider page to send the browser to.
- **400** `validation_error`: A field is missing, or of the wrong type; `message` names it.
- **401** `unauthorized`: No session, or one that has ended: sign in again.
- **401** `invalid_nonce`: The nonce is unknown, already used, or over 10 minutes old. Ask for a new one.
- **401** `invalid_token`: Apple's or Google's token is malformed, expired, over an hour old, signed by another key or issuer, made for another app, or made for another nonce.
- **403** `session_not_fresh`: The session is over 10 minutes old: sign the learner in again first.
- **403** `insufficient_scope`: The session's app doesn't have `account`.
- **429** `too_many_requests`: Too many requests from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.

### `POST /v1/auth/unlink-account`

Remove a way to sign in.

Needs a sign-in from the last 10 minutes. The last way never goes. The account's email is told.

**Auth:** `sessionToken` with `account`.

**Body** (JSON, required):

- `accountId` (string, required): The way in's `id` from GET /v1/auth/list-accounts, not its provider's subject.

**Answers:**

- **200**, { status: `true` }: Removed.
- **400** `validation_error`: A field is missing, or of the wrong type; `message` names it.
- **400** `failed_to_unlink_last_account`: It's the account's last way in, or the account has no way in with that `id`.
- **400** `account_not_found`: The account has no way in with that `id`.
- **401** `unauthorized`: No session, or one that has ended: sign in again.
- **403** `session_not_fresh`: The session is over 10 minutes old: sign the learner in again first.
- **403** `insufficient_scope`: The session's app doesn't have `account`.
- **429** `too_many_requests`: Too many requests from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.

### `GET /v1/auth/token`

A 15-minute access token for /v1/me, /v1/sync, and the other services.

**Auth:** `sessionToken`.

**Answers:**

- **200**, { token: string }: An EdDSA JWT naming the account (`sub`), the app (`azp`), its scopes (`scope`), and the sign-in (`auth_time`), good for 15 minutes (`exp`).
- **401** `unauthorized`: No session, or one that has ended: sign in again.
- **401** `sign_in_again`: The session belongs to no app the service lists. Sign in again.
- **429** `too_many_requests`: Too many requests from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.

### `GET /v1/auth/jwks`

The keys an access token is checked with.

**Auth:** none.

**Answers:**

- **200**, { keys: array of object }: A JWKS.
- **429** `too_many_requests`: Too many requests from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.

### `GET /v1/auth/get-session`

The session the token names.

**Auth:** `sessionToken` with `profile`.

**Answers:**

- **200**, { session: [`Session`](#session), user: [`SignedInUser`](#signedinuser) }: The session, or `null` with no valid one.
- **403** `insufficient_scope`: The session's app doesn't have `profile`.
- **429** `too_many_requests`: Too many requests from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.

### `POST /v1/auth/sign-out`

End this session.

**Auth:** `sessionToken`.

**Body** (JSON, required):

An empty object, `{}`.

**Answers:**

- **200**, { success: `true` }: Signed out, or there was no session.
- **429** `too_many_requests`: Too many requests from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.

### `GET /v1/auth/list-accounts`

The ways this account signs in.

**Auth:** `sessionToken` with `account`.

**Answers:**

- **200**, array of [`Identity`](#identity): Each way in.
- **401** `unauthorized`: No session, or one that has ended: sign in again.
- **403** `insufficient_scope`: The session's app doesn't have `account`.
- **429** `too_many_requests`: Too many requests from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.

### `GET /v1/auth/list-sessions`

Where this account is signed in.

**Auth:** `sessionToken` with `account`.

**Answers:**

- **200**, array of [`Session`](#session): Each session.
- **401** `unauthorized`: No session, or one that has ended: sign in again.
- **403** `insufficient_scope`: The session's app doesn't have `account`.
- **429** `too_many_requests`: Too many requests from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.

### `POST /v1/auth/revoke-session`

Sign one session out.

**Auth:** `sessionToken` with `account`.

**Body** (JSON, required):

- `token` (string, required): A session's `token` from list-sessions.

**Answers:**

- **200**, { status: `true` }: Signed out.
- **400** `validation_error`: A field is missing, or of the wrong type; `message` names it.
- **401** `unauthorized`: No session, or one that has ended: sign in again.
- **403** `insufficient_scope`: The session's app doesn't have `account`.
- **429** `too_many_requests`: Too many requests from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.

### `POST /v1/auth/revoke-sessions`

Sign every session out, this one too.

**Auth:** `sessionToken` with `account`.

**Body** (JSON, required):

An empty object, `{}`.

**Answers:**

- **200**, { status: `true` }: Signed out.
- **401** `unauthorized`: No session, or one that has ended: sign in again.
- **403** `insufficient_scope`: The session's app doesn't have `account`.
- **429** `too_many_requests`: Too many requests from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.

### `POST /v1/auth/revoke-other-sessions`

Sign every other session out.

**Auth:** `sessionToken` with `account`.

**Body** (JSON, required):

An empty object, `{}`.

**Answers:**

- **200**, { status: `true` }: Signed out.
- **401** `unauthorized`: No session, or one that has ended: sign in again.
- **403** `insufficient_scope`: The session's app doesn't have `account`.
- **429** `too_many_requests`: Too many requests from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.

## Sync entities

What a [`Mutation`](#mutation) can change. An app reads an entity only with its read scope, and makes an operation only with one of the operation's scopes; anything else is rejected `not_allowed`.

### Entity `profile`

The account's name and username. `PATCH /v1/me` changes them by the same rule; the email doesn't change here.

- **ID** (`entityId`): The account's ID, or left out.
- **Read with:** `profile`
- **As it is now** (a `put`'s `data`): [`Profile`](#profile)

**`update`**, with `profile`; `baseVersion` required. Name, username, or both. It applies only at the profile's current version, or conflicts with the profile as it is now; sending the current values again is applied and changes nothing.

Fields ([`ProfileUpdateFields`](#profileupdatefields)), and no others:

- `name` (string, optional): 1 to 100 characters once trimmed, with runs of spaces made one, kept in Unicode NFC, and no control or invisible format characters.
- `username` (string or null, optional): 3 to 30 letters a to z, digits, or underscores after Unicode NFKC, trimming, and lowercasing, unique across accounts; `null` removes it.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000001",
  "entity": "profile",
  "operation": "update",
  "baseVersion": 1,
  "fields": {
    "name": "Kana Fan",
    "username": "kana_fan"
  }
}
```

### Entity `knownWord`

Whether the learner knows a word or a kanji. A cleared word stays, as a `put` with `known: false`.

- **ID** (`entityId`): The item: a Language Reference ID (32 lowercase hex digits), or `kanji:` and one kanji, kept in Unicode NFC.
- **Read with:** `known:read`
- **As it is now** (a `put`'s `data`): [`KnownWord`](#knownword)

**`mark`**, with `known:write` or `known:mark`; `baseVersion` required. It applies only if the word is still at `baseVersion` (0 for one the account never had), so a mark made before the learner cleared the word loses to the clear, and one made after seeing it wins. Marking a known word is applied and changes nothing.

Fields ([`WordFields`](#wordfields)):

- `headword` (string, required, 1 to 200 characters): The word as the app shows it, kept in Unicode NFC and trimmed, with no control characters.
- `reading` (string, optional, at most 200 characters): Its reading, held as `headword` is. Empty when left out.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000002",
  "entity": "knownWord",
  "operation": "mark",
  "entityId": "9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90",
  "baseVersion": 0,
  "fields": {
    "headword": "見る",
    "reading": "みる"
  }
}
```

**`clear`**, with `known:write`; `baseVersion` required. It applies only at the word's current version: a clear that never saw a later mark conflicts, and the word stays known. Clearing a word not known is applied and changes nothing.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000003",
  "entity": "knownWord",
  "operation": "clear",
  "entityId": "9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90",
  "baseVersion": 1
}
```

### Entity `list`

A word list. An account holds at most 500, and a deleted list's ID can't be used again.

- **ID** (`entityId`): Its UUID, in either case; answers name it in lowercase.
- **Read with:** `lists:read`
- **As it is now** (a `put`'s `data`): [`WordList`](#wordlist)

**`create`**, with `lists:write`; `baseVersion` not read. Rejected `already_exists` if the account has or had a list with that ID, and `too_many_lists` past 500.

Fields ([`ListCreateFields`](#listcreatefields)), and no others:

- `name` (string, required): 1 to 500 characters once trimmed; control characters become spaces.
- `position` (integer, required, 0 to 100,000): Where the list sorts among the account's lists, lowest first.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000004",
  "entity": "list",
  "operation": "create",
  "entityId": "3b7f2c9e-5d1a-4e8b-9c6f-0a2d4e6f8b1c",
  "fields": {
    "name": "Food",
    "position": 0
  }
}
```

**`update`**, with `lists:write`; `baseVersion` required. A rename, a move, or both. It applies only at the current version, so two renames conflict and the second gets the list as it is now; one that already matches the list is applied. An update of a deleted list conflicts with the `delete`.

Fields ([`ListUpdateFields`](#listupdatefields)), and no others:

- `name` (string, optional): 1 to 500 characters once trimmed; control characters become spaces.
- `position` (integer, optional, 0 to 100,000): Where the list sorts among the account's lists, lowest first.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000005",
  "entity": "list",
  "operation": "update",
  "entityId": "3b7f2c9e-5d1a-4e8b-9c6f-0a2d4e6f8b1c",
  "baseVersion": 1,
  "fields": {
    "name": "Food and drink"
  }
}
```

**`delete`**, with `lists:write`; `baseVersion` not read. It always applies, wins over everything done to the list since, renames and words added elsewhere too, and takes the list's words with it: drop them on the device.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000006",
  "entity": "list",
  "operation": "delete",
  "entityId": "3b7f2c9e-5d1a-4e8b-9c6f-0a2d4e6f8b1c"
}
```

### Entity `listWord`

A word in a list. A list holds at most 5,000.

- **ID** (`entityId`): The list's UUID, a slash, and the item: `<list>/<item>`.
- **Read with:** `lists:read`
- **As it is now** (a `put`'s `data`): [`ListWord`](#listword)

**`add`**, with `lists:write`; `baseVersion` not read. It always applies to a list the account has. To a deleted or unknown list it's rejected `unknown_list`, and past 5,000 words `list_full`. Adding a word the list has is applied and changes nothing.

Fields ([`WordFields`](#wordfields)):

- `headword` (string, required, 1 to 200 characters): The word as the app shows it, kept in Unicode NFC and trimmed, with no control characters.
- `reading` (string, optional, at most 200 characters): Its reading, held as `headword` is. Empty when left out.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000007",
  "entity": "listWord",
  "operation": "add",
  "entityId": "3b7f2c9e-5d1a-4e8b-9c6f-0a2d4e6f8b1c/9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90",
  "fields": {
    "headword": "見る",
    "reading": "みる"
  }
}
```

**`remove`**, with `lists:write`; `baseVersion` required. It applies only at the word's current version, so it removes only an add it saw: an add the remover never saw wins, and the remove conflicts. Removing a word the list hasn't is applied.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000008",
  "entity": "listWord",
  "operation": "remove",
  "entityId": "3b7f2c9e-5d1a-4e8b-9c6f-0a2d4e6f8b1c/9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90",
  "baseVersion": 1
}
```

### Entity `watchedVideo`

A video the learner watched in the iOS app's Player. The account keeps the 50 most recently watched, and remembers the latest 100 videos it removed or pruned.

- **ID** (`entityId`): The YouTube video ID: 11 letters, digits, `-`, or `_`.
- **Read with:** `watch:read`
- **As it is now** (a `put`'s `data`): [`WatchedVideo`](#watchedvideo)

**`watch`**, with `watch:write`; `baseVersion` required. Send the whole video each time. A watch of a video the account has applies whatever its base version: the one with the later `watchedAt` sets the fields it sends, an older one sent late only fills fields the account lacks, and a field left out keeps the account's. A watch of a video the learner removed applies only at the removal's version, so one made before seeing the removal conflicts with the `delete`. A watch past the 50 newest prunes the oldest, which syncs as a `delete`.

Fields ([`WatchFields`](#watchfields)), and no others:

- `watchedAt` (string (date-time), required): ISO 8601, from 2000 on, by the device's clock; a time after the service's is taken as the service's.
- `title` (string, optional): Cut to 200 characters; control characters become spaces, and an empty one is left out.
- `author` (string, optional): The channel, held as `title` is.
- `duration` (number, optional, 0 to 10,000,000): The video's length, in seconds.
- `position` (number, optional, 0 to 10,000,000): Where the learner was, in seconds.
- `comprehension` (number, optional, 0 to 1): The share of the captions' words the learner knows.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000009",
  "entity": "watchedVideo",
  "operation": "watch",
  "entityId": "a1B2c3D4e5F",
  "baseVersion": 0,
  "fields": {
    "watchedAt": "2026-10-07T03:17:00Z",
    "title": "日本語の勉強",
    "author": "Zenbu",
    "duration": 212,
    "position": 30.5,
    "comprehension": 0.42
  }
}
```

**`remove`**, with `watch:write`; `baseVersion` not read. The learner removed the video. It always applies; removing one the account has not is applied and changes nothing.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-00000000000a",
  "entity": "watchedVideo",
  "operation": "remove",
  "entityId": "a1B2c3D4e5F"
}
```

### Entity `bookmarkedSentence`

A sentence the learner bookmarked in the iOS app's Translate tab, alone: never its conversation. An account holds at most 2,000.

- **ID** (`entityId`): The sentence's UUID, in either case; answers name it in lowercase.
- **Read with:** `translations:read`
- **As it is now** (a `put`'s `data`): [`BookmarkedSentence`](#bookmarkedsentence)

**`add`**, with `translations:write`; `baseVersion` not read. It always applies; adding one the account has changes nothing, and past 2,000 it's rejected `too_many_bookmarks`.

Fields ([`BookmarkFields`](#bookmarkfields)), and no others:

- `text` (string, required): The sentence as it was said: not blank, cut to 2,000 characters, with control characters made spaces.
- `translation` (string or null, optional): Its translation, cut to 4,000 characters, or null; null when left out.
- `language` (`"ja"` or `"en"`, required): The language it was said in.
- `bookmarkedAt` (string (date-time), required): ISO 8601, from 2000 on, by the device's clock; a time after the service's is taken as the service's.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-00000000000b",
  "entity": "bookmarkedSentence",
  "operation": "add",
  "entityId": "5e8d1c2b-7a6f-4d3e-8b9c-0f1e2d3c4b5a",
  "fields": {
    "text": "駅はどこですか",
    "translation": "Where is the station?",
    "language": "ja",
    "bookmarkedAt": "2026-10-07T03:20:00Z"
  }
}
```

**`remove`**, with `translations:write`; `baseVersion` required. It applies only at the bookmark's current version, so it removes only an add it saw: an add the remover never saw wins, and the remove conflicts. Removing one the account hasn't is applied.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-00000000000c",
  "entity": "bookmarkedSentence",
  "operation": "remove",
  "entityId": "5e8d1c2b-7a6f-4d3e-8b9c-0f1e2d3c4b5a",
  "baseVersion": 1
}
```

### Rejected mutations

A `rejected` result's `error.code`. A rejection is final for that mutation ID.

| Code | Meaning |
| --- | --- |
| `invalid_fields` | A field is missing, isn't one the operation takes, or is out of bounds. |
| `username_taken` | Another account has that username. |
| `unknown_entity` | The service syncs no such entity, as when it is older than the app. Keep the change, and send the entity again once the service knows it. |
| `unknown_operation` | The entity has no such operation. |
| `invalid_mutation` | `entityId` isn't in the entity's form, or `baseVersion` is missing from an operation that reads it. |
| `mutation_id_reused` | The ID was used for a different mutation. Give each mutation its own. |
| `already_exists` | The account has, or had, a list with that ID. |
| `unknown_list` | The list word's list isn't in the account, or was deleted. |
| `too_many_lists` | The account has 500 lists. |
| `list_full` | The list has 5,000 words. |
| `too_many_bookmarks` | The account has 2,000 bookmarked sentences. |
| `not_allowed` | The app's scopes don't include the operation's. |

## Error codes

Every `error.code` a route answers, with its status. Branch on the code; show or log the `message`.

| Code | Status | Routes |
| --- | --- | --- |
| `account_not_found` | 400 | [`POST /v1/auth/unlink-account`](#post-v1authunlink-account) |
| `account_not_linked` | 403 | [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp) |
| `apple_account_mismatch` | 400 | [`DELETE /v1/me`](#delete-v1me) |
| `apple_authorization_invalid` | 400 | [`DELETE /v1/me`](#delete-v1me) |
| `apple_authorization_needed` | 400 | [`DELETE /v1/me`](#delete-v1me) |
| `apple_unavailable` | 503 | [`DELETE /v1/me`](#delete-v1me) |
| `bad_request` | 400 | [`PATCH /v1/me`](#patch-v1me), [`DELETE /v1/me`](#delete-v1me), [`POST /v1/sync`](#post-v1sync) |
| `client_mismatch` | 403 | [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial) |
| `email_not_verified` | 403 | [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial) |
| `email_unavailable` | 503 | [`POST /v1/auth/email-otp/send-verification-otp`](#post-v1authemail-otpsend-verification-otp) |
| `failed_to_unlink_last_account` | 400 | [`POST /v1/auth/unlink-account`](#post-v1authunlink-account) |
| `insufficient_scope` | 403 | [`GET /v1/me`](#get-v1me), [`PATCH /v1/me`](#patch-v1me), [`DELETE /v1/me`](#delete-v1me), [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp), [`POST /v1/auth/link-social`](#post-v1authlink-social), [`POST /v1/auth/unlink-account`](#post-v1authunlink-account), [`GET /v1/auth/get-session`](#get-v1authget-session), [`GET /v1/auth/list-accounts`](#get-v1authlist-accounts), [`GET /v1/auth/list-sessions`](#get-v1authlist-sessions), [`POST /v1/auth/revoke-session`](#post-v1authrevoke-session), [`POST /v1/auth/revoke-sessions`](#post-v1authrevoke-sessions), [`POST /v1/auth/revoke-other-sessions`](#post-v1authrevoke-other-sessions) |
| `internal` | 500 | [`GET /v1/me`](#get-v1me), [`PATCH /v1/me`](#patch-v1me), [`DELETE /v1/me`](#delete-v1me), [`POST /v1/sync`](#post-v1sync) |
| `invalid_cursor` | 410 | [`POST /v1/sync`](#post-v1sync) |
| `invalid_email` | 400 | [`POST /v1/auth/email-otp/send-verification-otp`](#post-v1authemail-otpsend-verification-otp) |
| `invalid_fields` | 400 | [`PATCH /v1/me`](#patch-v1me) |
| `invalid_nonce` | 401 | [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial), [`POST /v1/auth/link-social`](#post-v1authlink-social) |
| `invalid_otp` | 400 | [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp) |
| `invalid_token` | 401 | [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial), [`POST /v1/auth/link-social`](#post-v1authlink-social) |
| `nonce_required` | 400 | [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial) |
| `oauth_link_error` | 401 | [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial) |
| `otp_expired` | 400 | [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp) |
| `provider_not_found` | 404 | [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial) |
| `session_not_fresh` | 403 | [`POST /v1/auth/link-social`](#post-v1authlink-social), [`POST /v1/auth/unlink-account`](#post-v1authunlink-account) |
| `sign_in_again` | 403 | [`DELETE /v1/me`](#delete-v1me) |
| `sign_in_again` | 401 | [`GET /v1/auth/token`](#get-v1authtoken) |
| `sign_in_only` | 400 | [`POST /v1/auth/email-otp/send-verification-otp`](#post-v1authemail-otpsend-verification-otp) |
| `too_large` | 413 | [`PATCH /v1/me`](#patch-v1me), [`DELETE /v1/me`](#delete-v1me), [`POST /v1/sync`](#post-v1sync) |
| `too_many_attempts` | 403 | [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp) |
| `too_many_requests` | 429 | [`GET /v1/me`](#get-v1me), [`PATCH /v1/me`](#patch-v1me), [`DELETE /v1/me`](#delete-v1me), [`POST /v1/sync`](#post-v1sync), [`POST /v1/auth/email-otp/send-verification-otp`](#post-v1authemail-otpsend-verification-otp), [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp), [`POST /v1/auth/sign-in/nonce`](#post-v1authsign-innonce), [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial), [`POST /v1/auth/link-social`](#post-v1authlink-social), [`POST /v1/auth/unlink-account`](#post-v1authunlink-account), [`GET /v1/auth/token`](#get-v1authtoken), [`GET /v1/auth/jwks`](#get-v1authjwks), [`GET /v1/auth/get-session`](#get-v1authget-session), [`POST /v1/auth/sign-out`](#post-v1authsign-out), [`GET /v1/auth/list-accounts`](#get-v1authlist-accounts), [`GET /v1/auth/list-sessions`](#get-v1authlist-sessions), [`POST /v1/auth/revoke-session`](#post-v1authrevoke-session), [`POST /v1/auth/revoke-sessions`](#post-v1authrevoke-sessions), [`POST /v1/auth/revoke-other-sessions`](#post-v1authrevoke-other-sessions) |
| `unauthorized` | 401 | [`GET /v1/me`](#get-v1me), [`PATCH /v1/me`](#patch-v1me), [`DELETE /v1/me`](#delete-v1me), [`POST /v1/sync`](#post-v1sync), [`POST /v1/auth/link-social`](#post-v1authlink-social), [`POST /v1/auth/unlink-account`](#post-v1authunlink-account), [`GET /v1/auth/token`](#get-v1authtoken), [`GET /v1/auth/list-accounts`](#get-v1authlist-accounts), [`GET /v1/auth/list-sessions`](#get-v1authlist-sessions), [`POST /v1/auth/revoke-session`](#post-v1authrevoke-session), [`POST /v1/auth/revoke-sessions`](#post-v1authrevoke-sessions), [`POST /v1/auth/revoke-other-sessions`](#post-v1authrevoke-other-sessions) |
| `unknown_client` | 400 | [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp), [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial) |
| `username_taken` | 409 | [`PATCH /v1/me`](#patch-v1me) |
| `validation_error` | 400 | [`POST /v1/auth/email-otp/send-verification-otp`](#post-v1authemail-otpsend-verification-otp), [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp), [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial), [`POST /v1/auth/link-social`](#post-v1authlink-social), [`POST /v1/auth/unlink-account`](#post-v1authunlink-account), [`POST /v1/auth/revoke-session`](#post-v1authrevoke-session) |
| `version_conflict` | 409 | [`PATCH /v1/me`](#patch-v1me) |

## Schemas

### Error

Every error. `code` is stable and machine-readable; `message` is for people and may change.

- `error` (object, required)
  - `code` (string, required)
  - `message` (string, required)

### ProfileUpdateFields

- `name` (string, optional): 1 to 100 characters once trimmed, with runs of spaces made one, kept in Unicode NFC, and no control or invisible format characters.
- `username` (string or null, optional): 3 to 30 letters a to z, digits, or underscores after Unicode NFKC, trimming, and lowercasing, unique across accounts; `null` removes it.

### WordFields

- `headword` (string, required, 1 to 200 characters): The word as the app shows it, kept in Unicode NFC and trimmed, with no control characters.
- `reading` (string, optional, at most 200 characters): Its reading, held as `headword` is. Empty when left out.

### ListCreateFields

- `name` (string, required): 1 to 500 characters once trimmed; control characters become spaces.
- `position` (integer, required, 0 to 100,000): Where the list sorts among the account's lists, lowest first.

### ListUpdateFields

- `name` (string, optional): 1 to 500 characters once trimmed; control characters become spaces.
- `position` (integer, optional, 0 to 100,000): Where the list sorts among the account's lists, lowest first.

### WatchFields

- `watchedAt` (string (date-time), required): ISO 8601, from 2000 on, by the device's clock; a time after the service's is taken as the service's.
- `title` (string, optional): Cut to 200 characters; control characters become spaces, and an empty one is left out.
- `author` (string, optional): The channel, held as `title` is.
- `duration` (number, optional, 0 to 10,000,000): The video's length, in seconds.
- `position` (number, optional, 0 to 10,000,000): Where the learner was, in seconds.
- `comprehension` (number, optional, 0 to 1): The share of the captions' words the learner knows.

### BookmarkFields

- `text` (string, required): The sentence as it was said: not blank, cut to 2,000 characters, with control characters made spaces.
- `translation` (string or null, optional): Its translation, cut to 4,000 characters, or null; null when left out.
- `language` (`"ja"` or `"en"`, required): The language it was said in.
- `bookmarkedAt` (string (date-time), required): ISO 8601, from 2000 on, by the device's clock; a time after the service's is taken as the service's.

### Profile

- `id` (string, required): The Zenbu user ID. It never changes.
- `name` (string, required)
- `username` (string or null, required)
- `email` (string, required): The account's email. It can't be changed here.
- `version` (integer, required, at least 1): The profile revision. It goes up by one with each change, and jumps to the time in milliseconds when the service starts on a restored backup; send it back as `baseVersion` to change the profile.
- `createdAt` (string (date-time), required)
- `updatedAt` (string (date-time), required)

### ProfileConflict

The profile changed since `baseVersion`. `current` is the profile as it is now.

- `error` (object, required)
  - `code` (`"version_conflict"`, required)
  - `message` (string, required)
- `current` ([`Profile`](#profile), required)

### ProfilePatch

- `baseVersion` (integer, required, at least 1): The profile `version` this change was made to. If the profile has changed since, nothing is changed and the answer is a conflict with the current profile.
- `name` (string, optional): 1 to 100 characters once trimmed, with runs of spaces made one and no control characters. Stored in Unicode NFC.
- `username` (string or null, optional): 3 to 30 letters a to z, digits, or underscores, unique across accounts. It's normalized first (Unicode NFKC, trimmed, lowercased), so `Kana_Fan` is `kana_fan`. `null` removes it.

### DeleteAccount

- `confirm` (`true`, required): The learner confirmed in the app.
- `appleAuthorizationCode` (string, optional, 1 to 4,096 characters): From a fresh Sign in with Apple, for an account that signs in with Apple. It's used once, to revoke the app's access with Apple.
- `appleRedirectUri` (string (uri), optional, at most 2,048 characters): The website only: the return URL its Sign in with Apple popup named, which Apple needs again to take the code. It must be on one of the website's origins. Without it, the website's code is taken as one Apple sent to GET /v1/auth/callback/apple.

### SyncAnswer

- `results` (array of [`MutationResult`](#mutationresult), required): One per mutation, in order.
- `changes` (array of [`Change`](#change), required): The entities that changed after the cursor, each once, as they are now, including the ones this request changed. On a page, lists come before their words, but a word can come on an earlier page than its list: hold it until the sync reaches `hasMore: false`.
- `cursor` (string, required): Opaque, and at most 200 characters. Keep it once the changes are applied, and send it next time.
- `hasMore` (boolean, required): More changes are waiting: sync again with the new cursor.

### MutationResult

`applied`: the change is in, at `version`. `conflict`: the entity changed since `baseVersion`, so nothing changed; `current` is it as it is now. `rejected`: the change can never apply as sent; `error.code` says why. A result is final: to try again, send a new mutation with a new ID.

One of:

- `status` `"applied"`
  - `id` (string, required)
  - `status` (`"applied"`, required)
  - `version` (integer, required)
- `status` `"conflict"`
  - `id` (string, required)
  - `status` (`"conflict"`, required)
  - `version` (integer, required)
  - `current` ([`Change`](#change), required)
- `status` `"rejected"`
  - `id` (string, required)
  - `status` (`"rejected"`, required)
  - `error` (object, required)
    - `code` (`"invalid_fields"`, `"username_taken"`, `"unknown_entity"`, `"unknown_operation"`, `"invalid_mutation"`, `"mutation_id_reused"`, `"already_exists"`, `"unknown_list"`, `"too_many_lists"`, `"list_full"`, `"too_many_bookmarks"`, or `"not_allowed"`, required)
    - `message` (string, required)

### Change

An entity as it is now (`put`, with `data`), or gone (`delete`): a deleted list, a word removed from a list, a video removed or past the newest the account keeps, a bookmark removed, or one never there. A cleared known word is a `put` with `known: false`.

One of:

- `entity` `"profile"`, `operation` `"put"`
  - `entity` (`"profile"`, required)
  - `entityId` (string, required)
  - `operation` (`"put"`, required)
  - `version` (integer, required)
  - `data` ([`Profile`](#profile), required)
- `entity` `"knownWord"`, `operation` `"put"`
  - `entity` (`"knownWord"`, required)
  - `entityId` (string, required)
  - `operation` (`"put"`, required)
  - `version` (integer, required)
  - `data` ([`KnownWord`](#knownword), required)
- `entity` `"list"`, `operation` `"put"`
  - `entity` (`"list"`, required)
  - `entityId` (string, required)
  - `operation` (`"put"`, required)
  - `version` (integer, required)
  - `data` ([`WordList`](#wordlist), required)
- `entity` `"listWord"`, `operation` `"put"`
  - `entity` (`"listWord"`, required)
  - `entityId` (string, required)
  - `operation` (`"put"`, required)
  - `version` (integer, required)
  - `data` ([`ListWord`](#listword), required)
- `entity` `"watchedVideo"`, `operation` `"put"`
  - `entity` (`"watchedVideo"`, required)
  - `entityId` (string, required)
  - `operation` (`"put"`, required)
  - `version` (integer, required)
  - `data` ([`WatchedVideo`](#watchedvideo), required)
- `entity` `"bookmarkedSentence"`, `operation` `"put"`
  - `entity` (`"bookmarkedSentence"`, required)
  - `entityId` (string, required)
  - `operation` (`"put"`, required)
  - `version` (integer, required)
  - `data` ([`BookmarkedSentence`](#bookmarkedsentence), required)
- `operation` `"delete"`
  - `entity` (`"knownWord"`, `"list"`, `"listWord"`, `"watchedVideo"`, or `"bookmarkedSentence"`, required)
  - `entityId` (string, required)
  - `operation` (`"delete"`, required)
  - `version` (integer, required)
  - `data` (null, required)

### KnownWord

- `itemId` (string, required)
- `headword` (string, required)
- `reading` (string, required)
- `known` (boolean, required)

### WordList

- `id` (string, required)
- `name` (string, required)
- `position` (integer, required)
- `createdAt` (string (date-time), required)

### ListWord

- `listId` (string, required)
- `itemId` (string, required)
- `headword` (string, required)
- `reading` (string, required)
- `addedAt` (string (date-time), required)

### WatchedVideo

- `videoId` (string, required)
- `title` (string or null, required): At most 200 characters: a longer one is cut, and control characters become spaces.
- `author` (string or null, required): The channel, held as title is.
- `duration` (number or null, required): Seconds.
- `position` (number or null, required): Seconds: where the learner was.
- `comprehension` (number or null, required): The share of the captions' words the learner knows, 0 to 1.
- `watchedAt` (string (date-time), required): When the learner last watched it, as the app said; a time after the service's is taken as the service's.

### BookmarkedSentence

- `id` (string, required)
- `text` (string, required): The sentence as it was said, at most 2000 characters: a longer one is cut, and control characters become spaces.
- `translation` (string or null, required): Its translation, at most 4000 characters, or null.
- `language` (`"ja"` or `"en"`, required): The language the sentence was said in.
- `bookmarkedAt` (string (date-time), required): When the learner bookmarked it, as the app said; a time after the service's is taken as the service's.

### SyncRequest

- `cursor` (string or null, optional, 1 to 200 characters): The `cursor` from the last answer whose changes the client applied. Leave it out, or send null, to start from the beginning.
- `limit` (integer, optional, 1 to 500): The most journal entries to read this time. Default 100.
- `mutations` (array of [`Mutation`](#mutation), optional, at most 50 items): Up to 50 changes made on the device, applied in order before the changes are read.

### Mutation

One change made on the device. `x-sync-entities` holds each entity and its operations, and `x-sync-rejections` each code a rejected result can carry.

- `id` (string, required, matching `^[A-Za-z0-9_-]{8,64}$`): A client-made ID, unique for each mutation, such as a UUID. Sending the same mutation again under its ID never applies it twice, and gets the same outcome: applied at the same version, a conflict with the entity as it is then, or a rejection with the same `error.code`. Reusing an ID for a different mutation is rejected with `mutation_id_reused`.
- `entity` (string, required, matching `^[A-Za-z][A-Za-z0-9_-]{0,63}$`): `profile`, `knownWord`, `list`, `listWord`, `watchedVideo`, `bookmarkedSentence`. Any other is rejected with `unknown_entity`, and the rest of the request still applies. A change the app's scopes don't allow is rejected with `not_allowed`, and the app reads only the entities its scopes do.
- `operation` (string, required, matching `^[A-Za-z][A-Za-z0-9_-]{0,63}$`): One of the entity's operations, in `x-sync-entities`, with the scopes each needs, the fields it takes, and whether it reads `baseVersion`. Any other is rejected with `unknown_operation`.
- `entityId` (string, optional, matching `^[^\p{Cc}\p{Cf}\s]{1,200}$`):
  - `profile`: The account's ID, or left out.
  - `knownWord`: The item: a Language Reference ID (32 lowercase hex digits), or `kanji:` and one kanji, kept in Unicode NFC.
  - `list`: Its UUID, in either case; answers name it in lowercase.
  - `listWord`: The list's UUID, a slash, and the item: `<list>/<item>`.
  - `watchedVideo`: The YouTube video ID: 11 letters, digits, `-`, or `_`.
  - `bookmarkedSentence`: The sentence's UUID, in either case; answers name it in lowercase.
- `baseVersion` (integer, optional, at least 0): The version of the entity the change was made to, or 0 for one the client has never seen. If the entity has changed since, what happens is the operation's rule, in `x-sync-entities`, which also says which operations read it.
- `fields` (map to string, number, boolean, or null, optional): What the operation sets: the operation's fields, in `x-sync-entities`. Each value is a string, number, boolean, or null.

### SignIn

- `token` (string, required): The session's bare token. Keep the signed one from the `set-auth-token` header instead: it is the refresh token.
- `user` ([`SignedInUser`](#signedinuser), required)

### SignedInUser

Who signed in. GET /v1/me has the profile, with the username and version.

- `id` (string, required)
- `name` (string, required)
- `email` (string, required)
- `emailVerified` (boolean, required)
- `image` (string or null, required)
- `createdAt` (string (date-time), required)
- `updatedAt` (string (date-time), required)

### WebSignIn

- `url` (string (uri), required)
- `redirect` (`true`, required)

### IdToken

- `token` (string, required): The ID token Sign in with Apple or Google gave the device.
- `nonce` (string, required): The nonce from POST /v1/auth/sign-in/nonce, passed to Apple or Google.
- `user` (object, optional): The name Apple gives an app or the website only on the learner's first sign-in to it. Apple's token has none, so it names a new account.
  - `name` (object, optional)
    - `firstName` (string, optional)
    - `lastName` (string, optional)

### Session

- `id` (string, required)
- `userId` (string, required)
- `token` (string, required): The session's bare token, which names it to POST /v1/auth/revoke-session. It signs nothing in: only the signed one in `set-auth-token` does.
- `expiresAt` (string (date-time), required)
- `createdAt` (string (date-time), required)
- `updatedAt` (string (date-time), required)
- `ipAddress` (string or null, required)
- `userAgent` (string or null, required)

### Identity

- `id` (string, required)
- `providerId` (string, required): `apple`, `google`, or `email`.
- `accountId` (string, required)
- `userId` (string, required)
- `createdAt` (string (date-time), required)
- `updatedAt` (string (date-time), required)
