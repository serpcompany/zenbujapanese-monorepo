import XCTest

final class SubscriptionUITests: ZenbuUITestCase {
  static let monthly = "paywall.offer.com.zenbujapanese.sync.monthly"

  override func setUpWithError() throws {
    try XCTSkipIf(
      device == .mac,
      "a Mac build signed to run locally has no keychain access group, so it can't keep a session")
  }

  func testBuyingInTheAppUnlocksSyncAndOffersNoSecondSubscription() {
    let app = launch(Self.standIns(["ZENBU_ACCOUNT_STAND_IN_PAYWALL": "1"]))
    signInWithApple(in: app)
    let row = find("account.zenbu-account", in: app)
    waitUntil(row, mentions: "Syncing needs a subscription")
    tap(row)
    tap(find("subscription.subscribe", in: app))

    let offer = waitFor(find(Self.monthly, in: app))
    waitUntil(offer, mentions: "$4.99 a month")
    waitUntil(
      find("paywall.syncs", in: app),
      mentions: "known words, lists, notes, photos, profile photo, settings, recent searches,")
    waitFor(labeled("Terms of Use", in: app))
    waitFor(labeled("Privacy Policy", in: app))
    waitFor(find("paywall.restore", in: app))
    tap(offer)

    waitFor(find("subscription.manage", in: app))
    waitUntil(find("subscription.status", in: app), mentions: "Active")
    waitUntilGone(find("subscription.subscribe", in: app))
    goBack(in: app)
    waitUntil(row, "NOT (label CONTAINS 'Syncing needs a subscription')")
  }

  func testAWebsiteSubscriptionIsManagedOnTheWebsiteAndNoneIsOffered() {
    let app = launch(Self.standIns(["ZENBU_ACCOUNT_STAND_IN_SUBSCRIPTION": "stripe"]))
    signInWithApple(in: app)
    tap(find("account.zenbu-account", in: app))
    waitFor(find("subscription.managed-on-website", in: app))
    waitUntil(find("subscription.status", in: app), mentions: "zenbujapanese.com")
    XCTAssertFalse(find("subscription.subscribe", in: app).exists)
    XCTAssertFalse(find("subscription.manage", in: app).exists)
  }

  func testDeletingWithAnAppStoreSubscriptionSaysAppleKeepsBillingForIt() {
    let app = launch(Self.standIns(["ZENBU_ACCOUNT_STAND_IN_SUBSCRIPTION": "apple"]))
    signInWithApple(in: app)
    tap(find("account.zenbu-account", in: app))
    waitFor(find("subscription.manage", in: app))
    waitUntil(find("subscription.detail", in: app), mentions: "Renews on")
    tap(find("zenbu-account.delete", in: app))
    waitUntil(
      find("delete-account.app-store-subscription", in: app),
      mentions: "doesn't cancel your App Store subscription")
    waitFor(find("delete-account.manage-subscription", in: app))
    deleteSigningInWithApple(in: app)
    waitUntil(
      find("delete-account.app-store-subscription", in: app),
      mentions: "Apple keeps billing for it until you cancel it")
  }

  func testAWebsitePaymentThatFailedSaysSoWithoutSendingTheLearnerAnywhere() {
    let app = launch(
      Self.standIns(["ZENBU_ACCOUNT_STAND_IN_SUBSCRIPTION": "stripe:grace_period"]))
    signInWithApple(in: app)
    tap(find("account.zenbu-account", in: app))
    waitUntil(find("subscription.status", in: app), mentions: "Active, payment failed")
    waitUntil(
      find("subscription.detail", in: app),
      mentions: "Payment failed for your zenbujapanese.com subscription.")
    XCTAssertFalse(find("subscription.subscribe", in: app).exists)
  }

  func testSyncWaitsWhileAnAppStorePaymentIsRetried() {
    let app = launch(
      Self.standIns([
        "ZENBU_ACCOUNT_STAND_IN_PAYWALL": "1",
        "ZENBU_ACCOUNT_STAND_IN_SUBSCRIPTION": "apple:billing_retry",
      ]))
    signInWithApple(in: app)
    let row = find("account.zenbu-account", in: app)
    waitUntil(row, mentions: "Syncing waits for a payment")
    tap(row)
    waitUntil(find("subscription.status", in: app), mentions: "Payment failed")
    waitUntil(find("subscription.detail", in: app), mentions: "in your App Store account")
    XCTAssertFalse(find("subscription.subscribe", in: app).exists)
  }

  func testPayingInBothStoresShowsBothAndSaysSo() {
    let app = launch(Self.standIns(["ZENBU_ACCOUNT_STAND_IN_SUBSCRIPTION": "apple,stripe"]))
    signInWithApple(in: app)
    tap(find("account.zenbu-account", in: app))
    waitFor(find("subscription.manage", in: app))
    waitFor(find("subscription.managed-on-website", in: app))
    waitFor(find("subscription.paying-twice", in: app))
    XCTAssertEqual(
      app.descendants(matching: .any).matching(identifier: "subscription.status").count, 2)
  }

  func testManagingOpensTheAppStoresSubscriptionsAndAnEndingOneSaysWhen() {
    let app = launch(Self.standIns(["ZENBU_ACCOUNT_STAND_IN_SUBSCRIPTION": "apple:ending"]))
    signInWithApple(in: app)
    tap(find("account.zenbu-account", in: app))
    waitUntil(find("subscription.detail", in: app), mentions: "Ends on")
    waitFor(labeled("Managed by the Apple Account that bought it.", in: app))
    tap(find("subscription.manage", in: app))
    waitFor(find("app-store-subscriptions.stand-in", in: app))
  }

  static func standIns(_ more: [String: String]) -> [String: String] {
    AccountSignedInUITests.standIns.merging(more.merging(["ZENBU_APP_STORE_STAND_IN": "1"]) { $1 })
    { $1 }
  }
}
