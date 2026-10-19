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
  An answer that comes after the learner signed out or switched accounts is dropped. Sync and the
  subscription asking at once share one access token refresh (`AccountTokens`).
- **Offering.** **Subscribe to Sync…** shows only when `canSubscribe` is true and the App Store
  offers products, so no learner is offered a second subscription, and buying refuses otherwise.
  The products are the service's `offers.appStore`, in its order, read from StoreKit; the app names
  none itself. A plan's introductory offer, a free trial or a lower first price, shows with its
  terms when StoreKit says the Apple Account may have it (`isEligibleForIntroOffer`).
- **Buying.** `Product.purchase(options: [.appAccountToken(token)])`, with the account's token,
  then the verified transaction's `jwsRepresentation` goes to `POST /v1/me/subscription/apple`. The
  transaction is finished after a `200` or a `4xx` (except `401` and `429`), and left unfinished after a
  `5xx` or no network, so StoreKit hands it over again. Ask to Buy says it's waiting; a `409` says
  the Apple Account's subscription is another Zenbu account's.
- **Listening.** From launch, once the account's file has loaded, `Transaction.updates` and
  `Transaction.unfinished` are sent the same way: a renewal, an approval, an offer code, a refund. A
  signed-out app sends and finishes nothing, so they wait for the next sign-in.
- **Signing in and restoring.** Signing in sends `Transaction.currentEntitlements`, so the Apple
  Account's subscription unlocks the account or says it's another's. **Restore Purchases** calls
  `AppStore.sync()` first.
- **Managing.** Each subscription in `running` where it was bought: an App Store one with StoreKit's
  `manageSubscriptionsSheet` on iPhone and iPad, and on the Mac, which has no such sheet, the App
  Store's page `https://apps.apple.com/account/subscriptions` (`appStoreSubscriptionSettings`, the
  one place `pnpm verify layers` lets code name the sheet). A website one is a plain statement.
- **Sync.** A `402 subscription_required` keeps the queue; the Account row and Zenbu Account say
  syncing needs a subscription. A subscription that turns active syncs at once.
- **Deleting.** The sheet warns while an App Store subscription runs, and afterwards when
  `DELETE /v1/me` answers `appStoreSubscriptionContinues`; it says a website one is canceled.

## Test it

- **Package tests**, on iPhone, iPad, and the Mac (`ios.md`, Tests on every platform):
  `AccountSubscriptionTests` runs the client against `StubAccountServer` and `FakeAppStore`.
- **StoreKit tests**, `ZenbuJapaneseStoreKitTests` (`apps/ios/StoreKitTests/`), on iPhone, iPad,
  and the Mac: `StoreKitPurchasesTests` runs `StoreKitPurchases` against StoreKit itself, through
  `SKTestSession` and the StoreKit configuration file `apps/ios/App/ZenbuSync.storekit` (a monthly
  and a yearly plan with a free week, in one group): the products, their prices, and the free week
  only for an Apple Account that hasn't had the plan, a purchase whose signed transaction carries
  the account's token, the Apple Account's current purchases, a purchase made outside the app and
  not finished, Ask to Buy, and a product StoreKit doesn't sell. StoreKit
  Testing needs an app to host it, which the package's tests don't have, so this target runs inside
  the app, with its other two source files compiled in, and the scheme runs it with the UI tests
  (the same `xcodebuild … test` command, `ios.md`, Tests on every platform). `xcodebuild` doesn't
  apply a scheme's StoreKit configuration to the UI tests' app, so they don't use one.
- **UI tests**, `SubscriptionUITests`, on iPhone and iPad (skipped on the Mac, which can't keep a
  session in a build signed to run locally): buying unlocks sync and offers no second
  subscription, a website subscription, and deleting with an App Store one, with Debug-only
  stand-ins: `ZENBU_APP_STORE_STAND_IN=1` (`StandInAppStore`: the same plans, and a purchase that
  completes at once), `ZENBU_ACCOUNT_STAND_IN_PAYWALL=1` (sync refused until subscribed), and
  `ZENBU_ACCOUNT_STAND_IN_SUBSCRIPTION=apple` or `stripe` (already subscribed in that store).
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
- **Nothing in the project:** in-app purchase needs no entitlement, and the App ID has it already.
