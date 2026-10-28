---
status: accepted
---

# Sell one subscription through the App Store and Stripe

Zenbu sells one subscription, which unlocks syncing and the account's other cloud features, and
everything on the device stays free (Devin, 2026-10-18, #868). A learner buys it in the app
through Apple's in-app purchase or on the website through Stripe, and either unlocks the account
everywhere, managed where it was bought, as ChatGPT and Claude do (the owner, 2026-10-18).

**The account service keeps the subscription, built by us** (the owner, 2026-10-19). There is no
third-party entitlement service such as RevenueCat. Each store's adapter sits behind the
domain's interfaces (SERP's [payments standard](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/web-stack/payments.md)),
with the account service's Postgres in place of D1: a ledger of every charge and refund, each
store's events recorded once by ID, and every answer read from the service's own tables, never
from a store on a request. The apps and the website read one entitlement from
`GET /v1/me/subscription`, and the service refuses cloud data without it, so a client can't
unlock what the server didn't.

**Stripe through our own adapter, not Better Auth's Stripe plugin.** The plugin records no event
by its ID, keeps no ledger, handles neither invoices nor refunds, models only Stripe's
subscriptions, adds a column to `users`, and serves its routes inside sign-in's, so it would
leave Apple's subscriptions in a second model and the standard unmet. The adapter is Stripe's own
SDK. It reads each subscription from Stripe when an event about it arrives, before opening a
database transaction, and a read that started later wins, so deliveries out of order leave the
latest state and no Stripe call holds a database connection. Refunds the service owes are done
after the event commits, and retried until Stripe takes them.

**The App Store through Apple's App Store Server Library.** It checks every signed transaction and
notification against Apple's root certificate. Each purchase carries the account's
`appAccountToken`, so it belongs to the Zenbu account rather than to an Apple ID alone. Every
state the service keeps comes signed from Apple, in the app's post or in a notification; with an
App Store Server API key, it also asks Apple for a purchase's current status and for the
notifications it missed.

**Sandbox purchases in production.** App Review and TestFlight buy in Apple's sandbox, so
production must take sandbox purchases or the reviewer's purchase unlocks nothing. Taken from
everyone, any TestFlight tester syncs free in production, and their sandbox renewals notify
staging; taken only from `APP_STORE_SANDBOX_ACCOUNTS`, testers don't, and neither does App Review, which
has no demo account (#932). Which is the owner's to choose.

**One subscription per store, one entitlement per account.** The service keeps each store's
subscription in its own row and makes the account's entitlement from them, so one store's events
never overwrite the other's, and a learner who somehow pays both keeps access while either runs.

**What's still the owner's** is a setting, not code: the plans and prices (the stores' products,
named in `STRIPE_PRICE_IDS` and `APP_STORE_PRODUCT_IDS`), whether sync needs the subscription and
for whom it stays free (`ACCOUNT_API_CLOUD_ACCESS` and its exemptions), Stripe's trial and grace
period, and Apple's grace period and Family Sharing in App Store Connect. Until set, sync stays
free for everyone.

## Consequences

- Moving off a store, or to SERP's Lago, means a new adapter, not new rules.
- Apple's and Stripe's events reach the service at `/v1/webhooks/`, through the API host, which
  routes that path to it.
- Deleting an account ends its Stripe subscription first; an App Store subscription can only be
  ended by the learner, so the app says so before deleting.
- The rules for a lapse, a refund, and an orphaned purchase live in `src/domain` and are tested
  with signed sample events from both stores; no test calls a store.
