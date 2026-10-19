# Account billing

The account service sells one subscription, which unlocks syncing and the account's other cloud
features (#868). A learner buys it in the app, with Apple's in-app purchase, or on the website,
with Stripe, and either unlocks the same account everywhere. Each is managed where it was bought.
Everything on the device stays free. The service records the subscription itself, with no
third-party entitlement service ([ADR 0017](../adr/0017-sell-one-subscription-through-the-app-store-and-stripe.md)).

Until the owner turns it on, nothing is paid: `ACCOUNT_API_CLOUD_ACCESS` is `free` unless set, so
every account syncs as before, and the stores are off until their settings are set.

## The model

`src/domain/subscriptions.ts` holds the rules; the tables are in `src/db/billing-schema.ts`.

- **A subscription** is one row in `subscriptions` per store's subscription: `apple` and its
  original transaction ID, or `stripe` and its subscription ID. Each keeps the product (the App
  Store product's ID, or the Stripe price's), a status, when its paid time ends, whether it renews,
  the store's environment, and the account it belongs to. One store's events change only its own
  rows, so an App Store notification can't end a website subscription.
- **The entitlement** is the account's one answer, made from its subscriptions: the one giving
  access, else one still running at its store, else the latest. It names its source, product,
  status, expiry, and where it's managed.
- **Statuses:** `active` (paid through `expiresAt`), `grace_period` (a renewal failed and the store
  retries, features on until `expiresAt`), `billing_retry` (the same, features off), `pending` (a
  first payment not yet made), `paused`, `expired`, and `revoked` (refunded, or revoked by Apple).
  Only `active` and `grace_period` give access. An `active` subscription set to renew keeps its
  features for a day past `expiresAt` (`renewalLeewayMs`), so a renewal that reaches the service
  late cuts nothing off.
- **No second subscription.** `canSubscribe` is false while any subscription still runs at its
  store (giving access, or in a billing retry, pending, or paused), so neither client offers
  another, and `POST /v1/me/subscription/checkout` refuses one (`409 already_subscribed`).
- **Order.** A store's state replaces the one kept when its period started later, or, for the same
  period, when the store said it later. A state from the device, which carries no renewal details,
  replaces a store's state for the same period only to revoke it (`supersedes`). Stripe's states
  are read from Stripe at the time, so the newest read wins.
- **`billing_customers`** gives each account its `appAccountToken`, a random UUID made the first
  time the account asks for its subscription, and its Stripe customer once it has one.
- **The ledger**, `billing_ledger`, holds every charge attempt and refund, once each by store and
  reference: a Stripe invoice and its attempt number, or a refund's ID; an App Store transaction
  ID. Amounts are in the currency's smallest unit (Apple's thousandths converted). A refund's
  outcome moves on (`pending` to `succeeded` or `failed`, an App Store refund to `reversed`), and a
  `pending` never replaces an outcome already known.
- **Events.** `billing_events` records each store event once, by its ID (Stripe's event ID, Apple's
  `notificationUUID`), with what it did: `applied`, or `ignored` when it names no account here or a
  product not sold here. A repeat answers `200` and changes nothing. The event is recorded in the
  same transaction as what it changes, so one that fails is never recorded and the store sends it
  again. Events are kept, as the ledger is: a few rows a subscriber a month.
- **Deleting an account** ends its website subscription at Stripe first, with no refund, then
  deletes the account; without Stripe's answer nothing is deleted (`503 billing_unavailable`). An
  App Store subscription can't be ended by the service: Apple bills it until the learner cancels
  it, so the app says so before deleting. The account's subscriptions and customer go with it;
  its ledger rows and events stay, with no account.

## Routes

| Route | What it does |
| --- | --- |
| `GET /v1/me/subscription` | The entitlement, `canSubscribe`, `cloudAccess` (what sync does for this app now), the `appAccountToken`, and the offers: the App Store product IDs and Stripe price IDs. |
| `POST /v1/me/subscription/apple` | The app sends a StoreKit 2 transaction after a purchase, a restore, or an update. |
| `POST /v1/me/subscription/checkout` | Stripe Checkout's URL for one of the website's prices. |
| `POST /v1/me/subscription/portal` | The Stripe Customer Portal's URL, for a website subscription. |
| `POST /v1/webhooks/stripe` | Stripe's events. |
| `POST /v1/webhooks/apple` | App Store Server Notifications V2. |

The `/v1/me/subscription` routes take an access token with the `subscription` scope, which the
iOS app and the website have and Tomodachi doesn't, and each account sends at most 30 a minute
from each app. Checkout's and the portal's return URLs must be on `ACCOUNT_API_TRUSTED_ORIGINS`.
The [API reference](../api/account-api.md) has every field and error code.

## For apps and the website

- **Read the subscription** after signing in, when syncing on launch and on returning to the
  foreground, and after a purchase. Keep the answer with the account, and show it offline.
- **The paywall** is where a paid feature starts, when `cloudAccess` is `subscription_required`
  or a sync answers `402 subscription_required`. Keep the queued changes and stop syncing until the
  subscription is `active`; everything on the device works as before.
- **Offer** only when `canSubscribe` is true: the app `offers.appStore`, the website
  `offers.website`. Never offer a second subscription.
- **Manage** where `managedIn` says. `app_store`: the app opens the App Store's subscription
  settings, and the website says it's managed in the App Store. `website`: the website opens
  `POST /v1/me/subscription/portal`'s URL, and the app says it's managed on the website.
- **The app** sets the account's `appAccountToken` on every purchase, and sends each verified
  transaction's `jwsRepresentation` to `POST /v1/me/subscription/apple`: after a purchase, from
  `Transaction.updates`, and on a restore. It finishes a transaction once the service answers `200`
  or a `4xx`, and leaves it for StoreKit to hand over again after a `5xx`. A
  `409 subscription_belongs_to_another_account` means the Apple ID's subscription is another Zenbu
  account's: say so, and offer nothing.
- **The website** opens `POST /v1/me/subscription/checkout`'s URL, sending the page's
  `Content-Language`, and on its success page reads the subscription again until it's `active`,
  since Stripe's event reaches the service a few seconds after the learner pays.
- **Deleting an account** with an App Store subscription: tell the learner first that Apple keeps
  billing until they cancel it in the App Store, and offer its settings. A website subscription
  ends with the account.
- **Tomodachi** has no `subscription` scope; whether its sync is free is `ACCOUNT_API_CLOUD_FREE_APPS`.

## The gate

`cloudDataPaths` in `src/http/subscription.ts` lists the routes that hold cloud data, and
`requireCloudAccess` gates each, after the access token and before anything applies. Today it is
`POST /v1/sync`, which every synced entity passes through, so a new entity is gated with no change
here. A new cloud-data route goes on that list, and a test holds each route on it to answering
`402 subscription_required` and to declaring it in the contract. Signing in, the profile,
deleting the account, and the dictionary are never on it.

`cloudAccess` (`src/domain/cloud-access.ts`) decides, from the settings below: an account with an
active subscription syncs; with `ACCOUNT_API_CLOUD_ACCESS=free`, everyone syncs; otherwise an app
in `ACCOUNT_API_CLOUD_FREE_APPS`, an account made before
`ACCOUNT_API_CLOUD_FREE_FOR_ACCOUNTS_BEFORE`, and every account until
`ACCOUNT_API_CLOUD_FREE_UNTIL` sync too, and the rest get `402`. The refusal applies nothing and
deletes nothing: the device keeps its changes, and the account's cloud copy stays.

## Stripe

`src/billing/stripe.ts` is our own adapter on Stripe's Node SDK (`stripe`, pinned, API version
`2026-09-30.endive`). Better Auth's Stripe plugin doesn't fit: it records no event by its ID,
keeps no ledger, handles no invoice or refund, models only Stripe's subscriptions in a table of
its own, adds a column to `users`, puts its routes inside sign-in's, and takes Stripe's SDK only up
to version 22.

- **Checkout** is Stripe's hosted page, in subscription mode, for one price, with the account's ID
  as `client_reference_id` and in the subscription's metadata (`zenbu_account`). An account's
  second checkout reuses its Stripe customer. The page is in the request's `Content-Language`.
- **The webhook** verifies `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET` before reading the body,
  then, for `checkout.session.completed`, `customer.subscription.created`, `.updated`, `.deleted`,
  `.paused`, and `.resumed`, `invoice.paid`, and `invoice.payment_failed`, reads the subscription
  from Stripe as it is then, holding a lock on it (`pg_advisory_xact_lock`), so events that
  arrive out of order, or at once, leave the latest state. Invoices are charges in the ledger;
  `refund.created`, `.updated`, and `.failed` are refunds.
- **The account** is the one the subscription's metadata names, else the checkout's
  `client_reference_id`, else the one whose Stripe customer it is.
- **Statuses:** `active` and `trialing` are `active`; `past_due` is `grace_period` for
  `STRIPE_GRACE_PERIOD_DAYS` from the renewal, then `billing_retry`, as `unpaid` is; `incomplete`
  is `pending`; `canceled` and `incomplete_expired` are `expired`.
- **A refund** is recorded and changes no access: ending the subscription does, so refund and
  cancel together in Stripe's dashboard.
- **A checkout that completes for a deleted account**, or while the account's other subscription
  still runs (two checkout tabs, or the app's purchase first), is refunded and canceled at once,
  with Stripe idempotency keys, so a retried event refunds once. An App Store purchase can't be
  refunded by the service; the app offers none while a subscription runs.
- **Stripe down:** Checkout and the portal answer `503 billing_unavailable`; the webhook answers
  `503` and records nothing, so Stripe sends the event again. Each failure is logged as
  `stripe: <what> failed`, with Stripe's error type, code, and request ID, never a key.

## The App Store

`src/billing/app-store.ts` uses Apple's App Store Server Library (`@apple/app-store-server-library`)
to verify every signed payload: the certificate chain to Apple Root CA - G3
(`apple-root-certificates.json`, Apple's file, which a test holds to Apple's published SHA-256),
with online revocation checks, then the bundle ID (`appSellingTheSubscription` in
`src/domain/clients.ts`: the iOS app's), the environment, and in Production the app's Apple ID.

- **Notifications** carry the transaction, the renewal details, and the subscription's status;
  each sets the subscription's state as of its `signedDate`. Apple's status `1` is `active`, `2`
  `expired`, `3` `billing_retry`, `4` `grace_period` (until the renewal's
  `gracePeriodExpiresDate`), and `5`, or a transaction with a `revocationDate`, `revoked`.
- **The app's transactions** apply a purchase or restore at once, before its notification arrives.
- **Whose purchase:** the account that holds its original transaction ID; else the account its
  `appAccountToken` names, and the route refuses any other account's
  (`409 subscription_belongs_to_another_account`); else, with no token or a token of an account
  since deleted, the first account the app sends it from, so an offer code redeemed in the App
  Store, or a subscription that outlived its account, still unlocks. A notification for a purchase
  no account holds is recorded and ignored, and the app's post claims it later.
- **The ledger** has each transaction as a charge, but a family member's, and each refund, with a
  partial refund's share.
- **Environments** (`APP_STORE_ENVIRONMENTS`): staging takes `Sandbox`; production takes
  `Production` and `Sandbox`, since App Review and TestFlight buy in the sandbox. `Xcode`, for a
  StoreKit configuration file's purchases, which Apple doesn't sign, is refused but at localhost.
- **No App Store Server API key** is needed: every state the service keeps comes signed from Apple.
  A notification Apple gave up on (it retries for three days) is caught up by the app, which sends
  what `Transaction.updates` hands it, a refund's revocation too.

## Settings

Each is a line in the environment's file ([`account-api.md`](account-api.md), Set up the server).

| Variable | Default | What it does |
| --- | --- | --- |
| `ACCOUNT_API_CLOUD_ACCESS` | `free` | `subscription` gates cloud data on a subscription. It needs Stripe or the App Store set up. |
| `ACCOUNT_API_CLOUD_FREE_FOR_ACCOUNTS_BEFORE` | none | An ISO 8601 time: accounts made before it keep syncing free. |
| `ACCOUNT_API_CLOUD_FREE_UNTIL` | none | An ISO 8601 time: every account syncs free until then. |
| `ACCOUNT_API_CLOUD_FREE_APPS` | none | App IDs from `src/domain/clients.ts` whose sync stays free, such as `tomodachi`. |
| `STRIPE_SECRET_KEY` | off | A restricted key (`rk_test_` on staging, `rk_live_` in production). A live key is refused at localhost. |
| `STRIPE_WEBHOOK_SECRET` | | The webhook endpoint's signing secret (`whsec_`). |
| `STRIPE_PRICE_IDS` | | The prices the website sells, comma-separated. Keep a retired price while anyone pays it. |
| `STRIPE_TRIAL_DAYS` | none | A free trial on each website checkout. |
| `STRIPE_GRACE_PERIOD_DAYS` | `0` | Days a failed renewal keeps the features while Stripe retries. |
| `APP_STORE_PRODUCT_IDS` | off | The App Store subscription products the app sells, comma-separated. Keep a retired one while anyone pays it. |
| `APP_STORE_ENVIRONMENTS` | | `Sandbox` on staging; `Production,Sandbox` in production. |
| `APP_STORE_APP_APPLE_ID` | | The app's Apple ID, a number; needed with `Production`. |

The service logs which it took when it starts: the cloud access, Stripe's mode, and the App
Store's environments.

## Set it up

The owner creates every account, product, key, and webhook; agents name them only. Staging uses
Stripe's test mode and Apple's sandbox, and production's keys never reach staging or a local run.

1. **nginx.** Add `webhooks` to the account service's location in both API host sites in the
   nginx repository: `location ~ ^/v1/(auth|me|sync|health|webhooks)(/|$)`
   ([`api-servers.md`](api-servers.md), The API host). `/v1/me/subscription` already goes there.
2. **Cloudflare.** Stripe and Apple post from their own servers, so make sure Bot Fight Mode lets
   them reach `/v1/webhooks/`: send a test event (step 3) and check it in the service's log.
3. **Stripe**, once in test mode for staging and once live for production:
   - **Products → Add product**: the subscription, with a recurring price for each plan. The
     price IDs are `STRIPE_PRICE_IDS`.
   - **Developers → Webhooks → Add endpoint**: `<ACCOUNT_API_URL>/v1/webhooks/stripe`, API version
     `2026-09-30.endive`, and the events `checkout.session.completed`,
     `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `customer.subscription.paused`,
     `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`, `refund.created`,
     `refund.updated`, and `refund.failed`. Its signing secret is `STRIPE_WEBHOOK_SECRET`.
   - **Developers → API keys → Create restricted key**, with write access to Checkout Sessions,
     Customer portal, Subscriptions, and Refunds, and read access to Invoices. It is
     `STRIPE_SECRET_KEY`. A call the key may not make is logged with `StripePermissionError`.
   - **Settings → Billing → Customer portal**: cancelling, updating the payment method, and invoice
     history on; the privacy policy and terms links.
   - **Settings → Billing → Subscriptions and emails → Manage failed payments**: the retry
     schedule, and what happens after the last retry. Cancelling the subscription ends it here.
   - **Settings → Emails**: receipts for payments and refunds, as the owner wants them.
4. **App Store Connect**, on the app's record:
   - **Business**: the Paid Applications Agreement, with its tax and banking, active.
   - **Monetization → Subscriptions**: a subscription group and its products, with prices and
     localizations, and any introductory offer. The product IDs are `APP_STORE_PRODUCT_IDS`.
     **Billing Grace Period** and each product's **Family Sharing** are set there too.
   - **App Information → App Store Server Notifications**: Version 2, the Production Server URL
     `https://api.zenbujapanese.com/v1/webhooks/apple`, and the Sandbox Server URL
     `https://api-staging.zenbujapanese.com/v1/webhooks/apple`.
   - **App Information → Apple ID**: `APP_STORE_APP_APPLE_ID`.
   - **Users and Access → Sandbox**: test accounts for staging's purchases.
5. **The environment files**: the settings above, then check the start's log line names them.
6. **Before production**, on staging: a sandbox purchase in the app and a test-mode purchase on the
   website each unlock sync, and a test-mode refund appears in `billing_ledger`, in the email the
   buyer gets, and in Stripe's dashboard.

## Code layout

- `src/domain`: `subscriptions.ts` (the rules above), `cloud-access.ts` (the gate's rule),
  `billing.ts` (what a store's adapter and the database give the rules: `BillingProvider`,
  `StoreBilling`, and `BillingStore`), `billing-events.ts` (an event, once, under its
  subscription's lock), `device-purchases.ts` (whose App Store purchase), and
  `subscription-billing.ts` (each route's work).
- `src/billing`: the stores' adapters, which turn Stripe's and Apple's objects into the domain's
  and call their APIs. They import no other layer.
- `src/db`: `billing-schema.ts` and `billing.ts`, the store the rules work through.
- `src/http`: `subscription.ts` (the routes and the gate), `webhooks.ts`, and their schemas.
- `src/billing-config.ts` reads the settings, below every layer, as `src/config.ts` does.

## Check it

The tests make no call to Stripe or Apple. `src/test/stripe.ts` answers Stripe's API from a
fetch handed to Stripe's SDK, and signs events as Stripe does; `src/test/app-store.ts` makes a
root, intermediate, and leaf certificate with Apple's markers, and signs transactions,
renewals, and notifications with them, which the service trusts in place of Apple's root.

- `src/http/stripe-webhook.test.ts`: a checkout, a bad signature and a changed body, a repeat, a
  renewal, a cancellation, a lapse and its recovery, a refund, events out of order, other
  products, a checkout for a deleted account or a second subscription, and Stripe down.
- `src/http/apple-notifications.test.ts`: a purchase, a forged or changed payload, another app or
  environment, a repeat, a renewal, auto-renew off and expiry, a billing retry and a grace period,
  a refund and its reversal, a partial refund, a late notification, and one no account holds.
- `src/http/subscription.test.ts`: the entitlement, the app's transactions and whose they are,
  Checkout, and the portal.
- `src/http/cloud-access.test.ts`: the gate on, applying nothing, and lifting with a subscription.
- `src/http/delete-subscribed-account.test.ts`: deletion with each store's subscription.
- `src/domain/subscriptions.test.ts`, `cloud-access.test.ts`, `src/billing/`, and
  `src/billing-config.test.ts`: the rules, the mappings, and the settings.
