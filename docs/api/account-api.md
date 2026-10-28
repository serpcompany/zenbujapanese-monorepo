# Zenbu account service

Written from [`apps/account-api/openapi.json`](../../apps/account-api/openapi.json), the contract's version 1, by `packages/node-service/src/api-reference.ts`, and a test fails when the two differ. Don't edit it by hand: after changing a route, run `pnpm test -u` in `apps/account-api`, and commit both files.

How a client uses these routes, in order, is the [client guide](../agents/account-clients.md).

Accounts, sign-in, profiles, and sync for every Zenbu app (ADR 0013). Sign-in is Better Auth's, under /v1/auth; a test holds each of its answers to this contract.

- **Errors.** Every error is `{ "error": { "code": "...", "message": "..." } }`. Branch on `code`, which is stable; `message` is for people and may change. A route may answer a code it doesn't list here, such as one from a Better Auth upgrade: handle it by its status.
- **Apps.** A sign-in names its app in `X-Zenbu-Client`, unless it comes from one of the website's origins; the app decides the scopes its tokens carry.
- **Bodies** are JSON, at most 64 KB (`413 too_large`), but a photo's upload, which is the photo's file.
- **Emails** are in the language a request names in `Content-Language`, `en` or `ja`, which needs no entry in `Access-Control-Allow-Headers`. Without one, they are in the language the account was made with, or English. An account made with one keeps it, through Google's web sign-in too.
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
| [`GET /v1/sync/{entity}`](#get-v1syncentity) | `accessToken` | The account's entities of one kind, as they are now |
| [`GET /v1/me/subscription`](#get-v1mesubscription) | `accessToken` with `subscription` | The account's subscription, and where it's managed |
| [`GET /v1/me/subscription/plans`](#get-v1mesubscriptionplans) | `accessToken` with `subscription` | The website's plans, with their prices |
| [`POST /v1/me/subscription/checkout`](#post-v1mesubscriptioncheckout) | `accessToken` with `subscription` | Start a subscription on the website, on Stripe Checkout |
| [`POST /v1/me/subscription/portal`](#post-v1mesubscriptionportal) | `accessToken` with `subscription` | Manage a website subscription, in Stripe's customer portal |
| [`POST /v1/me/subscription/apple`](#post-v1mesubscriptionapple) | `accessToken` with `subscription` | Tell the service about an App Store purchase or restore |
| [`POST /v1/webhooks/stripe`](#post-v1webhooksstripe) | none | Stripe's events, for subscriptions bought on the website |
| [`POST /v1/webhooks/apple`](#post-v1webhooksapple) | none | App Store Server Notifications V2, for subscriptions bought in the app |
| [`PUT /v1/photos/{photoId}`](#put-v1photosphotoid) | `accessToken` with `photos:write`, or `accessToken` with `profile` | Upload a photo's file |
| [`GET /v1/photos/{photoId}`](#get-v1photosphotoid) | `accessToken` with `photos:read`, or `accessToken` with `profile` | Download a photo's file |
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

**Header parameters:**

- `content-language` (string, optional): The language of the page the request comes from: `ja` or `en`. The email the request sends is in it, and an account the request makes keeps it for the emails sent later without one. Any other value, or none, means the account's language, or English. `Accept-Language` is never read.

**Body** (JSON, required, [`DeleteAccount`](#deleteaccount)):

- `confirm` (`true`, required): The learner confirmed in the app.
- `appleAuthorizationCode` (string, optional, 1 to 4,096 characters): From a fresh Sign in with Apple, for an account that signs in with Apple. It's used once, to revoke the app's access with Apple.
- `appleRedirectUri` (string (uri), optional, at most 2,048 characters): The website only: the return URL its Sign in with Apple popup named, which Apple needs again to take the code. It must be on one of the website's origins. Without it, the website's code is taken as one Apple sent to GET /v1/auth/callback/apple.

**Answers:**

- **200**, { status: `"deleted"`, appStoreSubscriptionContinues: boolean }: Deleted.
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
- **503** `billing_unavailable`: Canceling the account's website subscription didn't finish, and nothing was deleted. Try again later; an account that signs in with Apple signs in with Apple again first, since its code was used.

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
- **402** `subscription_required`: Syncing and the account's other cloud features need a subscription, and this account has none that is active. Nothing was applied: keep the changes on the device, and show the paywall. GET /v1/me/subscription says what to offer.
- **410** `invalid_cursor`: The cursor isn't one this service gave this account, is past what it holds, as after a restore, or the account has since forgotten a note, photo, or photo word's deletion past it. Nothing was applied. Sync again with no cursor, as a full read: keep what comes back, and once `hasMore` is false, drop each note, photo, and photo word your app holds a version for that the read didn't bring. A read from no cursor is never refused for what the account forgot before it began; if one is, back off rather than start again at once.
- **413** `too_large`: The body is over 64 KB.
- **429** `too_many_requests`: This account sent more than 120 requests here from this app in the current minute, or the app more than its limit from all its accounts together. Wait the seconds `Retry-After` says.
- **500** `internal`: The service failed, and nothing says why. The mutations before the failure stand: send the same request again later, backing off, and those answer as before.

### `GET /v1/sync/{entity}`

The account's entities of one kind, as they are now.

Reads what sync would answer of one kind alone, for a client that keeps no copy of its own, such as the website: every list, say, or every list word of one word. Changes go through POST /v1/sync, as every app's do. It needs the kind's read scope (`x-sync-entities`), and counts against sync's limit.

**Auth:** `accessToken`.

**Path parameters:**

- `entity` (`"profile"`, `"knownWord"`, `"list"`, `"listWord"`, `"watchedVideo"`, `"bookmarkedSentence"`, `"wordNote"`, `"photo"`, `"photoWord"`, `"profilePhoto"`, `"setting"`, or `"recentSearch"`, required): The kind, as `x-sync-entities` names it.

**Query parameters:**

- `cursor` (string, optional, 1 to 200 characters): The `cursor` the last read of this kind answered, to read what changed since. Leave it out to read every one. A sync's cursor isn't one, nor another kind's.
- `limit` (integer, optional, 1 to 500): The most entities to answer this time. Default 100.
- `item` (string, optional, 1 to 200 characters): Only those about one word or kanji: a Language Reference ID, `kanji:` and the kanji, or, for a note, the `wn1:` note identity it was saved under, and every deleted note, which keeps no item (a note moved to another word since isn't in a later read about the first). For `knownWord`, `listWord`, `photoWord`, `wordNote` only. A cursor from a read with `item` reads only that item.

**Answers:**

- **200**, [`KindAnswer`](#kindanswer): The entities.
- **400** `bad_request`: The kind isn't one the service syncs, or the query is out of bounds. `item` is only for `knownWord`, `listWord`, `photoWord`, `wordNote`, and must be in the form the kind's entity ID names it.
- **401** `unauthorized`: No access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.
- **402** `subscription_required`: Syncing and the account's other cloud features need a subscription, and this account has none that is active. Nothing was applied: keep the changes on the device, and show the paywall. GET /v1/me/subscription says what to offer.
- **403** `insufficient_scope`: This app's access to the account doesn't include the kind's read scope.
- **410** `invalid_cursor`: The cursor isn't one this service gave this account for this kind and item, or the account has since forgotten a deletion past it. Read again with no cursor.
- **429** `too_many_requests`: This account sent more than 120 requests here from this app in the current minute, or the app more than its limit from all its accounts together. Wait the seconds `Retry-After` says.
- **500** `internal`: The service failed, and nothing says why. Try again later, backing off.

### `GET /v1/me/subscription`

The account's subscription, and where it's managed.

Read from the service's own records, which each store's events keep current. One subscription stands for the account, wherever it was bought; the app shows the paywall when `cloudAccess` is `subscription_required`, and offers a subscription only when `canSubscribe` is true.

**Auth:** `accessToken` with `subscription`.

**Answers:**

- **200**, [`Subscription`](#subscription): The subscription.
- **401** `unauthorized`: No access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.
- **403** `insufficient_scope`: This app's access to the account doesn't include `subscription`.
- **429** `too_many_requests`: This account sent more than 30 requests here from this app in the current minute, or the app more than its limit from all its accounts together. Wait the seconds `Retry-After` says.
- **500** `internal`: The service failed, and nothing says why. Try again later, backing off.

### `GET /v1/me/subscription/plans`

The website's plans, with their prices.

What the website's paywall shows before Checkout: each of `offers.website` with Stripe's name, price, and period, read from Stripe on each request, and the free trial this account would get.

**Auth:** `accessToken` with `subscription`.

**Answers:**

- **200**, [`WebsitePlans`](#websiteplans): The plans.
- **401** `unauthorized`: No access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.
- **403** `insufficient_scope`: This app's access to the account doesn't include `subscription`.
- **429** `too_many_requests`: This account sent more than 30 requests here from this app in the current minute, or the app more than its limit from all its accounts together. Wait the seconds `Retry-After` says.
- **500** `internal`: The service failed, and nothing says why. Try again later, backing off.
- **503** `billing_unavailable`: The store didn't answer, or subscribing there isn't set up in this environment. Nothing changed. Try again later.

### `POST /v1/me/subscription/checkout`

Start a subscription on the website, on Stripe Checkout.

Answers the URL of Stripe's hosted Checkout page for one of `offers.website`. The subscription starts when Stripe tells the service it's paid, a few seconds after the learner pays, so the website reads GET /v1/me/subscription again on its success page.

**Auth:** `accessToken` with `subscription`.

**Header parameters:**

- `content-language` (string, optional): The page's language, `ja` or `en`, which Stripe's page shows. Any other, or none, lets Stripe choose from the browser.

**Body** (JSON, required, [`CheckoutRequest`](#checkoutrequest)):

- `price` (string, optional, 1 to 255 characters): One of `offers.website`. It may be left out when the website offers one price.
- `successUrl` (string (uri), required, at most 2,048 characters): Where Stripe sends the learner after paying, on one of the website's origins.
- `cancelUrl` (string (uri), required, at most 2,048 characters): Where Stripe sends the learner who goes back without paying, on one of the website's origins.

**Answers:**

- **200**, [`Redirect`](#redirect): Open the URL.
- **400** `bad_request`: The body is not JSON, or not this shape. Or: A URL is on none of the website's origins.
- **400** `unknown_price`: That price isn't one the website offers, or none was named and it offers several.
- **401** `unauthorized`: No access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.
- **403** `insufficient_scope`: This app's access to the account doesn't include `subscription`.
- **409** `already_subscribed`: The account has a subscription that is still running, or a first payment still pending, here or in the App Store. Nothing was started.
- **409** `payment_confirming`: The account's last checkout was paid and Stripe hasn't confirmed it to the service yet. Nothing was started; read GET /v1/me/subscription again shortly.
- **413** `too_large`: The body is over 64 KB.
- **429** `too_many_requests`: This account sent more than 30 requests here from this app in the current minute, or the app more than its limit from all its accounts together. Wait the seconds `Retry-After` says.
- **500** `internal`: The service failed, and nothing says why. Try again later, backing off.
- **503** `billing_unavailable`: The store didn't answer, or subscribing there isn't set up in this environment. Nothing changed. Try again later.

### `POST /v1/me/subscription/portal`

Manage a website subscription, in Stripe's customer portal.

**Auth:** `accessToken` with `subscription`.

**Header parameters:**

- `content-language` (string, optional): The page's language, `ja` or `en`, which Stripe's page shows. Any other, or none, lets Stripe choose from the browser.

**Body** (JSON, required, [`PortalRequest`](#portalrequest)):

- `returnUrl` (string (uri), required, at most 2,048 characters): Where Stripe's portal sends the learner back to, on one of the website's origins.

**Answers:**

- **200**, [`Redirect`](#redirect): Open the URL.
- **400** `bad_request`: The body is not JSON, or not this shape. Or: A URL is on none of the website's origins.
- **401** `unauthorized`: No access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.
- **403** `insufficient_scope`: This app's access to the account doesn't include `subscription`.
- **404** `no_subscription`: The account has never subscribed on the website. An App Store subscription is managed in the App Store.
- **413** `too_large`: The body is over 64 KB.
- **429** `too_many_requests`: This account sent more than 30 requests here from this app in the current minute, or the app more than its limit from all its accounts together. Wait the seconds `Retry-After` says.
- **500** `internal`: The service failed, and nothing says why. Try again later, backing off.
- **503** `billing_unavailable`: The store didn't answer, or subscribing there isn't set up in this environment. Nothing changed. Try again later.

### `POST /v1/me/subscription/apple`

Tell the service about an App Store purchase or restore.

The app sends each verified transaction StoreKit 2 gives it, so the subscription applies at once; App Store Server Notifications keep it current after. A purchase carries the account's `appAccountToken`, and belongs to that account. One without a token, such as an offer code redeemed in the App Store, belongs to the first account that sends it.

**Auth:** `accessToken` with `subscription`.

**Body** (JSON, required, [`AppleTransaction`](#appletransaction)):

- `signedTransaction` (string, required, 1 to 16,384 characters): StoreKit 2's `Transaction.jwsRepresentation`, after a purchase, a restore, or an update from `Transaction.updates`.

**Answers:**

- **200**, [`Subscription`](#subscription): The subscription, with the purchase applied.
- **400** `bad_request`: The body is not JSON, or not this shape.
- **400** `invalid_transaction`: Apple didn't sign it for this app and environment, or it isn't an auto-renewable subscription.
- **400** `unknown_product`: It's for a product the app doesn't offer.
- **401** `unauthorized`: No access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.
- **403** `insufficient_scope`: This app's access to the account doesn't include `subscription`.
- **409** `subscription_belongs_to_another_account`: This Apple ID's subscription belongs to another Zenbu account. Sign in to that account to use it.
- **413** `too_large`: The body is over 64 KB.
- **429** `too_many_requests`: This account sent more than 30 requests here from this app in the current minute, or the app more than its limit from all its accounts together. Wait the seconds `Retry-After` says.
- **500** `internal`: The service failed, and nothing says why. Try again later, backing off.
- **503** `billing_unavailable`: The store didn't answer, or subscribing there isn't set up in this environment. Nothing changed. Try again later.

### `POST /v1/webhooks/stripe`

Stripe's events, for subscriptions bought on the website.

Stripe's webhook endpoint. The signature in `Stripe-Signature` is checked before anything in the body is read, and each event is recorded once by its ID: a repeat answers 200 and changes nothing. The service takes `checkout.session.*`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`, `refund.*`, `charge.dispute.*`, and `radar.early_fraud_warning.created`, reads each subscription's state from Stripe as it is then, and records every charge, refund, dispute, and fraud warning in its ledger.

**Auth:** none.

**Header parameters:**

- `stripe-signature` (string, optional): Stripe's signature of the body, checked with `STRIPE_WEBHOOK_SECRET`.

**Body** (JSON, required, [`StripeEvent`](#stripeevent)):

- `id` (string, required)
- `type` (string, required)

**Answers:**

- **200**, [`Received`](#received): Taken, or a repeat of an event already taken, which changed nothing.
- **400** `invalid_signature`: Stripe didn't sign the body, or it is for another app or environment. Nothing was recorded.
- **400** `unreadable_event`: Stripe signed it, but it isn't in a format the service reads, such as a thin event. Nothing was recorded; the endpoint must send Snapshot events.
- **404** `not_found`: This environment doesn't take this store's events.
- **413** `too_large`: The body is over 256 KB.
- **500** `internal`: The event failed and was not recorded, so the store sends it again.
- **503** `try_again`: The service couldn't check or apply the event now, and recorded nothing. The store sends it again.

### `POST /v1/webhooks/apple`

App Store Server Notifications V2, for subscriptions bought in the app.

The App Store's notification URL. The signed payload is checked with Apple's App Store Server Library against Apple's root certificate, for the app's bundle ID and the environments the service takes, before anything in it is read, and each notification is recorded once by its `notificationUUID`: a repeat answers 200 and changes nothing.

**Auth:** none.

**Body** (JSON, required, [`AppleNotification`](#applenotification)):

- `signedPayload` (string, required): App Store Server Notifications V2's signed payload, checked with Apple's root certificate.

**Answers:**

- **200**, [`Received`](#received): Taken, or a repeat of an event already taken, which changed nothing.
- **400** `invalid_signature`: Apple didn't sign the body, or it is for another app or environment. Nothing was recorded.
- **404** `not_found`: This environment doesn't take this store's events.
- **413** `too_large`: The body is over 256 KB.
- **500** `internal`: The event failed and was not recorded, so the store sends it again.
- **503** `try_again`: The service couldn't check or apply the event now, and recorded nothing. The store sends it again.

### `PUT /v1/photos/{photoId}`

Upload a photo's file.

The file of a Media Library photo or the profile photo, before the sync change that names it (`photo`'s `add`, or `profilePhoto`'s `set`). The body is the file's bytes, at most 12 MB, JPEG, PNG, HEIC, HEIF, AVIF, GIF, WebP, TIFF, or BMP; the service reads the type from the bytes, not from `Content-Type`, and keeps them as they are. Uploading a file the account holds changes nothing, unless its storage lost it, which this puts back. A file no photo names 24 hours after its upload is deleted. An account holds at most 1,000 files, the profile photo's and an emptied photo's for its 30 days included. An app with only `profile` holds at most 2 files it uploaded, the profile photo and the one replacing it, which may be ones the Media Library holds too; it's answered as though the library held nothing, `201` or `409`, so it learns nothing of the library, and may set only a file it uploaded as the profile photo.

**Auth:** `accessToken` with `photos:write`, or `accessToken` with `profile`.

**Path parameters:**

- `photoId` (string, required, matching `^[0-9a-f]{64}$`): The SHA-256 of the photo's file, in 64 lowercase hex digits.

**Body** (`image/*`, required): The file's bytes.

**Answers:**

- **200**, [`PhotoFile`](#photofile): The account already held this file.
- **201**, [`PhotoFile`](#photofile): The file is kept.
- **400** `bad_request`: `photoId` is not 64 lowercase hex digits.
- **400** `photo_digest_mismatch`: The bytes' SHA-256 isn't `photoId`: the upload was cut short or changed.
- **401** `unauthorized`: No access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.
- **402** `subscription_required`: Photo files, like syncing, need a subscription, and this account has none that is active. Nothing was kept or sent: keep the photo on the device, and show the paywall. GET /v1/me/subscription says what to offer.
- **403** `insufficient_scope`: This app's access to the account doesn't include `photos:write` or `profile`.
- **409** `too_many_photos`: The account holds 1,000 files, or an app with only `profile` holds the 2 it may. Keep the photo on the device; send it again once a photo is deleted, or set the profile photo to one of the two.
- **413** `too_large`: The file is over 12 MB.
- **415** `unsupported_photo`: The file isn't a JPEG, PNG, HEIC, HEIF, AVIF, GIF, WebP, TIFF, or BMP image.
- **429** `too_many_requests`: This account sent more than 300 requests here from this app in the current minute, the app more than its limit from all its accounts together, or the service is taking 4 uploads at once, 2 from this account. Wait the seconds `Retry-After` says.
- **500** `internal`: The service failed, and nothing says why. Try again later, backing off.
- **503** `photos_unavailable`: This service keeps no photos here yet. Keep the photo on the device, and try again later.

### `GET /v1/photos/{photoId}`

Download a photo's file.

The bytes uploaded, with their type, streamed. A file never changes under its ID, so the answer may be kept for good. An app with `photos:read` reads every file the account holds; one with only `profile` reads only the profile photo's.

**Auth:** `accessToken` with `photos:read`, or `accessToken` with `profile`.

**Path parameters:**

- `photoId` (string, required, matching `^[0-9a-f]{64}$`): The SHA-256 of the photo's file, in 64 lowercase hex digits.

**Answers:**

- **200**, `image/*`: The file.
- **400** `bad_request`: `photoId` is not 64 lowercase hex digits.
- **401** `unauthorized`: No access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.
- **402** `subscription_required`: Photo files, like syncing, need a subscription, and this account has none that is active. Nothing was kept or sent: keep the photo on the device, and show the paywall. GET /v1/me/subscription says what to offer.
- **403** `insufficient_scope`: This app's access to the account doesn't include `photos:read` or `profile`.
- **404** `not_found`: The account holds no file with that ID, or this app's scopes don't reach it. Never delete a photo for it: if the account deleted it, the photo's `delete` comes down in sync.
- **404** `photo_file_missing`: The account names the file, but its storage hasn't it, as after a restore. Upload it again if the device has it; otherwise try again later. Never delete the photo for it.
- **429** `too_many_requests`: This account sent more than 300 requests here from this app in the current minute, the app more than its limit from all its accounts together, or the account or the service is sending as many files as it may at once. Wait the seconds `Retry-After` says.
- **500** `internal`: The service failed, and nothing says why. Try again later, backing off.
- **503** `photos_unavailable`: This service keeps no photos here yet. Keep the photo on the device, and try again later.

**Headers:**

- A 200 sends `Cache-Control`: `private, max-age=31536000, immutable`: the file under this ID never changes.
- A 200 sends `ETag`: The photo ID, quoted.
- A 200 sends `Content-Disposition`: `attachment`, with the photo ID as its file name.
- A 200 sends `X-Content-Type-Options`: `nosniff`.

### `POST /v1/auth/email-otp/send-verification-otp`

Email a sign-in code.

Answers the same whether or not the email has an account. Five codes per address in 10 minutes.

**Auth:** none.

**Header parameters:**

- `content-language` (string, optional): The language of the page the request comes from: `ja` or `en`. The email the request sends is in it, and an account the request makes keeps it for the emails sent later without one. Any other value, or none, means the account's language, or English. `Accept-Language` is never read.

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

- `content-language` (string, optional): The language of the page the request comes from: `ja` or `en`. The email the request sends is in it, and an account the request makes keeps it for the emails sent later without one. Any other value, or none, means the account's language, or English. `Accept-Language` is never read.
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

- `content-language` (string, optional): The language of the page the request comes from: `ja` or `en`. The email the request sends is in it, and an account the request makes keeps it for the emails sent later without one. Any other value, or none, means the account's language, or English. `Accept-Language` is never read.
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

**Header parameters:**

- `content-language` (string, optional): The language of the page the request comes from: `ja` or `en`. The email the request sends is in it, and an account the request makes keeps it for the emails sent later without one. Any other value, or none, means the account's language, or English. `Accept-Language` is never read.

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

**Header parameters:**

- `content-language` (string, optional): The language of the page the request comes from: `ja` or `en`. The email the request sends is in it, and an account the request makes keeps it for the emails sent later without one. Any other value, or none, means the account's language, or English. `Accept-Language` is never read.

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

The learner's state for a word or a kanji: `unknown`, `learning`, or `known`, one at a time. An app that shows Learning changes it with `set`; `mark` and `clear` are for an app that sees only whether a word is known, and read a Learning word as not known. A word that goes back to Unknown stays, as a `put` with `state: "unknown"` and `known: false`.

- **ID** (`entityId`): The item: a Language Reference ID (32 lowercase hex digits), or `kanji:` and one kanji, kept in Unicode NFC.
- **Read with:** `known:read`
- **As it is now** (a `put`'s `data`): [`KnownWord`](#knownword)

**`set`**, with `known:write`; `baseVersion` required. Moves the word to `state`, from any state to any other. It applies only if the word is still at `baseVersion` (0 for one the account never had), as `mark` and `clear` do, or conflicts with the word as it is now. Setting the state the word has is applied and changes nothing.

Fields ([`WordStateFields`](#wordstatefields)):

- `state` (`"unknown"`, `"learning"`, or `"known"`, required): The state the word moves to.
- `headword` (string, optional, 1 to 200 characters): The word as the app shows it, kept in Unicode NFC and trimmed, with no control characters. Needed for `learning` and `known`; for `unknown` it is not read, and the word keeps the text it has.
- `reading` (string, optional, at most 200 characters): Its reading, held as `headword` is. For `learning` and `known`, empty when left out; for `unknown` it is not read, and the word keeps the reading it has.
- `stateChangedAt` (string (date-time), optional): When the word moved to the state, by the device's clock: ISO 8601, from 2000 on; a time after the service's is taken as the service's. Left out, it is the service's time when the change applies. A change that leaves the state as it was keeps the earlier time.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000002",
  "entity": "knownWord",
  "operation": "set",
  "entityId": "2b4d6f8a0c1e3f5a7b9d1f3a5c7e9b0d",
  "baseVersion": 0,
  "fields": {
    "state": "learning",
    "headword": "食べる",
    "reading": "たべる"
  }
}
```

**`mark`**, with `known:write` or `known:mark`; `baseVersion` required. Makes the word Known, from Unknown or Learning: the same change as `set` with `state: "known"`. It applies only if the word is still at `baseVersion` (0 for one the account never had), so a mark made before the learner cleared the word loses to the clear, and one made after seeing it wins. Marking a known word is applied and changes nothing.

Fields ([`KnownWordFields`](#knownwordfields)):

- `headword` (string, required, 1 to 200 characters): The word as the app shows it, kept in Unicode NFC and trimmed, with no control characters.
- `reading` (string, optional, at most 200 characters): Its reading, held as `headword` is. Empty when left out.
- `stateChangedAt` (string (date-time), optional): When the word moved to the state, by the device's clock: ISO 8601, from 2000 on; a time after the service's is taken as the service's. Left out, it is the service's time when the change applies. A change that leaves the state as it was keeps the earlier time.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000003",
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

**`clear`**, with `known:write`; `baseVersion` required. Makes a known word Unknown. It applies only at the word's current version: a clear that never saw a later mark conflicts, and the word stays known. Clearing a word not known, a Learning one too, is applied and changes nothing, since the app that sends it can't see Learning; `set` with `state: "unknown"` ends Learning.

Fields ([`KnownWordClearFields`](#knownwordclearfields)):

- `stateChangedAt` (string (date-time), optional): When the word moved to the state, by the device's clock: ISO 8601, from 2000 on; a time after the service's is taken as the service's. Left out, it is the service's time when the change applies. A change that leaves the state as it was keeps the earlier time.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000004",
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
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000005",
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
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000006",
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
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000007",
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
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000008",
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
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000009",
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
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-00000000000a",
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
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-00000000000b",
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
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-00000000000c",
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
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-00000000000d",
  "entity": "bookmarkedSentence",
  "operation": "remove",
  "entityId": "5e8d1c2b-7a6f-4d3e-8b9c-0f1e2d3c4b5a",
  "baseVersion": 1
}
```

### Entity `wordNote`

A note the learner wrote on a word or a kanji, or one an earlier app saved under a note identity no word takes now. A word may have several. An account holds at most 10,000. A deleted note's row keeps only its ID and version.

- **ID** (`entityId`): The note's UUID, in either case; answers name it in lowercase.
- **Read with:** `notes:read`
- **As it is now** (a `put`'s `data`): [`WordNote`](#wordnote)

**`write`**, with `notes:write`; `baseVersion` required. Writes the note whole: a new one at `baseVersion` 0, or a change to one at its current version. A write that matches the note is applied and changes nothing. A write at an older version conflicts with the note as it is now, so neither device's text is lost: keep yours as a new note on the same word, or, if `current`'s text is the one your change started from, write it again at `current`'s version. A write of a note deleted since `baseVersion` applies and brings it back: the deleter never saw that text. Past 10,000 notes it's rejected `too_many_notes`.

Fields ([`NoteFields`](#notefields)), and no others:

- `item` (string, required): A Language Reference ID (32 lowercase hex digits), `kanji:` and one kanji in Unicode NFC, or a note identity an earlier app saved (`wn1:` and 64 lowercase hex digits).
- `text` (string, required): The note: 1 to 10,000 characters once trimmed, kept in Unicode NFC. Line breaks and tabs stay, and other control characters become spaces. Never cut: a longer note is refused.
- `headword` (string or null, optional, at most 200 characters): The headword the note was saved on, if any.
- `reading` (string or null, optional, at most 200 characters): Its reading, if any.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-00000000000e",
  "entity": "wordNote",
  "operation": "write",
  "entityId": "8a3e5c7b-1d2f-4a6b-9c8d-7e6f5a4b3c2d",
  "baseVersion": 0,
  "fields": {
    "item": "9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90",
    "text": "「見る」は目で、「観る」は映画を。",
    "headword": "見る",
    "reading": "みる"
  }
}
```

**`delete`**, with `notes:write`; `baseVersion` required. It applies only at the note's current version, so it deletes only what the learner saw: a note written elsewhere since stays, and the delete conflicts. Deleting a note the account hasn't is applied.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-00000000000f",
  "entity": "wordNote",
  "operation": "delete",
  "entityId": "8a3e5c7b-1d2f-4a6b-9c8d-7e6f5a4b3c2d",
  "baseVersion": 1
}
```

### Entity `photo`

A photo in the learner's Media Library, by its file, which `PUT /v1/photos/{photoId}` uploads first and `GET /v1/photos/{photoId}` downloads. The account keeps the bytes as the app sent them. A photo is shown while it's on a word; removing its last word empties it, which syncs as a `delete` marked `emptied: true` but keeps its file for 30 days, and a word added from elsewhere brings it back. A photo left with no word for a day is emptied too. An emptied photo's file counts toward the account's 1,000 for its 30 days, so the word that brings it back always finds it; then it's deleted, which syncs as a plain `delete`, freeing its place.

- **ID** (`entityId`): The SHA-256 of the photo's file, in 64 lowercase hex digits.
- **Read with:** `photos:read`
- **As it is now** (a `put`'s `data`): [`Photo`](#photo)

**`add`**, with `photos:write`; `baseVersion` not read. It always applies, once the account holds the file (else `photo_not_uploaded`): the same photo saved again after a delete or once emptied comes back. Adding one the account shows changes nothing. Send its words next, as `photoWord` adds.

Fields ([`PhotoFields`](#photofields)), and no others:

- `name` (string, required): The photo's name, such as its file's. Cut to 200 characters, with control characters made spaces; it may be empty.
- `savedAt` (string (date-time), required): ISO 8601, from 2000 on, by the device's clock; a time after the service's is taken as the service's.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000010",
  "entity": "photo",
  "operation": "add",
  "entityId": "d20f6ffd523b78a86cd2f916fa34af5d1918d75f7b142237c752ad6b254213ab",
  "fields": {
    "name": "Menu.jpg",
    "savedAt": "2026-10-07T03:25:00Z"
  }
}
```

**`delete`**, with `photos:write`; `baseVersion` not read. The learner deleted the photo. It always applies, wins over everything done to the photo since, words added elsewhere too, marks each of its words removed, and takes its file, unless the profile photo is the same file: drop them on the device. A word added later is rejected `unknown_photo`.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000011",
  "entity": "photo",
  "operation": "delete",
  "entityId": "d20f6ffd523b78a86cd2f916fa34af5d1918d75f7b142237c752ad6b254213ab"
}
```

### Entity `photoWord`

A word or kanji a photo is on. A photo is on at most 500 words, and remembers its latest 500 removed ones; a deleted photo's words go when the account forgets the photo. A word the account forgets comes back past every version it had, so a remove from before can't take a later add, and a cursor from before its removal is refused `410 invalid_cursor`, so the device reads everything again. Adding a word journals its photo again, so a device that dropped the photo gets it back with the word.

- **ID** (`entityId`): The photo's SHA-256, a slash, and the item: `<photo>/<item>`, the item as a note's is.
- **Read with:** `photos:read`
- **As it is now** (a `put`'s `data`): [`PhotoWord`](#photoword)

**`add`**, with `photos:write`; `baseVersion` not read. It always applies to a photo the account has, an emptied one too, which it brings back. To a deleted or unknown photo it's rejected `unknown_photo`: drop the word on the device, and the photo if no other word holds it. Past 500 words it's `photo_full`: keep the word on the device. Adding a word the photo is on is applied and changes nothing.

Fields ([`PhotoWordFields`](#photowordfields)), and no others:

- `headword` (string, required, 1 to 200 characters): The word as the app shows it, kept in Unicode NFC and trimmed, with no control characters.
- `reading` (string, optional, at most 200 characters): Its reading, held as `headword` is. Empty when left out.
- `savedAt` (string (date-time), required): ISO 8601, from 2000 on, by the device's clock; a time after the service's is taken as the service's.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000012",
  "entity": "photoWord",
  "operation": "add",
  "entityId": "d20f6ffd523b78a86cd2f916fa34af5d1918d75f7b142237c752ad6b254213ab/9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90",
  "fields": {
    "headword": "見る",
    "reading": "みる",
    "savedAt": "2026-10-07T03:25:00Z"
  }
}
```

**`remove`**, with `photos:write`; `baseVersion` required. It applies only at the word's current version, so an add the remover never saw wins, and the remove conflicts. Removing the photo's last word empties the photo, which syncs as its `delete`.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000013",
  "entity": "photoWord",
  "operation": "remove",
  "entityId": "d20f6ffd523b78a86cd2f916fa34af5d1918d75f7b142237c752ad6b254213ab/9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90",
  "baseVersion": 1
}
```

### Entity `profilePhoto`

The profile's photo, a file uploaded with `PUT /v1/photos/{photoId}`. The name and username stay the profile's own, so changing one never conflicts with the other.

- **ID** (`entityId`): The account's ID, or left out.
- **Read with:** `profile`
- **As it is now** (a `put`'s `data`): [`ProfilePhoto`](#profilephoto)

**`set`**, with `profile`; `baseVersion` required. It applies only at the profile photo's current version (0 for none ever set), so two devices that change it conflict, and the second gets the photo as it is now. Setting the photo it has is applied and changes nothing. An app without `photos:read` may set only a file it uploaded itself (else `photo_not_uploaded`). The file it replaces is deleted, unless a Media Library photo is the same file.

Fields ([`ProfilePhotoFields`](#profilephotofields)), and no others:

- `photoId` (string, required, matching `^[0-9a-f]{64}$`): The SHA-256 of the photo file, uploaded first with `PUT /v1/photos/{photoId}`.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000014",
  "entity": "profilePhoto",
  "operation": "set",
  "baseVersion": 0,
  "fields": {
    "photoId": "02a3e298f1533f62558c58e4c70edcab9af5a50d62d925fd5390942020fb0fb8"
  }
}
```

**`remove`**, with `profile`; `baseVersion` required. It applies only at the current version, so a photo set elsewhere since stays, and the remove conflicts. It syncs as a `delete`.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000015",
  "entity": "profilePhoto",
  "operation": "remove",
  "baseVersion": 1
}
```

### Entity `setting`

One of the learner's settings, which follow the account rather than the device. A setting the account doesn't hold comes as a `delete`. The settings:

- `readingAids.furigana` (`true` or `false`): Reading Aids: furigana over kanji.
- `readingAids.romaji` (`true` or `false`): Reading Aids: romaji under Japanese.
- `readingAids.wordMeanings` (`true` or `false`): Reading Aids: each word's meaning.
- `readingAids.kanjiMeanings` (`true` or `false`): Reading Aids: each kanji's meaning.
- `readingAids.translations` (`true` or `false`): Reading Aids: translations.
- `readingAids.translationLanguage` (text of at most 35 characters matching `^[a-z]{2,3}(-[A-Za-z0-9]{1,8})*$`): Reading Aids: the language translations are in, as a language tag, such as `en`.
- `readingAids.translationSource` (one of `youTube`, `apple`): Reading Aids: where translations come from: YouTube's captions, or Apple's on the device.
- `readingAids.furiganaHiddenOnKnownWords` (`true` or `false`): Reading Aids: no furigana over the words the learner knows.
- `translate.furigana` (`true` or `false`): Translate's own furigana switch.
- `translate.speechSpeed` (a number from 0.5 to 2): How fast Translate speaks: 1 is normal speed.
- `search.sort` (text of at most 120 characters matching `^(default|known-words|frequency\|[a-z0-9][a-z0-9.-]{0,99})$`): Search results' Sorted by: `default`, `known-words`, or `frequency|` and a frequency dictionary's family.
- `search.filter` (one of `all`, `known`, `unknown`, `learning`): Search results' filter.
- `imageSearch.textView` (one of `photo`, `both`, `text`, `translate`): Image Search's view: the photo, the photo and its text, the text, or its translation.
- `frequencyDictionaries.chosen` (text of at most 5,000 characters matching `^([a-z0-9][a-z0-9.-]{0,99}(,[a-z0-9][a-z0-9.-]{0,99}){0,49})?$`): The frequency dictionaries the learner chose, by pack ID, in their order, separated by commas: at most 50, and empty for none. Each device downloads its own copy.

- **ID** (`entityId`): The setting's name, from the list above.
- **Read with:** `settings:read`
- **As it is now** (a `put`'s `data`): [`Setting`](#setting)

**`set`**, with `settings:write`; `baseVersion` required. It applies only at the setting's current version (0 for one never set), so two devices that change one setting conflict, and the second gets the value as it is now; settings change apart, so changing one never conflicts with another. Setting the value it has is applied and changes nothing. A name the service doesn't know is rejected `unknown_setting`, and a value out of its kind `invalid_fields`: keep the device's value either way.

Fields ([`SettingFields`](#settingfields)), and no others:

- `value` (string, number, or boolean, required): The setting's value, of its kind: `x-sync-entities` lists each setting.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000016",
  "entity": "setting",
  "operation": "set",
  "entityId": "readingAids.furigana",
  "baseVersion": 0,
  "fields": {
    "value": false
  }
}
```

### Entity `recentSearch`

A search the learner made, as the app's recent searches list it. The account keeps the 50 with the latest `searchedAt`, and remembers the latest 100 it removed or pruned, as it does Player's Recent.

- **ID** (`entityId`): The HMAC-SHA256 of the query in UTF-8, after Unicode NFC, under the account's `searchKey` from the sync answer, in 64 lowercase hex digits: one query is one entity on every device, and a removed one keeps nothing that shows what was searched without the key. The examples use a key of 64 zeros.
- **Read with:** `searches:read`
- **As it is now** (a `put`'s `data`): [`RecentSearch`](#recentsearch)

**`search`**, with `searches:write`; `baseVersion` required. A search of a query the account has applies whatever its base version, and the later `searchedAt` is kept. A search of a query the learner removed applies only at the removal's version, so one made before seeing the removal conflicts with the `delete`. A search past the 50 newest prunes the oldest, which syncs as a `delete`.

Fields ([`SearchFields`](#searchfields)), and no others:

- `query` (string, required): What was searched, as the app keeps it: 1 to 1,000 characters, with no control characters. Its HMAC-SHA256 in UTF-8, after Unicode NFC, keyed with the account's `searchKey`, is the `entityId`.
- `searchedAt` (string (date-time), required): ISO 8601, from 2000 on, by the device's clock; a time after the service's is taken as the service's.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000017",
  "entity": "recentSearch",
  "operation": "search",
  "entityId": "d08c89a51f2143101860e9ddce809ddb3c6d58c0e04ed0d10a32cc108dac35bc",
  "baseVersion": 0,
  "fields": {
    "query": "食べる",
    "searchedAt": "2026-10-07T03:30:00Z"
  }
}
```

**`remove`**, with `searches:write`; `baseVersion` not read. The learner removed the search, or cleared them all, one `remove` each. It always applies; removing one the account has not is applied and changes nothing.

```json
{
  "id": "6f1c0e7a-3b5d-4c2e-9a8f-000000000018",
  "entity": "recentSearch",
  "operation": "remove",
  "entityId": "d08c89a51f2143101860e9ddce809ddb3c6d58c0e04ed0d10a32cc108dac35bc"
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
| `too_many_notes` | The account has 10,000 notes. Keep the note on the device, untouched. |
| `unknown_photo` | The photo word's photo isn't in the account, or was deleted: drop the word on the device, and the photo if no other word holds it. |
| `photo_not_uploaded` | The account holds no file for that photo: upload it with `PUT /v1/photos/{photoId}`, then send the change again under a new ID. |
| `photo_full` | The photo is on 500 words. Keep the word on the device. |
| `unknown_setting` | The service syncs no setting of that name, as when it is older than the app. Keep the setting on the device, and send it again once the service knows it. |
| `not_allowed` | The app's scopes don't include the operation's. |

## Error codes

Every `error.code` a route answers, with its status. Branch on the code; show or log the `message`.

| Code | Status | Routes |
| --- | --- | --- |
| `account_not_found` | 400 | [`POST /v1/auth/unlink-account`](#post-v1authunlink-account) |
| `account_not_linked` | 403 | [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp) |
| `already_subscribed` | 409 | [`POST /v1/me/subscription/checkout`](#post-v1mesubscriptioncheckout) |
| `apple_account_mismatch` | 400 | [`DELETE /v1/me`](#delete-v1me) |
| `apple_authorization_invalid` | 400 | [`DELETE /v1/me`](#delete-v1me) |
| `apple_authorization_needed` | 400 | [`DELETE /v1/me`](#delete-v1me) |
| `apple_unavailable` | 503 | [`DELETE /v1/me`](#delete-v1me) |
| `bad_request` | 400 | [`PATCH /v1/me`](#patch-v1me), [`DELETE /v1/me`](#delete-v1me), [`POST /v1/sync`](#post-v1sync), [`GET /v1/sync/{entity}`](#get-v1syncentity), [`POST /v1/me/subscription/checkout`](#post-v1mesubscriptioncheckout), [`POST /v1/me/subscription/portal`](#post-v1mesubscriptionportal), [`POST /v1/me/subscription/apple`](#post-v1mesubscriptionapple), [`PUT /v1/photos/{photoId}`](#put-v1photosphotoid), [`GET /v1/photos/{photoId}`](#get-v1photosphotoid) |
| `billing_unavailable` | 503 | [`DELETE /v1/me`](#delete-v1me), [`GET /v1/me/subscription/plans`](#get-v1mesubscriptionplans), [`POST /v1/me/subscription/checkout`](#post-v1mesubscriptioncheckout), [`POST /v1/me/subscription/portal`](#post-v1mesubscriptionportal), [`POST /v1/me/subscription/apple`](#post-v1mesubscriptionapple) |
| `client_mismatch` | 403 | [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial) |
| `email_not_verified` | 403 | [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial) |
| `email_unavailable` | 503 | [`POST /v1/auth/email-otp/send-verification-otp`](#post-v1authemail-otpsend-verification-otp) |
| `failed_to_unlink_last_account` | 400 | [`POST /v1/auth/unlink-account`](#post-v1authunlink-account) |
| `insufficient_scope` | 403 | [`GET /v1/me`](#get-v1me), [`PATCH /v1/me`](#patch-v1me), [`DELETE /v1/me`](#delete-v1me), [`GET /v1/sync/{entity}`](#get-v1syncentity), [`GET /v1/me/subscription`](#get-v1mesubscription), [`GET /v1/me/subscription/plans`](#get-v1mesubscriptionplans), [`POST /v1/me/subscription/checkout`](#post-v1mesubscriptioncheckout), [`POST /v1/me/subscription/portal`](#post-v1mesubscriptionportal), [`POST /v1/me/subscription/apple`](#post-v1mesubscriptionapple), [`PUT /v1/photos/{photoId}`](#put-v1photosphotoid), [`GET /v1/photos/{photoId}`](#get-v1photosphotoid), [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp), [`POST /v1/auth/link-social`](#post-v1authlink-social), [`POST /v1/auth/unlink-account`](#post-v1authunlink-account), [`GET /v1/auth/get-session`](#get-v1authget-session), [`GET /v1/auth/list-accounts`](#get-v1authlist-accounts), [`GET /v1/auth/list-sessions`](#get-v1authlist-sessions), [`POST /v1/auth/revoke-session`](#post-v1authrevoke-session), [`POST /v1/auth/revoke-sessions`](#post-v1authrevoke-sessions), [`POST /v1/auth/revoke-other-sessions`](#post-v1authrevoke-other-sessions) |
| `internal` | 500 | [`GET /v1/me`](#get-v1me), [`PATCH /v1/me`](#patch-v1me), [`DELETE /v1/me`](#delete-v1me), [`POST /v1/sync`](#post-v1sync), [`GET /v1/sync/{entity}`](#get-v1syncentity), [`GET /v1/me/subscription`](#get-v1mesubscription), [`GET /v1/me/subscription/plans`](#get-v1mesubscriptionplans), [`POST /v1/me/subscription/checkout`](#post-v1mesubscriptioncheckout), [`POST /v1/me/subscription/portal`](#post-v1mesubscriptionportal), [`POST /v1/me/subscription/apple`](#post-v1mesubscriptionapple), [`POST /v1/webhooks/stripe`](#post-v1webhooksstripe), [`POST /v1/webhooks/apple`](#post-v1webhooksapple), [`PUT /v1/photos/{photoId}`](#put-v1photosphotoid), [`GET /v1/photos/{photoId}`](#get-v1photosphotoid) |
| `invalid_cursor` | 410 | [`POST /v1/sync`](#post-v1sync), [`GET /v1/sync/{entity}`](#get-v1syncentity) |
| `invalid_email` | 400 | [`POST /v1/auth/email-otp/send-verification-otp`](#post-v1authemail-otpsend-verification-otp) |
| `invalid_fields` | 400 | [`PATCH /v1/me`](#patch-v1me) |
| `invalid_nonce` | 401 | [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial), [`POST /v1/auth/link-social`](#post-v1authlink-social) |
| `invalid_otp` | 400 | [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp) |
| `invalid_signature` | 400 | [`POST /v1/webhooks/stripe`](#post-v1webhooksstripe), [`POST /v1/webhooks/apple`](#post-v1webhooksapple) |
| `invalid_token` | 401 | [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial), [`POST /v1/auth/link-social`](#post-v1authlink-social) |
| `invalid_transaction` | 400 | [`POST /v1/me/subscription/apple`](#post-v1mesubscriptionapple) |
| `no_subscription` | 404 | [`POST /v1/me/subscription/portal`](#post-v1mesubscriptionportal) |
| `nonce_required` | 400 | [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial) |
| `not_found` | 404 | [`POST /v1/webhooks/stripe`](#post-v1webhooksstripe), [`POST /v1/webhooks/apple`](#post-v1webhooksapple), [`GET /v1/photos/{photoId}`](#get-v1photosphotoid) |
| `oauth_link_error` | 401 | [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial) |
| `otp_expired` | 400 | [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp) |
| `payment_confirming` | 409 | [`POST /v1/me/subscription/checkout`](#post-v1mesubscriptioncheckout) |
| `photo_digest_mismatch` | 400 | [`PUT /v1/photos/{photoId}`](#put-v1photosphotoid) |
| `photo_file_missing` | 404 | [`GET /v1/photos/{photoId}`](#get-v1photosphotoid) |
| `photos_unavailable` | 503 | [`PUT /v1/photos/{photoId}`](#put-v1photosphotoid), [`GET /v1/photos/{photoId}`](#get-v1photosphotoid) |
| `provider_not_found` | 404 | [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial) |
| `session_not_fresh` | 403 | [`POST /v1/auth/link-social`](#post-v1authlink-social), [`POST /v1/auth/unlink-account`](#post-v1authunlink-account) |
| `sign_in_again` | 403 | [`DELETE /v1/me`](#delete-v1me) |
| `sign_in_again` | 401 | [`GET /v1/auth/token`](#get-v1authtoken) |
| `sign_in_only` | 400 | [`POST /v1/auth/email-otp/send-verification-otp`](#post-v1authemail-otpsend-verification-otp) |
| `subscription_belongs_to_another_account` | 409 | [`POST /v1/me/subscription/apple`](#post-v1mesubscriptionapple) |
| `subscription_required` | 402 | [`POST /v1/sync`](#post-v1sync), [`GET /v1/sync/{entity}`](#get-v1syncentity), [`PUT /v1/photos/{photoId}`](#put-v1photosphotoid), [`GET /v1/photos/{photoId}`](#get-v1photosphotoid) |
| `too_large` | 413 | [`PATCH /v1/me`](#patch-v1me), [`DELETE /v1/me`](#delete-v1me), [`POST /v1/sync`](#post-v1sync), [`POST /v1/me/subscription/checkout`](#post-v1mesubscriptioncheckout), [`POST /v1/me/subscription/portal`](#post-v1mesubscriptionportal), [`POST /v1/me/subscription/apple`](#post-v1mesubscriptionapple), [`POST /v1/webhooks/stripe`](#post-v1webhooksstripe), [`POST /v1/webhooks/apple`](#post-v1webhooksapple), [`PUT /v1/photos/{photoId}`](#put-v1photosphotoid) |
| `too_many_attempts` | 403 | [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp) |
| `too_many_photos` | 409 | [`PUT /v1/photos/{photoId}`](#put-v1photosphotoid) |
| `too_many_requests` | 429 | [`GET /v1/me`](#get-v1me), [`PATCH /v1/me`](#patch-v1me), [`DELETE /v1/me`](#delete-v1me), [`POST /v1/sync`](#post-v1sync), [`GET /v1/sync/{entity}`](#get-v1syncentity), [`GET /v1/me/subscription`](#get-v1mesubscription), [`GET /v1/me/subscription/plans`](#get-v1mesubscriptionplans), [`POST /v1/me/subscription/checkout`](#post-v1mesubscriptioncheckout), [`POST /v1/me/subscription/portal`](#post-v1mesubscriptionportal), [`POST /v1/me/subscription/apple`](#post-v1mesubscriptionapple), [`PUT /v1/photos/{photoId}`](#put-v1photosphotoid), [`GET /v1/photos/{photoId}`](#get-v1photosphotoid), [`POST /v1/auth/email-otp/send-verification-otp`](#post-v1authemail-otpsend-verification-otp), [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp), [`POST /v1/auth/sign-in/nonce`](#post-v1authsign-innonce), [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial), [`POST /v1/auth/link-social`](#post-v1authlink-social), [`POST /v1/auth/unlink-account`](#post-v1authunlink-account), [`GET /v1/auth/token`](#get-v1authtoken), [`GET /v1/auth/jwks`](#get-v1authjwks), [`GET /v1/auth/get-session`](#get-v1authget-session), [`POST /v1/auth/sign-out`](#post-v1authsign-out), [`GET /v1/auth/list-accounts`](#get-v1authlist-accounts), [`GET /v1/auth/list-sessions`](#get-v1authlist-sessions), [`POST /v1/auth/revoke-session`](#post-v1authrevoke-session), [`POST /v1/auth/revoke-sessions`](#post-v1authrevoke-sessions), [`POST /v1/auth/revoke-other-sessions`](#post-v1authrevoke-other-sessions) |
| `try_again` | 503 | [`POST /v1/webhooks/stripe`](#post-v1webhooksstripe), [`POST /v1/webhooks/apple`](#post-v1webhooksapple) |
| `unauthorized` | 401 | [`GET /v1/me`](#get-v1me), [`PATCH /v1/me`](#patch-v1me), [`DELETE /v1/me`](#delete-v1me), [`POST /v1/sync`](#post-v1sync), [`GET /v1/sync/{entity}`](#get-v1syncentity), [`GET /v1/me/subscription`](#get-v1mesubscription), [`GET /v1/me/subscription/plans`](#get-v1mesubscriptionplans), [`POST /v1/me/subscription/checkout`](#post-v1mesubscriptioncheckout), [`POST /v1/me/subscription/portal`](#post-v1mesubscriptionportal), [`POST /v1/me/subscription/apple`](#post-v1mesubscriptionapple), [`PUT /v1/photos/{photoId}`](#put-v1photosphotoid), [`GET /v1/photos/{photoId}`](#get-v1photosphotoid), [`POST /v1/auth/link-social`](#post-v1authlink-social), [`POST /v1/auth/unlink-account`](#post-v1authunlink-account), [`GET /v1/auth/token`](#get-v1authtoken), [`GET /v1/auth/list-accounts`](#get-v1authlist-accounts), [`GET /v1/auth/list-sessions`](#get-v1authlist-sessions), [`POST /v1/auth/revoke-session`](#post-v1authrevoke-session), [`POST /v1/auth/revoke-sessions`](#post-v1authrevoke-sessions), [`POST /v1/auth/revoke-other-sessions`](#post-v1authrevoke-other-sessions) |
| `unknown_client` | 400 | [`POST /v1/auth/sign-in/email-otp`](#post-v1authsign-inemail-otp), [`POST /v1/auth/sign-in/social`](#post-v1authsign-insocial) |
| `unknown_price` | 400 | [`POST /v1/me/subscription/checkout`](#post-v1mesubscriptioncheckout) |
| `unknown_product` | 400 | [`POST /v1/me/subscription/apple`](#post-v1mesubscriptionapple) |
| `unreadable_event` | 400 | [`POST /v1/webhooks/stripe`](#post-v1webhooksstripe) |
| `unsupported_photo` | 415 | [`PUT /v1/photos/{photoId}`](#put-v1photosphotoid) |
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

### WordStateFields

- `state` (`"unknown"`, `"learning"`, or `"known"`, required): The state the word moves to.
- `headword` (string, optional, 1 to 200 characters): The word as the app shows it, kept in Unicode NFC and trimmed, with no control characters. Needed for `learning` and `known`; for `unknown` it is not read, and the word keeps the text it has.
- `reading` (string, optional, at most 200 characters): Its reading, held as `headword` is. For `learning` and `known`, empty when left out; for `unknown` it is not read, and the word keeps the reading it has.
- `stateChangedAt` (string (date-time), optional): When the word moved to the state, by the device's clock: ISO 8601, from 2000 on; a time after the service's is taken as the service's. Left out, it is the service's time when the change applies. A change that leaves the state as it was keeps the earlier time.

### KnownWordFields

- `headword` (string, required, 1 to 200 characters): The word as the app shows it, kept in Unicode NFC and trimmed, with no control characters.
- `reading` (string, optional, at most 200 characters): Its reading, held as `headword` is. Empty when left out.
- `stateChangedAt` (string (date-time), optional): When the word moved to the state, by the device's clock: ISO 8601, from 2000 on; a time after the service's is taken as the service's. Left out, it is the service's time when the change applies. A change that leaves the state as it was keeps the earlier time.

### KnownWordClearFields

- `stateChangedAt` (string (date-time), optional): When the word moved to the state, by the device's clock: ISO 8601, from 2000 on; a time after the service's is taken as the service's. Left out, it is the service's time when the change applies. A change that leaves the state as it was keeps the earlier time.

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

### NoteFields

- `item` (string, required): A Language Reference ID (32 lowercase hex digits), `kanji:` and one kanji in Unicode NFC, or a note identity an earlier app saved (`wn1:` and 64 lowercase hex digits).
- `text` (string, required): The note: 1 to 10,000 characters once trimmed, kept in Unicode NFC. Line breaks and tabs stay, and other control characters become spaces. Never cut: a longer note is refused.
- `headword` (string or null, optional, at most 200 characters): The headword the note was saved on, if any.
- `reading` (string or null, optional, at most 200 characters): Its reading, if any.

### PhotoFields

- `name` (string, required): The photo's name, such as its file's. Cut to 200 characters, with control characters made spaces; it may be empty.
- `savedAt` (string (date-time), required): ISO 8601, from 2000 on, by the device's clock; a time after the service's is taken as the service's.

### PhotoWordFields

- `headword` (string, required, 1 to 200 characters): The word as the app shows it, kept in Unicode NFC and trimmed, with no control characters.
- `reading` (string, optional, at most 200 characters): Its reading, held as `headword` is. Empty when left out.
- `savedAt` (string (date-time), required): ISO 8601, from 2000 on, by the device's clock; a time after the service's is taken as the service's.

### ProfilePhotoFields

- `photoId` (string, required, matching `^[0-9a-f]{64}$`): The SHA-256 of the photo file, uploaded first with `PUT /v1/photos/{photoId}`.

### SettingFields

- `value` (string, number, or boolean, required): The setting's value, of its kind: `x-sync-entities` lists each setting.

### SearchFields

- `query` (string, required): What was searched, as the app keeps it: 1 to 1,000 characters, with no control characters. Its HMAC-SHA256 in UTF-8, after Unicode NFC, keyed with the account's `searchKey`, is the `entityId`.
- `searchedAt` (string (date-time), required): ISO 8601, from 2000 on, by the device's clock; a time after the service's is taken as the service's.

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
- `changes` (array of [`Change`](#change), required): The entities that changed after the cursor, each once, as they are now, including the ones this request changed. On a page, lists and photos come before their words, but a word can come on an earlier page than its list or photo: hold it until the sync reaches `hasMore: false`.
- `cursor` (string, required): Opaque, and at most 200 characters. Keep it once the changes are applied, and send it next time.
- `hasMore` (boolean, required): More changes are waiting: sync again with the new cursor.
- `searchKey` (string, optional): To an app with `searches:read`: the account's key for recent searches' IDs, 64 hex digits. A recent search's `entityId` is the HMAC-SHA256 of its query, after Unicode NFC, under this key, so a removed search keeps nothing that reveals what was searched. Keep it with the account; it changes only if the service's secret does.

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
    - `code` (`"invalid_fields"`, `"username_taken"`, `"unknown_entity"`, `"unknown_operation"`, `"invalid_mutation"`, `"mutation_id_reused"`, `"already_exists"`, `"unknown_list"`, `"too_many_lists"`, `"list_full"`, `"too_many_bookmarks"`, `"too_many_notes"`, `"unknown_photo"`, `"photo_not_uploaded"`, `"photo_full"`, `"unknown_setting"`, or `"not_allowed"`, required)
    - `message` (string, required)

### Change

An entity as it is now (`put`, with `data`), or gone (`delete`): a deleted list, note, or photo, a word removed from a list or a photo, a video or search removed or past the newest the account keeps, a bookmark or the profile photo removed, a setting the account doesn't hold, or one never there. A `knownWord` at Unknown is still a `put`, with `state: "unknown"`.

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
- `entity` `"wordNote"`, `operation` `"put"`
  - `entity` (`"wordNote"`, required)
  - `entityId` (string, required)
  - `operation` (`"put"`, required)
  - `version` (integer, required)
  - `data` ([`WordNote`](#wordnote), required)
- `entity` `"photo"`, `operation` `"put"`
  - `entity` (`"photo"`, required)
  - `entityId` (string, required)
  - `operation` (`"put"`, required)
  - `version` (integer, required)
  - `data` ([`Photo`](#photo), required)
- `entity` `"photoWord"`, `operation` `"put"`
  - `entity` (`"photoWord"`, required)
  - `entityId` (string, required)
  - `operation` (`"put"`, required)
  - `version` (integer, required)
  - `data` ([`PhotoWord`](#photoword), required)
- `entity` `"profilePhoto"`, `operation` `"put"`
  - `entity` (`"profilePhoto"`, required)
  - `entityId` (string, required)
  - `operation` (`"put"`, required)
  - `version` (integer, required)
  - `data` ([`ProfilePhoto`](#profilephoto), required)
- `entity` `"setting"`, `operation` `"put"`
  - `entity` (`"setting"`, required)
  - `entityId` (string, required)
  - `operation` (`"put"`, required)
  - `version` (integer, required)
  - `data` ([`Setting`](#setting), required)
- `entity` `"recentSearch"`, `operation` `"put"`
  - `entity` (`"recentSearch"`, required)
  - `entityId` (string, required)
  - `operation` (`"put"`, required)
  - `version` (integer, required)
  - `data` ([`RecentSearch`](#recentsearch), required)
- `operation` `"delete"`
  - `entity` (`"knownWord"`, `"list"`, `"listWord"`, `"watchedVideo"`, `"bookmarkedSentence"`, `"wordNote"`, `"photo"`, `"photoWord"`, `"profilePhoto"`, `"setting"`, or `"recentSearch"`, required)
  - `entityId` (string, required)
  - `operation` (`"delete"`, required)
  - `version` (integer, required)
  - `data` (null, required)
- `entity` `"photo"`, `operation` `"delete"`, `emptied` `true`
  - `entity` (`"photo"`, required)
  - `entityId` (string, required)
  - `operation` (`"delete"`, required)
  - `version` (integer, required)
  - `data` (null, required)
  - `emptied` (`true`, required): The photo was emptied, its last word removed, not deleted. Drop it and its words as for any delete, but no place among the account's files was freed: it keeps its file for 30 days, and a word added from elsewhere brings it back. Any other delete leaves this out.

### KnownWord

- `itemId` (string, required)
- `headword` (string, required)
- `reading` (string, required)
- `state` (`"unknown"`, `"learning"`, or `"known"`, optional): The learner's state for the word. Always sent by this service; a service from before Learning, during a deploy or after a rollback, sends none, so read `known` instead.
- `known` (boolean, required): Whether `state` is `known`, for an app that reads only this: a Learning word is not known.
- `stateChangedAt` (string (date-time) or null, optional): When the word moved to its current state, as the app said, or the service's time when the change carried none; a time after the service's is taken as the service's. `null` for a word that moved to its state before the service kept the time; a service from before it sends none.

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

### WordNote

- `id` (string, required)
- `itemId` (string, required): The word, kanji, or note identity it is on.
- `text` (string, required)
- `headword` (string or null, required)
- `reading` (string or null, required)

### Photo

- `id` (string, required): The SHA-256 of its file: download it by this ID.
- `name` (string, required)
- `savedAt` (string (date-time), required)

### PhotoWord

- `photoId` (string, required)
- `itemId` (string, required)
- `headword` (string, required)
- `reading` (string, required)
- `savedAt` (string (date-time), required)

### ProfilePhoto

- `photoId` (string, required): Download it by this ID.

### Setting

- `name` (string, required)
- `value` (string, number, or boolean, required)

### RecentSearch

- `id` (string, required)
- `query` (string, required)
- `searchedAt` (string (date-time), required)

### SyncRequest

- `cursor` (string or null, optional, 1 to 200 characters): The `cursor` from the last answer whose changes the client applied. Leave it out, or send null, to start from the beginning.
- `limit` (integer, optional, 1 to 500): The most journal entries to read this time. Default 100.
- `mutations` (array of [`Mutation`](#mutation), optional, at most 50 items): Up to 50 changes made on the device, applied in order before the changes are read.

### Mutation

One change made on the device. `x-sync-entities` holds each entity and its operations, and `x-sync-rejections` each code a rejected result can carry.

- `id` (string, required, matching `^[A-Za-z0-9_-]{8,64}$`): A client-made ID, unique for each mutation, such as a UUID. Sending the same mutation again under its ID never applies it twice, and gets the same outcome: applied at the same version, a conflict with the entity as it is then, or a rejection with the same `error.code`. Reusing an ID for a different mutation is rejected with `mutation_id_reused`.
- `entity` (string, required, matching `^[A-Za-z][A-Za-z0-9_-]{0,63}$`): `profile`, `knownWord`, `list`, `listWord`, `watchedVideo`, `bookmarkedSentence`, `wordNote`, `photo`, `photoWord`, `profilePhoto`, `setting`, `recentSearch`. Any other is rejected with `unknown_entity`, and the rest of the request still applies. A change the app's scopes don't allow is rejected with `not_allowed`, and the app reads only the entities its scopes do.
- `operation` (string, required, matching `^[A-Za-z][A-Za-z0-9_-]{0,63}$`): One of the entity's operations, in `x-sync-entities`, with the scopes each needs, the fields it takes, and whether it reads `baseVersion`. Any other is rejected with `unknown_operation`.
- `entityId` (string, optional, matching `^[^\p{Cc}\p{Cf}\s]{1,200}$`):
  - `profile`: The account's ID, or left out.
  - `knownWord`: The item: a Language Reference ID (32 lowercase hex digits), or `kanji:` and one kanji, kept in Unicode NFC.
  - `list`: Its UUID, in either case; answers name it in lowercase.
  - `listWord`: The list's UUID, a slash, and the item: `<list>/<item>`.
  - `watchedVideo`: The YouTube video ID: 11 letters, digits, `-`, or `_`.
  - `bookmarkedSentence`: The sentence's UUID, in either case; answers name it in lowercase.
  - `wordNote`: The note's UUID, in either case; answers name it in lowercase.
  - `photo`: The SHA-256 of the photo's file, in 64 lowercase hex digits.
  - `photoWord`: The photo's SHA-256, a slash, and the item: `<photo>/<item>`, the item as a note's is.
  - `profilePhoto`: The account's ID, or left out.
  - `setting`: The setting's name, from the list above.
  - `recentSearch`: The HMAC-SHA256 of the query in UTF-8, after Unicode NFC, under the account's `searchKey` from the sync answer, in 64 lowercase hex digits: one query is one entity on every device, and a removed one keeps nothing that shows what was searched without the key. The examples use a key of 64 zeros.
- `baseVersion` (integer, optional, at least 0): The version of the entity the change was made to, or 0 for one the client has never seen. If the entity has changed since, what happens is the operation's rule, in `x-sync-entities`, which also says which operations read it.
- `fields` (map to string, number, boolean, or null, optional): What the operation sets: the operation's fields, in `x-sync-entities`. Each value is a string, number, boolean, or null.

### KindAnswer

- `changes` (array of [`Change`](#change), required): Each entity of the kind, once, as it is now, in the order the account last changed them, oldest first: a `put`, or a `delete` for one removed, as sync answers them.
- `cursor` (string, required): Opaque, and at most 200 characters. Send it to read the rest, or, later, what changed since.
- `hasMore` (boolean, required): More are waiting: read again with the new cursor.

### Subscription

- `status` (`"none"`, `"active"`, `"grace_period"`, `"billing_retry"`, `"pending"`, `"paused"`, `"expired"`, or `"revoked"`, required): `none`: The account has never had a subscription. `active`: Paid through `expiresAt`. It renews then unless `willRenew` is false. `grace_period`: A renewal's payment failed, and the store is retrying it. The subscription's features stay on until `expiresAt`. `billing_retry`: A renewal's payment failed, and the store is retrying it. The features are off until it's paid. `pending`: The first payment is still being made. The features are off until it is. `paused`: Paused where it was bought. The features are off until it resumes. `expired`: It ended: canceled, or never paid again. The features are off. `revoked`: Refunded, or revoked by the store. The features are off.
- `active` (boolean, required): Whether the subscription's features are on now: `status` is `active`, or `grace_period`, and `expiresAt` hasn't passed.
- `source` (string or null, required): Where it was bought: `apple`, in the App Store, or `stripe`, on the website.
- `productId` (string or null, required): The App Store product's ID, or the Stripe price's.
- `expiresAt` (string (date-time) or null, required): When the paid time, or the grace period, ends. A subscription set to renew keeps its features for a day past it while the renewal reaches the service.
- `willRenew` (boolean or null, required): Whether it renews at `expiresAt`. `null` until the store has said.
- `managedIn` (`"app_store"`, `"website"`, or `null`, required): Where it was bought, so where the learner changes, cancels, or fixes the payment of one still running: `app_store`, in the App Store's subscription settings, or `website`, through POST /v1/me/subscription/portal. A subscription that no longer runs keeps it, to say where it was bought; only `running` is managed. `null` when the account never had one.
- `running` (array of [`RunningSubscription`](#runningsubscription), required): Every subscription still running for the account, in either store, each managed where it was bought. Usually one; two when the learner subscribed in both, which the app and the website show, so each can be managed or canceled where it was bought.
- `canSubscribe` (boolean, required): Whether to offer a subscription. False while one runs anywhere, in a grace period, a billing retry, or a pause too, so a learner is never offered a second.
- `cloudAccess` (`"subscribed"`, `"free"`, or `"subscription_required"`, required): What POST /v1/sync and the photo files' routes do for this app now: `subscribed` and `free` sync, and `subscription_required` refuses with `402 subscription_required`, the app's cue for the paywall.
- `appAccountToken` (string (uuid) or null, required): The account's `appAccountToken`: the app sets it on every App Store purchase, so the purchase belongs to this account. It never changes. The app that sells the subscription always gets one; another app gets null until the account first buys or is answered for that app, so no record is made for an account that never subscribes.
- `offers` (object, required): What to offer when `canSubscribe` is true.
  - `appStore` (array of string, required): The App Store product IDs the app offers. Empty where the App Store is off.
  - `website` (array of string, required): The Stripe price IDs the website offers. Empty where Stripe is off.

### RunningSubscription

A subscription still running at its store, and where it is managed.

- `source` (string, required)
- `productId` (string, required)
- `status` (`"active"`, `"grace_period"`, `"billing_retry"`, `"pending"`, `"paused"`, `"expired"`, or `"revoked"`, required)
- `expiresAt` (string (date-time) or null, required)
- `willRenew` (boolean or null, required)
- `managedIn` (`"app_store"` or `"website"`, required)

### WebsitePlans

- `plans` (array of [`WebsitePlan`](#websiteplan), required): Each of `offers.website`, in its order, as Stripe describes it. Empty where Stripe is off.
- `trialDays` (integer or null, required): The free trial a checkout gives this account, or null: none is set, or the account has subscribed before.

### WebsitePlan

- `price` (string, required): The Stripe price, one of `offers.website`.
- `name` (string, required): Stripe's name for the product.
- `amount` (integer, required): Each period's price in the currency's smallest unit, as Stripe has it: cents, or yen.
- `currency` (string, required): Its ISO 4217 code, in lowercase, as Stripe has it.
- `interval` (`"day"`, `"week"`, `"month"`, or `"year"`, required)
- `intervalCount` (integer, required): How many intervals each period lasts.

### Redirect

- `url` (string (uri), required): Stripe's hosted page. Open it in the browser.

### CheckoutRequest

- `price` (string, optional, 1 to 255 characters): One of `offers.website`. It may be left out when the website offers one price.
- `successUrl` (string (uri), required, at most 2,048 characters): Where Stripe sends the learner after paying, on one of the website's origins.
- `cancelUrl` (string (uri), required, at most 2,048 characters): Where Stripe sends the learner who goes back without paying, on one of the website's origins.

### PortalRequest

- `returnUrl` (string (uri), required, at most 2,048 characters): Where Stripe's portal sends the learner back to, on one of the website's origins.

### AppleTransaction

- `signedTransaction` (string, required, 1 to 16,384 characters): StoreKit 2's `Transaction.jwsRepresentation`, after a purchase, a restore, or an update from `Transaction.updates`.

### Received

The event was taken, or was a repeat of one already taken.

- `received` (`true`, required)

### StripeEvent

A Stripe event, in the webhook endpoint's API version.

- `id` (string, required)
- `type` (string, required)

### AppleNotification

- `signedPayload` (string, required): App Store Server Notifications V2's signed payload, checked with Apple's root certificate.

### PhotoFile

- `id` (string, required): The SHA-256 of the file's bytes.
- `contentType` (string, required): The image type, read from the bytes themselves, such as `image/jpeg`.
- `byteSize` (integer, required, 1 to 12,582,912)
- `uploadedAt` (string (date-time), required)

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
