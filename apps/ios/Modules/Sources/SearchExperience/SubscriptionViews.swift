import SwiftUI

enum SubscriptionText {
  static let termsOfUse = URL(string: "https://zenbujapanese.com/legal/terms/")!
  static let privacyPolicy = URL(string: "https://zenbujapanese.com/legal/privacy/")!

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
    case .revoked: String(localized: "Refunded")
    case .none: String(localized: "None")
    }
  }

  static func detail(_ subscription: KnownSubscription.Running) -> String? {
    switch subscription.status {
    case .gracePeriod, .billingRetry:
      return subscription.managedIn == .website
        ? String(localized: "Update your payment method on zenbujapanese.com to keep syncing.")
        : String(localized: "Update your payment method in your App Store account to keep syncing.")
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
    case .pendingApproval:
      String(localized: "The purchase is waiting for approval. Syncing starts once it's approved.")
    case .notOffered:
      String(localized: "This account already has a subscription.")
    }
  }
}

struct SubscriptionSection: View {
  @Environment(ZenbuAccount.self) private var zenbuAccount
  @Binding var showsPaywall: Bool
  @Binding var managesInAppStore: Bool

  var body: some View {
    if let known = zenbuAccount.subscription.current,
      !known.shown.isEmpty || !known.offers.appStore.isEmpty
    {
      Section {
        rows(for: known)
      } header: {
        Text("Subscription")
      } footer: {
        if known.running.count > 1 {
          Text(
            "You're paying for two subscriptions. Cancel the one you don't need where you bought it."
          )
          .accessibilityIdentifier("subscription.paying-twice")
        }
      }
    }
  }

  @ViewBuilder
  private func rows(for known: KnownSubscription) -> some View {
    let subscription = zenbuAccount.subscription
    ForEach(Array(known.shown.enumerated()), id: \.offset) { _, running in
      LabeledContent(
        SubscriptionText.place(running.managedIn), value: SubscriptionText.status(running)
      )
      .accessibilityIdentifier("subscription.status")
      if let detail = SubscriptionText.detail(running) {
        Text(detail)
          .foregroundStyle(.secondary)
      }
      if known.running.contains(running) {
        manage(running)
      }
    }
    if known.offersAppStorePurchase {
      Button("Subscribe to Sync…") { showsPaywall = true }
        .accessibilityIdentifier("subscription.subscribe")
    }
    if !known.offers.appStore.isEmpty {
      Button("Restore Purchases") { Task { await subscription.restore() } }
        .disabled(subscription.isWorking)
        .accessibilityIdentifier("subscription.restore")
    }
    if let problem = subscription.problem {
      Text(SubscriptionText.problem(problem))
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("subscription.problem")
    }
  }

  @ViewBuilder
  private func manage(_ running: KnownSubscription.Running) -> some View {
    switch running.managedIn {
    case .appStore:
      Button("Manage in the App Store") { managesInAppStore = true }
        .accessibilityIdentifier("subscription.manage")
    case .website:
      Text("You subscribed on zenbujapanese.com, so it's managed there, in your account.")
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("subscription.managed-on-website")
    case nil:
      EmptyView()
    }
  }
}

struct SubscriptionPaywall: View {
  @Environment(ZenbuAccount.self) private var zenbuAccount
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    let subscription = zenbuAccount.subscription
    NavigationStack {
      Form {
        Section {
          Text("Sync with a Zenbu subscription")
            .font(.headline)
          Text(
            "Your known words, lists, watch history, bookmarked translations, and profile, on every device you sign in to. Everything else in Zenbu stays free, and works on this \(ThisDevice.name) without one."
          )
          .foregroundStyle(.secondary)
        }
        Section {
          if subscription.offers.isEmpty, subscription.problem == nil {
            ProgressView()
          }
          ForEach(subscription.offers) { offer in
            Button {
              Task { await subscription.subscribe(to: offer.id) }
            } label: {
              LabeledContent {
                Text("\(offer.price) \(offer.period)")
              } label: {
                Text(offer.name)
                Text(offer.summary)
              }
            }
            .accessibilityIdentifier("paywall.offer.\(offer.id)")
          }
          if let problem = subscription.problem {
            Text(SubscriptionText.problem(problem))
              .foregroundStyle(.secondary)
              .accessibilityIdentifier("paywall.problem")
          }
        } footer: {
          Text(
            "Payment is charged to your Apple Account. The subscription renews automatically at the same price unless you cancel it at least 24 hours before the period ends. Manage or cancel it in your App Store account settings."
          )
        }
        Section {
          Button("Restore Purchases") { Task { await subscription.restore() } }
            .accessibilityIdentifier("paywall.restore")
          Link("Terms of Use", destination: SubscriptionText.termsOfUse)
          Link("Privacy Policy", destination: SubscriptionText.privacyPolicy)
        }
      }
      .formStyle(.grouped)
      .disabled(subscription.isWorking)
      .overlay {
        if subscription.isWorking { ProgressView() }
      }
      .navigationTitle("Subscribe")
      .inlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Not Now") { dismiss() }
            .accessibilityIdentifier("paywall.close")
        }
      }
      .task { await subscription.loadOffers() }
      .onChange(of: subscription.current?.active) { _, active in
        if active == true { dismiss() }
      }
    }
    .sheetSize(onMac: AppWindow.sheetSize)
  }
}
