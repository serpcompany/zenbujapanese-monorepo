import Foundation

enum ZenbuLinks {
  static let support = URL(string: "https://zenbujapanese.com/support")!
  static let privacyPolicy = URL(string: "https://zenbujapanese.com/privacy")!
  static let termsOfUse = URL(string: "https://zenbujapanese.com/legal/terms/")!
}

enum SubscriptionText {
  static func place(_ managedIn: KnownSubscription.ManagedIn?) -> String {
    switch managedIn {
    case .appStore: String(localized: "App Store")
    case .website: String(localized: "zenbujapanese.com")
    case nil: String(localized: "Subscription")
    }
  }

  static func status(_ subscription: KnownSubscription.Running) -> String {
    switch subscription.status {
    case .active: String(localized: "Active")
    case .gracePeriod: String(localized: "Active, payment failed")
    case .billingRetry: String(localized: "Payment failed")
    case .pending: String(localized: "Waiting for payment")
    case .paused: String(localized: "Paused")
    case .expired: String(localized: "Ended")
    case .revoked: String(localized: "Refunded or revoked")
    case .none: String(localized: "None")
    }
  }

  static func detail(_ subscription: KnownSubscription.Running) -> String? {
    switch subscription.status {
    case .gracePeriod, .billingRetry:
      return subscription.managedIn == .website
        ? String(localized: "Payment failed for your zenbujapanese.com subscription.")
        : String(localized: "Update your payment method in your App Store account to keep syncing.")
    case .pending:
      return String(localized: "Syncing starts once its first payment arrives.")
    case .active:
      guard let date = subscription.expiresAt?.formatted(date: .long, time: .omitted) else {
        return nil
      }
      return subscription.willRenew == false
        ? String(localized: "Ends on \(date).") : String(localized: "Renews on \(date).")
    default:
      return nil
    }
  }

  static func syncWaits(_ subscription: KnownSubscription?, on device: String) -> String {
    switch waiting(subscription) {
    case .billingRetry:
      String(
        localized:
          "Syncing waits until your subscription's payment goes through. Your changes stay on this \(device)."
      )
    case .paused:
      String(
        localized:
          "Syncing waits while your subscription is paused. Your changes stay on this \(device).")
    case .pending:
      String(
        localized:
          "Syncing starts once your subscription's first payment arrives. Your changes stay on this \(device)."
      )
    default:
      String(
        localized:
          "Syncing needs a Zenbu subscription. Your changes stay on this \(device), and sync once you subscribe."
      )
    }
  }

  static func syncWaitsShort(_ subscription: KnownSubscription?) -> String {
    switch waiting(subscription) {
    case .billingRetry: String(localized: "Syncing waits for a payment")
    case .paused: String(localized: "Syncing is paused")
    case .pending: String(localized: "Syncing waits for the first payment")
    default: String(localized: "Syncing needs a subscription")
    }
  }

  static func problem(_ problem: SubscriptionProblem) -> String {
    switch problem {
    case .anotherAccount:
      String(
        localized:
          "This Apple Account's subscription belongs to another Zenbu account. Sign in to that account to use it."
      )
    case .unreachable:
      String(localized: "Couldn't reach Zenbu. Check your connection and try again.")
    case .storeUnavailable:
      String(localized: "The App Store didn't answer. Try again later.")
    case .notAvailableHere:
      String(localized: "The subscription isn't available in this App Store yet.")
    case .pendingApproval:
      String(localized: "The purchase is waiting for approval. Syncing starts once it's approved.")
    case .nothingToRestore:
      String(localized: "This Apple Account has no Zenbu subscription to restore.")
    case .notOffered:
      String(localized: "This account already has a subscription.")
    case .appleAccountSubscribed:
      String(
        localized:
          "This Apple Account already has a Zenbu subscription. Restore Purchases to use it with this account."
      )
    case .paymentPending:
      String(
        localized:
          "This account's subscription is waiting for its first payment. Syncing starts once it arrives."
      )
    case .notNeeded:
      String(localized: "Syncing doesn't need a subscription for this account right now.")
    case .serviceFailed:
      String(localized: "Zenbu couldn't read your subscription just now. Try again in a moment.")
    case .purchaseNotApplied:
      String(
        localized:
          "Your App Store purchase hasn't reached your Zenbu account yet. Zenbu sends it again on its own; if this keeps happening, contact support."
      )
    }
  }

  private static func waiting(_ subscription: KnownSubscription?) -> KnownSubscription.Status? {
    let statuses = (subscription?.running.map(\.status) ?? []) + [subscription?.status ?? .none]
    return [.billingRetry, .paused, .pending].first { statuses.contains($0) }
  }
}
