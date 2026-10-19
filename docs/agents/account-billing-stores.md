# Billing's stores

How the account service works with Stripe and the App Store, the settings each takes, and what the
owner sets up. The model they feed, and the gate, are in [`account-billing.md`](account-billing.md).

## Stripe

`src/billing/stripe.ts` is our own adapter on Stripe's Node SDK (`stripe`, pinned, API version
`2026-09-30.endive`). Better Auth's Stripe plugin doesn't fit: it records no event by its ID,
keeps no ledger, handles no invoice or refund, models only Stripe's subscriptions in a table of
its own, adds a column to `users`, puts its routes inside sign-in's, and takes Stripe's SDK only up
to version 22.

- **Checkout** is Stripe's hosted page, in subscription mode, for one price, with the account's ID
  as `client_reference_id` and in the subscription's metadata (`zenbu_account`), open for 30
  minutes. An account's second checkout reuses its Stripe customer. The page is in the request's
  `Content-Language`. `STRIPE_TRIAL_DAYS` applies only to an account that has never subscribed;
  a learner who deletes their account and signs up again can have the trial again.
- **The webhook** checks `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET` before reading the body,
  and refuses, and logs, a signed event it can't read, such as a thin one
  (`400 unreadable_event`). Then, outside any database transaction, it reads what the event is
  about from Stripe: the subscription, for `checkout.session.completed`,
  `.async_payment_succeeded`, and `.async_payment_failed`, `customer.subscription.created`,
  `.updated`, `.deleted`, `.paused`, and `.resumed`, `invoice.paid`, and
  `invoice.payment_failed`; and the invoice a refund or dispute was against, for `refund.created`,
  `.updated`, and `.failed`, `charge.dispute.created` and `.closed`, and
  `radar.early_fraud_warning.created`. Only then does it open a transaction, which no Stripe call
  holds open.
- **The account** is the one the subscription's metadata names, else the checkout's
  `client_reference_id`, else the one whose Stripe customer it is.
- **Statuses:** `active` and `trialing` are `active`, but `pending` while the first invoice is
  unpaid, as with a bank debit or konbini, which Stripe marks active before the money arrives;
  `past_due` and `unpaid` are `billing_retry`, and the first `STRIPE_GRACE_PERIOD_DAYS` from the
  first failure are `grace_period`; `incomplete` is `pending`; `canceled` and `incomplete_expired`
  are `expired`.
- **A refund** is recorded and changes no access: ending the subscription does, so refund and
  cancel together in Stripe's dashboard. **A dispute** and **an early fraud warning** are recorded
  and change no access.
- **Unwanted subscriptions are refunded and canceled:** a checkout that completes while the
  account's other subscription still runs (two checkout tabs, or the app's purchase first), and
  any event of a running subscription whose account was deleted. The account is locked while that
  is decided, so two checkouts that complete at once keep exactly one. The refund is owed
  (`account-billing.md`, The model): the cancel comes first, the refund follows with a Stripe
  idempotency key, retried until Stripe takes it, and one Stripe refuses for good, such as a
  disputed charge, is logged and leaves the cancel standing. An App Store purchase can't be
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
- **Whose purchase:** the account its `appAccountToken` names, so a resubscription bought from
  another account, which keeps the original transaction ID, moves the subscription there; the
  route refuses any other account's (`409 subscription_belongs_to_another_account`). With no token,
  or a token of an account since deleted, it's the account that holds its original transaction
  ID, else the first account the app sends it from, so an offer code redeemed in the App Store, or
  a subscription that outlived its account, still unlocks. An older period never moves it back. A
  notification for a purchase no account holds is recorded and ignored, and the app's post claims
  it later.
- **The ledger** has each transaction as a charge, but a family member's, and each refund, with a
  partial refund's share; a revocation that isn't a refund, such as Family Sharing's, revokes
  access and records no refund.
- **Environments** (`APP_STORE_ENVIRONMENTS`): staging takes `Sandbox`; production takes
  `Production` and `Sandbox`, since App Review and TestFlight buy in the sandbox. With
  `APP_STORE_SANDBOX_ACCOUNTS` set, production counts a Sandbox subscription only for those
  accounts' emails, such as App Review's demo account; unset, every TestFlight tester's counts.
  `Xcode`, for a StoreKit configuration file's purchases, which Apple doesn't sign, is refused but
  at localhost.
- **The App Store Server API**, when its key is set: a purchase the app sends is answered with
  Apple's current status for it (Get All Subscription Statuses), which also ends a billing retry
  whose last notification was lost, and every hour the service reads the last 80 hours of
  notifications (Get Notification History) and applies any it missed. Without the key, every state
  still comes signed from Apple, but a notification that never arrived (the sandbox sends each
  once; production retries for about three days) is caught up only when the learner's app next
  sends what `Transaction.updates` hands it.

## Settings

Each is a line in the environment's file ([`account-api.md`](account-api.md), Set up the server).

| Variable | Default | What it does |
| --- | --- | --- |
| `ACCOUNT_API_CLOUD_ACCESS` | `free` | `subscription` gates cloud data on a subscription. It needs the App Store set up, unless the iOS app is in the free apps. |
| `ACCOUNT_API_CLOUD_FREE_FOR_ACCOUNTS_BEFORE` | none | An ISO 8601 time: accounts made before it keep syncing free. |
| `ACCOUNT_API_CLOUD_FREE_UNTIL` | none | An ISO 8601 time: every account syncs free until then. |
| `ACCOUNT_API_CLOUD_FREE_APPS` | none | App IDs from `src/domain/clients.ts` whose sync stays free, such as `tomodachi`. |
| `STRIPE_SECRET_KEY` | off | A restricted key (`rk_test_` on staging, `rk_live_` in production). A live key is refused at localhost. |
| `STRIPE_WEBHOOK_SECRET` | | The webhook endpoint's signing secret (`whsec_`). |
| `STRIPE_PRICE_IDS` | | The prices the website sells, comma-separated. Keep a retired price while anyone pays it. |
| `STRIPE_TRIAL_DAYS` | none | A free trial on an account's first website checkout. |
| `STRIPE_GRACE_PERIOD_DAYS` | `0` | Days from a renewal's first failure that keep the features while Stripe retries. |
| `APP_STORE_PRODUCT_IDS` | off | The App Store subscription products the app sells, comma-separated. Keep a retired one while anyone pays it. |
| `APP_STORE_ENVIRONMENTS` | | `Sandbox` on staging; `Production,Sandbox` in production. |
| `APP_STORE_APP_APPLE_ID` | | The app's Apple ID, a number (`6800229215`); needed with `Production`. |
| `APP_STORE_SANDBOX_ACCOUNTS` | everyone | With `Production,Sandbox`, the emails whose Sandbox subscriptions count, comma-separated. |
| `APP_STORE_KEY_ID`, `APP_STORE_ISSUER_ID`, `APP_STORE_PRIVATE_KEY` | off | The App Store Server API's In-App Purchase key: its ID, the issuer ID, and the `.p8` with its newlines written as `\n`. |

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
   - **Developers → Webhooks → Add destination**: the **Snapshot** payload, API version
     `2026-09-30.endive`, and the events `checkout.session.completed`,
     `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
     `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, and `.resumed`,
     `invoice.paid`, `invoice.payment_failed`, `refund.created`, `refund.updated`,
     `refund.failed`, `charge.dispute.created`, `charge.dispute.closed`, and
     `radar.early_fraud_warning.created`, to `<ACCOUNT_API_URL>/v1/webhooks/stripe`. A Thin
     destination fails every event (`unreadable_event`). Its signing secret is
     `STRIPE_WEBHOOK_SECRET`.
   - **Developers → API keys → Create restricted key**, with write access to Checkout Sessions,
     Customer portal, Subscriptions, and Charges (Stripe's `charge_write`, which covers refunds),
     and read access to Invoices. It is `STRIPE_SECRET_KEY`. A call the key may not
     make is logged with Stripe's error, which names the permission to add.
   - **Settings → Billing → Customer portal**: cancelling, updating the payment method, and invoice
     history on; the privacy policy and terms links.
   - **Settings → Billing → Subscriptions and emails → Manage failed payments**: the retry
     schedule, and what happens after the last retry. Cancelling the subscription ends it here.
   - **Settings → Payments → Payment methods**: which the website offers, delayed ones such as
     konbini and bank debits included or not.
   - **Settings → Emails**: receipts for payments and refunds, as the owner wants them.
4. **App Store Connect**, on the app's record:
   - **Business**: the Paid Apps Agreement, with its tax and banking, active.
   - **Monetization → Subscriptions**: a subscription group and its products, with prices and
     localizations, and any introductory offer. The product IDs are `APP_STORE_PRODUCT_IDS`.
     **Billing Grace Period** and each product's **Family Sharing** are set there too.
   - **App Information → App Store Server Notifications**: Version 2, the Production Server URL
     `https://api.zenbujapanese.com/v1/webhooks/apple`, and the Sandbox Server URL
     `https://api-staging.zenbujapanese.com/v1/webhooks/apple`.
   - **Users and Access → Integrations → In-App Purchase**: a key for the App Store Server API, if
     the service should read Apple's status and missed notifications: `APP_STORE_KEY_ID`,
     `APP_STORE_ISSUER_ID`, and the `.p8`, which downloads once.
   - **Users and Access → Sandbox**: test accounts for staging's purchases, and App Review's demo
     account's email in production's `APP_STORE_SANDBOX_ACCOUNTS`.
5. **The environment files**: the settings above, then check the start's log line names them.
6. **Before production**, on staging: a sandbox purchase in the app and a test-mode purchase on the
   website each unlock sync, and a test-mode refund appears in `billing_ledger`, in the email the
   buyer gets, and in Stripe's dashboard.
