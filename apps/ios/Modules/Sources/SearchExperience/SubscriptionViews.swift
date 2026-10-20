import SwiftUI

struct SubscriptionSection: View {
  @Environment(ZenbuAccount.self) private var zenbuAccount
  @Binding var showsPaywall: Bool
  @Binding var managesInAppStore: Bool

  var body: some View {
    let subscription = zenbuAccount.subscription
    if let known = subscription.current, !known.shown.isEmpty || known.offersAppStorePurchase {
      Section {
        rows(for: known)
      } header: {
        Text("Subscription")
      } footer: {
        if known.paysTwice {
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
          .accessibilityIdentifier("subscription.detail")
      }
      if known.running.contains(running) {
        manage(running)
      }
    }
    if subscription.offering {
      Button("Subscribe to Sync…") { showsPaywall = true }
        .accessibilityIdentifier("subscription.subscribe")
    }
    if known.offersAppStorePurchase {
      Button("Restore Purchases") { Task { await subscription.restore() } }
        .disabled(subscription.isWorking)
        .accessibilityIdentifier("subscription.restore")
    }
    SubscriptionProblemText(problem: subscription.problem, identifier: "subscription.problem")
  }

  @ViewBuilder
  private func manage(_ running: KnownSubscription.Running) -> some View {
    switch running.managedIn {
    case .appStore:
      Button("Manage in the App Store") { managesInAppStore = true }
        .accessibilityIdentifier("subscription.manage")
      Text("Managed by the Apple Account that bought it.")
        .foregroundStyle(.secondary)
    case .website:
      Text("You subscribed on zenbujapanese.com, so it's managed there, in your account.")
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("subscription.managed-on-website")
    case nil:
      EmptyView()
    }
  }
}

struct SubscriptionProblemText: View {
  let problem: SubscriptionProblem?
  let identifier: String

  var body: some View {
    if let problem {
      Text(SubscriptionText.problem(problem))
        .foregroundStyle(.secondary)
        .accessibilityIdentifier(identifier)
    }
  }
}

struct SubscriptionPaywall: View {
  @Environment(ZenbuAccount.self) private var zenbuAccount
  @Environment(\.dismiss) private var dismiss
  @Environment(\.purchase) private var purchase

  var body: some View {
    let subscription = zenbuAccount.subscription
    NavigationStack {
      Form {
        Section {
          Text("Sync with a Zenbu subscription")
            .font(.headline)
          Text(
            "Your known words, lists, watch history, and bookmarked translations, on every device you sign in to. Your profile and everything else in Zenbu stay free, and work on this \(ThisDevice.name) without one."
          )
          .foregroundStyle(.secondary)
        }
        Section {
          if subscription.offers.isEmpty, subscription.problem == nil {
            ProgressView()
          }
          ForEach(subscription.offers) { offer in
            Button {
              Task { await subscription.subscribe(to: offer.id, confirmingWith: purchase) }
            } label: {
              LabeledContent {
                if let introduction = offer.introduction {
                  Text("\(introduction), then \(offer.price) \(offer.period)")
                } else {
                  Text("\(offer.price) \(offer.period)")
                }
              } label: {
                Text(offer.name)
                Text(offer.summary)
              }
            }
            .accessibilityIdentifier("paywall.offer.\(offer.id)")
          }
          SubscriptionProblemText(problem: subscription.problem, identifier: "paywall.problem")
        } footer: {
          VStack(alignment: .leading, spacing: 8) {
            Text(
              "Payment is charged to your Apple Account. The subscription renews automatically at the same price unless you cancel it at least 24 hours before the period ends. Manage or cancel it in your App Store account settings."
            )
            .accessibilityIdentifier("paywall.terms")
            if subscription.offers.contains(where: { $0.introduction != nil }) {
              Text(
                "A free trial or introductory price ends with its period, and the plan's price is charged then, unless you cancel at least 24 hours before."
              )
            }
          }
        }
        Section {
          Button("Restore Purchases") { Task { await subscription.restore() } }
            .accessibilityIdentifier("paywall.restore")
          Link("Terms of Use", destination: ZenbuLinks.termsOfUse)
          Link("Privacy Policy", destination: ZenbuLinks.privacyPolicy)
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
