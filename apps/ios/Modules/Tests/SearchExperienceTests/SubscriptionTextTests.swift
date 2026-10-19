import Foundation
import StoreKit
import Testing

@testable import SearchExperience

struct SubscriptionTextTests {
  typealias Answers = SubscriptionAnswers

  private static func held(
    _ status: KnownSubscription.Status, in managedIn: KnownSubscription.ManagedIn = .appStore,
    renews: Bool? = true
  ) -> KnownSubscription.Running {
    KnownSubscription.Running(
      status: status, expiresAt: Date(timeIntervalSince1970: 1_893_456_000), willRenew: renews,
      managedIn: managedIn)
  }

  @Test func namesEveryStateAndWhereItsManaged() {
    let statuses: [(KnownSubscription.Status, String)] = [
      (.active, "Active"), (.gracePeriod, "Active, payment failed"),
      (.billingRetry, "Payment failed"), (.pending, "Waiting for payment"), (.paused, "Paused"),
      (.expired, "Ended"), (.revoked, "Refunded or revoked"),
    ]
    for (status, words) in statuses {
      #expect(SubscriptionText.status(Self.held(status)) == words)
    }
    #expect(SubscriptionText.place(.appStore) == "App Store")
    #expect(SubscriptionText.place(.website) == "zenbujapanese.com")
  }

  @Test func saysWhenItRenewsOrEndsAndWhatToDoWhenAPaymentFails() {
    let date = Date(timeIntervalSince1970: 1_893_456_000).formatted(date: .long, time: .omitted)
    #expect(SubscriptionText.detail(Self.held(.active)) == "Renews on \(date).")
    #expect(SubscriptionText.detail(Self.held(.active, renews: false)) == "Ends on \(date).")
    #expect(
      SubscriptionText.detail(Self.held(.gracePeriod))
        == "Update your payment method in your App Store account to keep syncing.")
    #expect(
      SubscriptionText.detail(Self.held(.billingRetry, in: .website))
        == "Payment failed for your zenbujapanese.com subscription.")
    #expect(SubscriptionText.detail(Self.held(.pending))?.contains("first payment") == true)
    #expect(SubscriptionText.detail(Self.held(.paused)) == nil)
    #expect(SubscriptionText.detail(Self.held(.expired)) == nil)
    #expect(SubscriptionText.detail(Self.held(.revoked)) == nil)
  }

  @Test func saysWhySyncWaitsForEachState() throws {
    let none = try Answers.decoded(Answers.answer())
    #expect(SubscriptionText.syncWaits(none, on: "iPhone").hasPrefix("Syncing needs a Zenbu subscription"))
    #expect(SubscriptionText.syncWaitsShort(none) == "Syncing needs a subscription")
    let retrying = try Answers.decoded(
      Answers.answer(
        status: "billing_retry", running: [Answers.running("website", status: "billing_retry")],
        canSubscribe: false))
    #expect(SubscriptionText.syncWaits(retrying, on: "iPhone").hasPrefix("Syncing waits until"))
    #expect(SubscriptionText.syncWaitsShort(retrying) == "Syncing waits for a payment")
    let paused = try Answers.decoded(
      Answers.answer(
        status: "paused", running: [Answers.running("app_store", status: "paused")],
        canSubscribe: false))
    #expect(SubscriptionText.syncWaitsShort(paused) == "Syncing is paused")
    let pending = try Answers.decoded(Answers.answer(status: "pending"))
    #expect(SubscriptionText.syncWaitsShort(pending) == "Syncing waits for the first payment")
  }

  @Test func saysHowOftenAPlanRenewsAndHowLongAnOfferLasts() {
    #expect(StoreKitPurchases.period(.month, 1) == "a month")
    #expect(StoreKitPurchases.period(.year, 1) == "a year")
    #expect(StoreKitPurchases.period(.month, 3) == "every 3 months")
    #expect(StoreKitPurchases.period(.week, 2) == "every 2 weeks")
    #expect(StoreKitPurchases.length(.week, 1) == "1 week")
    #expect(StoreKitPurchases.length(.day, 3) == "3 days")
  }

  @Test func linksTheSupportAndPrivacyPagesTheAppStoreListingNames() throws {
    let listing = URL(filePath: #filePath).deletingLastPathComponent()
      .appending(path: "../../../metadata")
    let appInfo = try JSONSerialization.jsonObject(
      with: Data(contentsOf: listing.appending(path: "app-info/en-US.json"))) as? [String: Any]
    let version = try JSONSerialization.jsonObject(
      with: Data(contentsOf: listing.appending(path: "version/1.0/en-US.json"))) as? [String: Any]
    #expect(appInfo?["privacyPolicyUrl"] as? String == ZenbuLinks.privacyPolicy.absoluteString)
    #expect(version?["supportUrl"] as? String == ZenbuLinks.support.absoluteString)
  }

  @Test func namesEveryProblem() {
    let problems: [SubscriptionProblem] = [
      .anotherAccount, .unreachable, .storeUnavailable, .notAvailableHere, .pendingApproval,
      .nothingToRestore, .notOffered, .appleAccountSubscribed, .paymentPending, .notNeeded,
    ]
    #expect(Set(problems.map(SubscriptionText.problem)).count == problems.count)
    #expect(SubscriptionText.problem(.nothingToRestore).contains("no Zenbu subscription"))
  }
}
