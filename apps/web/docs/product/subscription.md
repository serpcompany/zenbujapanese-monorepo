# The subscription on the account page

`/account/` (Your account) shows the learner's Zenbu subscription, sells one through Stripe
Checkout, and opens Stripe's Customer Portal for one bought here (#868). One subscription unlocks
sync on every Zenbu app, wherever it was bought; the account service holds it
([`account-billing.md`](../../../../docs/agents/account-billing.md)), and the page reads it from
the learner's browser, as it does the rest of the account ([Account pages](account.md)). Until the
owner turns the gate on at the service, sync is free, and the page offers nothing.

Abbreviations: paths are under `apps/web/`. **Subscription tests** are
`src/components/account/subscription-section.interaction.test.tsx`, which click through the
section in a DOM with a stand-in for the service. **Subscription spec** is
`e2e/subscription.spec.ts`, the browser tests at a desktop and a phone width, with a stand-in for
the account service in the browser and for Stripe's pages, so nothing calls Stripe.

## What the page shows

**Each subscription still running,** with where it was bought (in the App Store, or on
zenbujapanese.com), its status (active, active with a failed payment, payment failed, waiting for
payment, paused), and when it renews or ends. An ended or refunded one shows its status when
nothing runs. A failed website payment says to update the payment method in Manage your
subscription; a failed App Store one says to update it in the App Store.

- Source: #868; the service's `GET /v1/me/subscription`, its `running` list and `managedIn`.
- Check: Subscription tests, "shows a website subscription with when it renews, and opens
  Stripe's portal" and "shows an App Store subscription as managed in the App Store, and offers no
  other"; Subscription spec, "a website subscription opens the Customer Portal, and no plan is
  offered" and "an App Store subscription is managed in the App Store, with no portal".

**Managed where it was bought.** One bought here has **Manage your subscription**, which opens
Stripe's Customer Portal (to change the plan, the payment method, see invoices, or cancel) and
comes back to the account page. One bought in the Zenbu Japanese app says it's managed in the App
Store, with a link to the Apple Account's subscriptions
(`https://apps.apple.com/account/subscriptions`), and no portal.

- Source: #868 (each subscription managed where it was bought).
- Check: the same tests, and Subscription spec's App Store test (the link's address).

**Paying in both stores** shows both, each managed where it was bought, and says to cancel the one
the learner doesn't need.

- Source: #868; the service lists every running subscription, since a learner can end up with
  two (a resubscription from iOS Settings, or an offer code, while the website one runs).
- Check: Subscription tests, "shows both subscriptions of a learner paying in both stores, each
  managed where it was bought"; Subscription spec, "a learner paying in both stores sees both, and
  how to stop paying twice".

## Subscribing

**The plans** show only when the service says sync needs a subscription for this account
(`cloudAccess: subscription_required`) and it may subscribe (`canSubscribe`, so never a second):
each of the service's `offers.website` prices, in its order, with Stripe's name, the price in its
currency for the page's language, its period, and a free trial when the service says this account
would get one. The section says what syncs and that everything else stays free, that Stripe's
checkout page takes the payment, and that it renews until canceled, here, at any time. Where only
the App Store sells it, the section says to subscribe in the app; where neither does, or sync is
free, there's no section.

- Source: #868; the service's `GET /v1/me/subscription/plans`.
- Check: Subscription tests, "offers each plan with its price and the trial, and opens Stripe
  Checkout to come back here", "offers nothing while sync is free, as before the owner turns the
  gate on", "shows nothing where neither store sells it, and sends to the app where only the App
  Store does", and "shows the plans in Japanese, with their prices in yen"; Subscription spec, "a
  learner who needs one sees the plans and goes to Stripe Checkout for one" and "the Japanese
  account page offers the plans in yen".

**Subscribe** opens Stripe Checkout for that price, through the service, to come back to the
account page (`?subscribed=1`) or, if the learner leaves Checkout, to the page as it was. Back
from Checkout, the page says it's confirming the payment and reads the subscription again, waiting
1, 2, 4, 8, then 15 seconds between reads, until it runs, then shows it; if it still doesn't, it
says Stripe can take a few minutes and to reload. A refusal says so: payments not answering, a plan no longer offered, or
a subscription already running.

- Source: #868; the service's `POST /v1/me/subscription/checkout` and `/portal`.
- Check: Subscription tests, "back from Checkout, reads the subscription again until it runs, or
  says Stripe is still confirming" and "says nothing changed when payments don't answer, or when
  the plan is gone".

## Deleting the account

Delete your account says, before and after, that an App Store subscription keeps billing until the
learner cancels it in their Apple Account's subscriptions, from the subscription the page read and
the service's answer (`appStoreSubscriptionContinues`), and that one bought here is canceled with
the account.

- Source: #868; the client guide
  ([`account-clients.md`](../../../../docs/agents/account-clients.md), Deleting the account).
- Check: Subscription tests, "says an App Store subscription keeps billing, before deleting and
  after" and "says a website subscription is canceled with the account".

## Words and languages

Every line is in English and Japanese, in `src/lib/i18n/dictionaries/` under
`account.subscription`, with the deletion lines and the refusals beside the account's others.
Prices use the page language's currency format (`Intl.NumberFormat`), so the same plan reads
`$4.99 a month` and `月額￥600`.

- Check: `src/lib/i18n/dictionaries.test.ts` (both languages have every key, and Japanese is
  stamped against the English it translates); the Japanese tests above.
