# The app's subscription

How the app on iPhone, iPad, and the Mac sells and shows the subscription that unlocks syncing
(#868). The service's side, the entitlement and its rules, is in
[`account-billing.md`](account-billing.md); what a learner sees, with each check, is in the product
docs' [The subscription](../../apps/ios/docs/product/account-sync.md#the-subscription).

## Apple's rules, and what the app does

Read on 2026-10-19 from the [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
and Apple's [Payment options on the App Store in Japan](https://developer.apple.com/support/payment-options-on-the-app-store-in-japan/).

- **3.1.1, In-App Purchase:** unlocking features, a subscription included, must use in-app purchase,
  with "a restore mechanism for any restorable in-app purchases". The app sells only through
  StoreKit 2, and has **Restore Purchases** on the paywall and on Zenbu Account. The service won't
  gate the iOS app's sync unless the App Store is set up ([`account-billing.md`](account-billing.md),
  The gate).
- **3.1.1(a) and 3.1.3:** outside the United States storefront, apps "may not include buttons,
  external links, or other calls to action that direct customers to purchasing mechanisms other
  than in-app purchase"; on the US storefront that prohibition doesn't apply, and elsewhere a link
  needs one of Apple's entitlements. One build serves every storefront, so the app has no link or
  button to the website's checkout or portal anywhere.
- **3.1.3(b), Multiplatform Services:** an app may let learners use a subscription bought on the
  website, "provided those items are also available as in-app purchases within the app". A website
  subscription unlocks sync in the app, which sells the same one in-app. The app says such a
  subscription "is managed there", with no link: a statement about one already bought, not a call to
  buy. Japan's page doesn't address this case; App Review is the one to confirm it.
- **3.1.2(a):** a subscription "must work on all of the user's devices where the app is available".
  It belongs to the Zenbu account, so it unlocks every device and app signed in to it.
- **3.1.2(c):** "before asking a customer to subscribe, you should clearly describe what the user
  will get for the price", with Schedule 2's terms. The paywall says what syncs and that the rest
  stays free, lists each plan's name, description, price, and period from StoreKit, says how it
  renews and where to cancel, and links the Terms of Use and the Privacy Policy.
- **5.1.1(v):** apps with accounts "must also offer account deletion within the app"; it says
  nothing about subscriptions. Deleting an account with an App Store subscription says Apple keeps
  billing until the learner cancels it, and opens the App Store's settings, since the service can't
  end one.
- **The United States**, where links out are allowed: Apple's commission on them is unsettled. The
  Ninth Circuit upheld the contempt finding in December 2025 but let Apple charge a fee tied to its
  costs, the Supreme Court agreed on June 30, 2026 to review it, and Apple proposed 15% (5% for small
  businesses) in August 2026; no rate was set as of August 16, 2026
  ([The Next Web](https://thenextweb.com/news/supreme-court-apple-epic-contempt-app-store-commission),
  [iPhone in Canada](https://www.iphoneincanada.ca/2026/08/14/apple-proposes-15-cut-purchases-outside-app-store/),
  [Courthouse News](https://api.courthousenews.com/apples-fight-over-commissions-for-linked-out-app-store-purchases-continues-in-federal-court/)).
  The app doesn't link out; doing so on the US storefront is the owner's choice.
- **Japan (the MSCA), from iOS 26.2:** an app may offer purchases on its website, with an actionable
  link only with the StoreKit External Purchases or Offers entitlement
  (`com.apple.developer.storekit.custom-purchase-link.allowed-regions`: `jp`), in-app purchase shown
  beside it at least as prominently, Apple's disclosure sheet before leaving, parental consent for
  minors, and a 15% commission (10% on a subscription after its first year) on sales within 7 days
  of the tap. The product page may not mention buying on the website. The app doesn't use it; that
  is the owner's choice too.

## How it works

The code is in `SearchExperience`: `AccountSubscriptionModels.swift` (the service's answer and the
store's protocol), `AccountSubscription.swift` (reading, buying, restoring, and the listener),
`StoreKitPurchases.swift` (StoreKit 2), `SubscriptionViews.swift` (Zenbu Account's section and the
paywall), `Platform/SubscriptionSettings.swift`, and `DeleteAccountView.swift`.

- **Reading.** `GET /v1/me/subscription` after signing in, at launch once the account's file has
  loaded, on becoming active, and on opening Zenbu Account. The answer is kept in
  `account-subscription.json` beside `account-sync.json`, for that account only, and shown offline.
  An answer that comes after the learner signed out or switched accounts is dropped. A purchase's
  answer wins over every read asked before it arrived, and reads count in the order they were
  asked, so a slow read can't undo a purchase. Sync and the subscription asking at once share one
  access token refresh (`AccountTokens`), which lasts until it's done even when the request that
  started it stops waiting, and a `401` refreshes through the same one.
- **Offering.** **Subscribe to Sync…** shows only when the service says sync needs a subscription
  (`cloudAccess: subscription_required`), `canSubscribe` is true, the App Store offers products,
  the Apple Account has no subscription of its own running, and no `409` is waiting, so no learner
  is offered a second subscription or one sync doesn't need. Opening the paywall and buying read the
  subscription again first: buying needs that fresh answer, says so when the service can't be
  reached or fails (`unreachable`, or `serviceFailed` for a `5xx` or `429`, each with **Try
  Again** on the paywall, as is the App Store not answering), and refuses when it's no longer
  offered (a website purchase that just landed). When
  nothing is offered the paywall says why (the Apple Account already subscribes, a first payment
  is on its way, sync needs none now, the account has one), and an App Store that sells none of
  the plans says so.
  The products are the service's `offers.appStore`, in its order, read from StoreKit; the app names
  none itself. A plan's introductory offer, a free trial or a lower first price, shows with its
  terms when StoreKit says the Apple Account may have it (`isEligibleForIntroOffer`).
- **Buying.** The paywall buys through SwiftUI's `PurchaseAction` (`@Environment(\.purchase)`),
  so StoreKit's sheet belongs to the paywall's scene, with `.appAccountToken(token)` set to the
  account's token; then the verified transaction's `jwsRepresentation` goes to
  `POST /v1/me/subscription/apple`. The
  transaction is finished after a `200`, and after the two refusals that are final for it: `409`
  (another account's) and `400 invalid_transaction` (Apple didn't sign it for this app). Any other
  refusal, a `5xx`, or no network leaves it unfinished, so StoreKit hands it over again; another
  `4xx`, such as `400 unknown_product` or `403`, also says the purchase hasn't reached the account
  yet (`purchaseNotApplied`). Ask to Buy says it's waiting, across a
  relaunch, for a day, or until the approved purchase arrives or the learner tries again; a `409`
  says the Apple Account's subscription is another Zenbu account's, until the learner signs out, a
  purchase goes through, or the Apple Account no longer has one. These notes are kept for the
  account they were made for, and VoiceOver reads each new one once.
- **Listening.** From launch, once the account's file has loaded, `Transaction.updates` are sent
  the same way: a renewal, an approval, an offer code, a refund. `Transaction.unfinished` is sent
  after each read of the subscription (at launch, on becoming active, and after signing in), so a
  purchase left unfinished goes again. A transaction is sent once at a time and, once finished,
  not again until the next sign-in, unless StoreKit signs it again (a refund or an
  upgrade of the same transaction). A signed-out app sends and finishes nothing, so they
  wait for the next sign-in.
- **Signing in and restoring.** Signing in sends `Transaction.currentEntitlements`, so the Apple
  Account's subscription unlocks the account or says it's another's. **Restore Purchases** calls
  `AppStore.sync()` first, and says so when the Apple Account has nothing to restore.
- **Managing.** Each subscription in `running` where it was bought: an App Store one with StoreKit's
  `manageSubscriptionsSheet` on iPhone and iPad, and on the Mac, which has no such sheet, the App
  Store's page `https://apps.apple.com/account/subscriptions` (`appStoreSubscriptionSettings`, the
  one place `pnpm verify layers` lets code name the sheet). It says the Apple Account that bought it
  manages it. A website one is a plain statement, and a failed website payment says only that it
  failed, with no step to take there. Paying in both stores shows both, and says to cancel one.
- **Sync.** While the answer says sync needs a subscription, the app sends no `POST /v1/sync`,
  which the service would refuse; the queue waits, the profile photo in it, and the profile's name
  and username, which stay free, go alone through `PATCH /v1/me`; an edit whose answer was lost is recognized after the service's
  `409`, by the account already holding it, so the edits after it go on. A waiting sync reads the
  subscription again at most every 5 minutes, and **Sync Now** reads it first, so a website
  purchase made while the app is open unlocks sync without a relaunch. A
  `402 subscription_required`, from the sync or a photo file's upload or download, keeps the
  queue and the photos, and reads the subscription again. The Account row and Zenbu Account say why sync waits: no subscription, a payment being
  retried, a paused subscription, or a first payment still to come. A subscription that turns
  active, or an answer that lets sync go, syncs at once.
- **Deleting.** The sheet warns while an App Store subscription runs, and afterwards when
  `DELETE /v1/me` answers `appStoreSubscriptionContinues`; it says a website one is canceled.

## Test it

- **Package tests**, on iPhone, iPad, and the Mac (`ios.md`, Tests on every platform), against
  `StubAccountServer` and `FakeAppStore`: `AccountSubscriptionTests` (buying, refusals, Ask to Buy,
  restoring, listening, offering nothing while sync is free, the website or the Apple Account
  already has one, or the store sells none, buying only on a fresh read, a purchase's answer over
  an older read, and an update signed again), `AccountSubscriptionStateTests` (switching accounts,
  late and out-of-order answers, a relaunch, sync and the profile while sync waits, Sync Now and
  the waiting read, a profile edit after a lost answer, decoding, and deleting),
  `AccountSubscriptionNotesTests` (each note, how long it lasts, whose it is, why nothing is
  offered, and what VoiceOver hears), `SubscriptionTextTests` (each state's words, and the links
  matching the listing), and `AccountTokenRefreshTests` (the shared refresh, a cancelled starter,
  and two `401`s). A reply the test sends later is a `LaterReply`, which holds no thread.
- **StoreKit tests**, `ZenbuJapaneseStoreKitTests` (`apps/ios/StoreKitTests/`), on iPhone, iPad,
  and the Mac: `StoreKitPurchasesTests` runs `StoreKitPurchases` against StoreKit itself, through
  `SKTestSession` and the StoreKit configuration file `apps/ios/App/ZenbuSync.storekit` (a monthly
  and a yearly plan with a free week, in one group): the products, their prices, and the free week
  only for an Apple Account that hasn't had the plan, a purchase whose signed transaction carries
  the account's token, the Apple Account's current purchases, a purchase made outside the app and
  not finished and handed over once, Ask to Buy and its approval, a refund, a renewal, an expiry,
  restoring with `AppStore.sync()`, and a product StoreKit doesn't sell, each waiting for
  StoreKit's own state. StoreKit
  Testing needs an app to host it, which the package's tests don't have, so this target runs inside
  the app, with its other two source files compiled in, and the scheme runs it with the UI tests
  (the same `xcodebuild … test` command, `ios.md`, Tests on every platform). `xcodebuild` doesn't
  apply a scheme's StoreKit configuration to the UI tests' app, so they don't use one.
- **UI tests**, `SubscriptionUITests`, on iPhone and iPad (skipped on the Mac, which can't keep a
  session in a build signed to run locally): buying unlocks sync and offers no second
  subscription, a website subscription, a website payment that failed, sync waiting while an App
  Store payment is retried, paying in both stores, an ending subscription with **Manage in the App
  Store** opening the App Store's subscriptions (a stand-in sheet), and deleting with an App Store
  one that renews, with Debug-only
  stand-ins: `ZENBU_APP_STORE_STAND_IN=1` (`StandInAppStore`: the same plans, and a purchase that
  completes at once), `ZENBU_ACCOUNT_STAND_IN_PAYWALL=1` (sync refused until subscribed), and
  `ZENBU_ACCOUNT_STAND_IN_SUBSCRIPTION`, a comma-separated list of `apple` or `stripe`, each with
  an optional `:grace_period`, `:billing_retry`, `:paused`, `:pending`, or `:ending` (already
  subscribed in that store, in that state; a retried, paused, or pending one doesn't sync, as the
  service answers).
- **Accessibility audits**, `AccountAuditUITests` ([`ios-accessibility.md`](ios-accessibility.md)),
  on iPhone and iPad, with the same stand-ins: the paywall, Zenbu Account's Subscription section
  with none, an App Store one, a website one, both, a payment retried, and a first payment pending,
  and Delete Account with an App Store subscription, before and after deleting.
- **By hand, with the StoreKit configuration file:** in Xcode, Product → Scheme → Edit Scheme → Run
  → Options → StoreKit Configuration: `ZenbuSync.storekit`, against a service on this Mac whose
  `APP_STORE_ENVIRONMENTS` includes `Xcode` (taken only at localhost) and whose
  `APP_STORE_PRODUCT_IDS` are the file's. Debug → StoreKit → Manage Transactions refunds, expires,
  or renews a purchase. Its product IDs and prices are examples: the owner's come from App Store
  Connect.
- **In the sandbox**, against staging: once the owner has made the products, a Debug build with no
  StoreKit configuration buys with a sandbox account (Settings → Developer → Sandbox Apple Account
  on a device).

## What the owner sets up for the app

Besides the service's setup ([`account-billing-stores.md`](account-billing-stores.md), Set it up):

- **App Store Connect:** the subscription group and its products, each with a review screenshot
  and notes, submitted with the first version that sells them; the Terms of Use (the standard EULA
  or the website's) linked in the app's description or License Agreement; App Review's demo account
  in the review notes; and the App Privacy answers in
  [`app-store-privacy-labels.md`](../../apps/web/docs/app-store-privacy-labels.md), which now
  include Purchase History.
- **App Review's demo account** must be one the gate applies to, so the reviewer sees **Subscribe
  to Sync…**: with the gate on, an account with no subscription, and its email in
  `APP_STORE_SANDBOX_ACCOUNTS` so the reviewer's sandbox purchase counts. The app offers nothing
  while sync is free.
- **Don't promote the subscription on the App Store:** in App Store Connect, give its products no
  App Store promotion (no promotional image, so the product page doesn't list them). The app doesn't take a purchase started on the product page (StoreKit's
  `PurchaseIntent`), since that purchase would have no Zenbu account's token and might come before
  the learner signs in.
- **The listing:** keep the current one (`apps/ios/metadata/version/1.0/`) until the version that
  turns the gate on; that version's description, What's New, and promotional text are drafted in
  `apps/ios/metadata/drafts/subscription/en-US.json`, with the Terms of Use and the Privacy
  Policy's links at the end of the description.
- **Nothing in the project:** in-app purchase needs no entitlement, and the App ID has it already.
