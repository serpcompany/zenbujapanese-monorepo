# Building an app on the Zenbu account

How an app, such as the Zenbu iOS app or Tomodachi, signs a learner in to their Zenbu account and
keeps its copy of their known words and lists in step. The contract is
[`apps/account-api/openapi.json`](../../apps/account-api/openapi.json): every route, field, answer, and
error code. This guide is the order to use them in, and the rules no schema shows. How the service
works inside is [`account-api.md`](account-api.md).

Every app stays local-first: everything works signed out and offline, the device's copy is what the
app shows, and the account only carries changes between devices and apps (#374).

## The host

`https://api.zenbujapanese.com`, and `https://api-staging.zenbujapanese.com` for staging. Every
route is under `/v1`. An error is `{ "error": { "code": "...", "message": "..." } }`: branch on
`code`, show or log `message`.

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

## Signing in

Send `X-Zenbu-Client: <your app's ID>` with every sign-in. Without it, or with an ID the service
doesn't list, a sign-in is refused (`unknown_client`).

- **Sign in with Apple:**
  1. `POST /v1/auth/sign-in/nonce` for a nonce.
  2. Ask Apple, passing the nonce's SHA-256 as Apple's nonce.
  3. `POST /v1/auth/sign-in/social` with `{ "provider": "apple", "idToken": { "token": "<Apple's
     ID token>", "nonce": "<the nonce>" } }`.

  A token made for another app's bundle ID is refused (`client_mismatch`).
- **Google:** the same, with Google's ID token and the nonce itself.
- **An emailed code:** `POST /v1/auth/email-otp/send-verification-otp` with
  `{ "email": "...", "type": "sign-in" }`, then `POST /v1/auth/sign-in/email-otp` with the email
  and the code.

A sign-in answers the learner, and the **session token** in the `set-auth-token` header. Keep it in
the Keychain: it's the refresh token, good for 60 days from its last use. Send it only to
`/v1/auth`. An app with no `account` scope uses only the sign-in routes, `GET /v1/auth/token`, and
`POST /v1/auth/sign-out`; the rest manage the account and need `account` or `profile`. At most five
codes go to one email in 10 minutes (`429`). The same Apple account, Google account, or email signs in to the same Zenbu account in
every app, as long as the account has that way in; an email that already has an account through
another way is refused until the learner adds it there, signed in (`oauth_link_error`,
`account_not_linked`).

## Access tokens

`GET /v1/auth/token`, with the session token as `Authorization: Bearer`, answers a 15-minute access
token. Send that, never the session token, to `/v1/me`, `/v1/sync`, and the dictionary service.
Get a new one when it's about to expire or a request answers `401`. If `/v1/auth/token` answers
`401` (`unauthorized`, or `sign_in_again` for a session that belongs to no listed app), the session
is over: sign in again.

The token names the account (`sub`), your app (`azp`), and its scopes (`scope`). A route your
scopes don't cover answers `403 insufficient_scope`; a sync change they don't allow is rejected
(`not_allowed`).

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
   - `rejected`: undo the change on the device, unless it was part of the first upload (below).
     To try something else, queue a new change with a new `id`; never send a result's `id` again
     with a different change.
4. **Apply each change in `changes`** over your copy, by entity and `entityId`: `put` is the
   entity as it is now, `delete` is gone. Keep the `cursor`. While `hasMore` is true, sync again.
   A list word can arrive a page before its list: hold it until `hasMore` is false. An entity
   with a change still queued keeps the device's copy for now: hold the account's copy until that
   change's result. If the change is applied or conflicts, its result settles the entity; if it's
   rejected, take the held copy.
5. **On `410 invalid_cursor`**, sync again with no cursor, and take what comes back over your copy;
   queued changes still go.

**The first upload.** The first time a device syncs to an account, queue what the device has:
each known word as a `mark`, each list as a `create`, and each list word as an `add`, all at base
version 0, then sync with no cursor. The device had these before the account did, so a rejection
of one undoes nothing on the device: a list the account already has is rejected `already_exists`,
and the account's copy comes down.

### The rules, from your side

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
  - **Favorites has one ID in every app: `2177c773-9e88-410f-9348-6cefaebe0a93`.** An app that
    starts learners with a Favorites list gives it this ID, so every device's Favorites is one list
    in the account (lists are the account's own, so the ID can't collide with another learner's).
    On a second device, its `create` is rejected (`already_exists`): keep the list, take the
    account's copy as it comes down, and its words' adds still apply. If the account's copy comes
    down deleted, the device's Favorites never belonged to it: keep it and its words as a new list,
    under a new ID, rather than dropping them, even though an `add` to the deleted list was
    rejected (`unknown_list`). Any other list the account deleted is deleted on the device. The
    iOS app moves an older install's Favorites to this ID before its first upload.
- **List words**, `<list>/<item>`:
  - An add always applies.
  - A remove applies only if your app had the latest add: an add from elsewhere wins.
  - An add to a list that's gone is rejected (`unknown_list`): undo it.

## Deleting the account

Every app that signs in offers deleting the account (App Review guideline 5.1.1(v)):

1. Ask the learner to confirm, and to sign in again: deleting needs a sign-in from the last 10
   minutes (`403 sign_in_again`).
2. If the account signs in with Apple, sign in with Apple, and keep the **authorization code**
   Apple gives with that sign-in.
3. `DELETE /v1/me` with `{ "confirm": true }`, and `"appleAuthorizationCode"` for an Apple
   account: the code from signing in with the Apple ID the account uses. The service revokes your
   app's Apple access with it before deleting. `apple_authorization_needed`,
   `apple_authorization_invalid`, `apple_account_mismatch`, and `503 apple_unavailable` delete
   nothing: sign in with Apple again for a new code, and try again.
4. On `200`, sign out on the device: forget the session token and the cursor, and keep the
   device's data. The account, and everything it synced, is gone; signing in again makes a new
   one.

## Signing out

`POST /v1/auth/sign-out` with the session token, then forget it. Keep the device's copy: it's the
learner's.

An app may also keep its queue, cursor, and entity versions for the account it signed out of (the
sign-in's user ID), and keep queuing changes, with their base versions, while signed out, as the
iOS app does. When the same account signs in again, sync from them: the changes apply by the usual
rules. When another account signs in, drop them, and send that account the device's copy as a
first upload.
