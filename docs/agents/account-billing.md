# Account billing

The account service sells one subscription, which unlocks syncing and the account's other cloud
features (#868). A learner buys it in the app, with Apple's in-app purchase, or on the website,
with Stripe, and either unlocks the same account everywhere. Each is managed where it was bought.
Everything on the device stays free. The service records the subscription itself, with no
third-party entitlement service ([ADR 0017](../adr/0017-sell-one-subscription-through-the-app-store-and-stripe.md)).
Each store, its settings, and the owner's setup are in [`account-billing-stores.md`](account-billing-stores.md).

Until the owner turns it on, nothing is paid: `ACCOUNT_API_CLOUD_ACCESS` is `free` unless set, so
every account syncs as before, and the stores are off until their settings are set.

## The model

`src/domain/subscriptions.ts` holds the rules; the tables are in `src/db/billing-schema.ts`.

- **A subscription** is one row in `subscriptions` per store's subscription: `apple` and its
  original transaction ID, or `stripe` and its subscription ID. Each keeps the product (the App
  Store product's ID, or the Stripe price's), a status, when its paid time ends, whether it renews,
  the store's environment, when its payments started failing, and its account. One store's events
  change only its own rows, so an App Store notification can't end a website subscription.
- **The entitlement** is the account's one answer, made from its subscriptions: the one giving
  access, else one still running at its store, else the latest. It names its source, product,
  status, expiry, and where it's managed, and lists every subscription still running (`running`),
  so a learner who pays in both stores sees both and can manage each where it was bought.
- **Statuses:** `active` (paid through `expiresAt`), `grace_period` (a renewal failed and the store
  retries, features on until `expiresAt`), `billing_retry` (the same, features off), `pending` (a
  first payment not yet made), `paused`, `expired`, and `revoked` (refunded, or revoked by Apple).
  Only `active` and `grace_period` give access. An `active` subscription set to renew keeps its
  features for a day past `expiresAt` (`renewalLeewayMs`), so a renewal that reaches the service
  late cuts nothing off.
- **Running** means giving access, in a billing retry, or paused. An App Store one counts for at
  most 60 days from the first failure or the last word (`billingRetryWindowMs`, Apple's retry
  window), so a lost last notification can't block subscribing forever; a website one counts until
  Stripe ends it, since Stripe can retry for two months and revive an unpaid one. Each store's
  traits are in `src/billing/stores.ts`, by the source on each row, whether or not the store is set
  up. A pending first payment isn't running.
- **No second subscription.** `canSubscribe` is false while any subscription runs, so neither
  client offers another, and `POST /v1/me/subscription/checkout` refuses one
  (`409 already_subscribed`).
- **Order.** A store's state replaces the one kept when its period started later, or, for the same
  period, when the store said it later: Apple's `signedDate`, or when the service began reading the
  subscription from Stripe, so a slower, older read never replaces a newer one. A state from the
  device, which carries no renewal details, replaces a store's state for the same period only to
  revoke it, and only when Apple signed it later (`supersedes`).
- **`billing_customers`** gives each account its `appAccountToken`, a random UUID made the first
  time the account asks for its subscription, and its Stripe customer once it has one.
- **The ledger**, `billing_ledger`, holds every charge attempt, refund, dispute, and early fraud
  warning, once each by store and reference: a paid Stripe invoice by its ID, each failed attempt
  on it by its event, a refund or dispute by its ID; an App Store transaction by its ID. Each names
  its subscription, and a Stripe refund or dispute the invoice it was against. Amounts are in the
  currency's smallest unit; Apple's come from the transaction's `price`, which Apple says not to
  reconcile revenue by, so App Store Connect's reports are the record of what Apple paid. An
  outcome moves on only to a later one, by when the store said it (`outcome_at`): a `pending` never
  replaces a known outcome, a retried older event never replaces a newer one, and nothing replaces
  a charge that succeeded.
- **Events.** `billing_events` records each store event once, by its ID (Stripe's event ID, Apple's
  `notificationUUID`), with what it did: `applied`, or `ignored` when it names no account here or a
  product not sold here. A repeat answers `200` and changes nothing. The event is recorded in the
  same transaction as what it changes, so one that fails is never recorded and the store sends it
  again. Events are kept, as the ledger is: a few rows a subscriber a month.
- **Owed refunds.** A subscription the service has to refund and cancel is a row in
  `billing_actions`, written in the event's transaction and done after it commits, by the event's
  request and by a sweep every minute: each is claimed for 5 minutes as it runs, one at a time,
  and a failure is tried again 5 minutes later. After 48 attempts (about 4 hours) it gives up and
  logs `billing: gave up on an owed refund and cancel`, leaving the row with `done_at` and its
  `last_failure`, to end by hand in Stripe's dashboard. A failure of the sweep itself is logged,
  never left to crash the service. A subscription being ended this way doesn't count as another
  one running.
- **Deleted accounts.** `deleted_accounts` keeps the ID of each account deleted, and when, so a
  running subscription that names a missing account is refunded and canceled only when the
  account was deleted before the event's read of Stripe began: never because a restore rolled the
  database back past it (that one is logged, [`account-backups.md`](account-backups.md)), and never
  from a read older than the deletion, which canceled it with no refund.
- **Deleting an account** first checks that every website subscription can be ended
  (`503 billing_unavailable` when Stripe is off and one may still bill), revokes Apple sign-in,
  cancels the website subscription at Stripe with no refund, then deletes the account. Its answer
  says whether an App Store subscription still runs and renews (`appStoreSubscriptionContinues`),
  which Apple bills until the learner cancels it. The account's subscriptions stay, with no
  account, so a refunded App Store purchase stays refunded; its customer row goes, and its ledger
  rows and events stay, with no account. The Stripe customer, with its email and saved card, stays
  at Stripe.

## Routes

| Route | What it does |
| --- | --- |
| `GET /v1/me/subscription` | The entitlement, `running`, `canSubscribe`, `cloudAccess` (what sync does for this app now), the `appAccountToken`, and the offers: the App Store product IDs and Stripe price IDs. |
| `POST /v1/me/subscription/apple` | The app sends a StoreKit 2 transaction after a purchase, a restore, or an update. |
| `POST /v1/me/subscription/checkout` | Stripe Checkout's URL for one of the website's prices. |
| `POST /v1/me/subscription/portal` | The Stripe Customer Portal's URL, for any account that has bought on the website. |
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
- **Manage** each subscription in `running` where its `managedIn` says. `app_store`: the app opens
  the App Store's subscription settings, and the website says it's managed in the App Store.
  `website`: the website opens `POST /v1/me/subscription/portal`'s URL, and the app says it's
  managed on the website. Two running means the learner pays twice: show both.
- **The app** sets the account's `appAccountToken` on every purchase, and sends each verified
  transaction's `jwsRepresentation` to `POST /v1/me/subscription/apple`: after a purchase, from
  `Transaction.updates`, and on a restore. It finishes a transaction once the service answers `200`
  or a `4xx`, and leaves it for StoreKit to hand over again after a `5xx`. A
  `409 subscription_belongs_to_another_account` means the Apple ID's subscription is another Zenbu
  account's: say so, and offer nothing.
- **The website** opens `POST /v1/me/subscription/checkout`'s URL, sending the page's
  `Content-Language`, and on its success page reads the subscription again until it's `active`,
  since Stripe's event reaches the service a few seconds after the learner pays.
- **Deleting an account** with an App Store subscription: every app, Tomodachi too, tells the
  learner when `DELETE /v1/me` answers `appStoreSubscriptionContinues`, and an app that can read the
  subscription says so before deleting, with the App Store's settings. A website one ends with it.
- **Tomodachi** has no `subscription` scope; whether its sync is free is `ACCOUNT_API_CLOUD_FREE_APPS`.

## The gate

`cloudDataPaths` in `src/http/subscription.ts` lists the routes that hold cloud data, and
`requireCloudAccess` gates each, after the access token and before anything applies. Today it is
`POST /v1/sync`, which every synced entity passes through, so a new entity is gated with no change
here. A test walks every route in the contract and fails on one neither in `cloudDataPaths` nor on
its list of routes kept free (signing in, the profile, the subscription, the webhooks), so a new
route, such as #867's photos, must be put on one. Deleting the account and the dictionary are free.

`cloudAccess` (`src/domain/cloud-access.ts`) decides, from the settings: an account with an
active subscription syncs; with `ACCOUNT_API_CLOUD_ACCESS=free`, everyone syncs; otherwise an app
in `ACCOUNT_API_CLOUD_FREE_APPS`, an account made before
`ACCOUNT_API_CLOUD_FREE_FOR_ACCOUNTS_BEFORE`, and every account until
`ACCOUNT_API_CLOUD_FREE_UNTIL` sync too, and the rest get `402`. The refusal applies nothing and
deletes nothing: the device keeps its changes, and the account's cloud copy stays. The gate can't
cover the iOS app without the App Store set up, since the app must sell it in-app (App Review
3.1.1).

## Code layout

- `src/domain`: `subscriptions.ts` (the rules above), `cloud-access.ts` (the gate's rule),
  `billing.ts` (what a store's adapter and the database give the rules: `BillingProvider`, the
  website's store, `StoreBilling`, the app's, and `BillingStore`), `billing-events.ts` (an event,
  once, under its subscription's lock), `device-purchases.ts` (whose App Store purchase), and
  `subscription-billing.ts` (each route's work). Its rules key each subscription by the source its
  adapter names and take each store's traits as a setting; the names that remain are the roles'
  (the website's customer is Stripe's, `stripeCustomerId`, and the app's purchases Apple's).
- `src/billing`: the stores' adapters, which turn Stripe's and Apple's objects into the domain's
  and call their APIs. They import only the domain's types and rules, and no other layer.
- `src/db`: `billing-schema.ts` and `billing.ts`, the store the rules work through.
- `src/http`: `subscription.ts` (the routes and the gate), `webhooks.ts`, and their schemas.
- `src/billing-config.ts` reads the settings, below every layer, as `src/config.ts` does.

## Check it

The tests make no call to Stripe or Apple. `src/test/stripe.ts` answers Stripe's API from a
fetch handed to Stripe's SDK, and signs events as Stripe does; `src/test/app-store.ts` makes a
root, intermediate, and leaf certificate with Apple's markers, signs transactions, renewals, and
notifications with them, which the service trusts in place of Apple's root, and answers the App
Store Server API.

- `src/http/stripe-webhook.test.ts`: a checkout, a bad signature and a changed body, a repeat, a
  renewal, a cancellation, a lapse and its recovery, a refund, events out of order, other
  products, a checkout for a deleted account or a second subscription, a running subscription
  whose account was deleted or only rolled back, a refund that fails for now or for good, a paid
  invoice whose failed attempt arrives late, and Stripe down.
- `src/http/stripe-payments.test.ts`: a grace period from the first failure, a delayed first
  payment, a dispute and a fraud warning, a refund linked and ordered, and a thin event.
  `src/http/owed-refunds.test.ts`: no Stripe call in a transaction, a konbini refund's email, one
  owed refund claimed at a time, giving up loudly, a failed sweep logged, and a read from before
  a deletion refunding nothing.
- `src/http/apple-notifications.test.ts`: a purchase, a forged or changed payload, another app or
  environment, a repeat, a renewal, auto-renew off and expiry, a billing retry and a grace period,
  a refund and its reversal, a partial refund, a late notification, a resubscription bought from
  another account, and one no account holds. `src/http/app-store-api.test.ts`: the App Store
  Server API's status and missed notifications, sandbox purchases in production, and a revocation
  that isn't a refund.
- `src/http/subscription.test.ts`: the entitlement, both stores at once, the app's transactions and
  whose they are, Checkout, and the portal. `src/http/cloud-access.test.ts`: the gate, and every
  route on it or kept free.
- `src/http/delete-subscribed-account.test.ts`, `delete-with-stripe-off.test.ts`, and
  `delete-with-app-store-off.test.ts`: deletion with each store's subscription, a refunded purchase
  after it, with either store off, and an App Store one that won't renew.
- `src/db/billing-races.test.ts`, on a real Postgres (`ACCOUNT_API_TEST_DATABASE_URL`, as in CI):
  two checkouts for one account completing at once, and the subscription lock holding a second
  writer.
- `src/domain/subscriptions.test.ts`, `cloud-access.test.ts`, `src/billing/`, and
  `src/billing-config.test.ts`: the rules, the mappings, and the settings.
