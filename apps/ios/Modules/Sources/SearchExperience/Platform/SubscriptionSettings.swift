import StoreKit
import SwiftUI

enum AppStoreSubscriptionSettings {
  static let url = URL(string: "https://apps.apple.com/account/subscriptions")!
}

extension View {
  @ViewBuilder
  func appStoreSubscriptionSettings(isPresented: Binding<Bool>) -> some View {
    if LaunchHarness.standsInForTheAppStore {
      sheet(isPresented: isPresented) { StandInSubscriptionSettings() }
    } else {
      #if os(macOS)
        modifier(OpensSubscriptionSettings(isPresented: isPresented))
      #else
        manageSubscriptionsSheet(isPresented: isPresented)
      #endif
    }
  }
}

private struct StandInSubscriptionSettings: View {
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      Text("The App Store's subscriptions")
        .accessibilityIdentifier("app-store-subscriptions.stand-in")
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Done") { dismiss() }
          }
        }
    }
  }
}

#if os(macOS)
  private struct OpensSubscriptionSettings: ViewModifier {
    @Binding var isPresented: Bool
    @Environment(\.openURL) private var openURL

    func body(content: Content) -> some View {
      content.onChange(of: isPresented) { _, presented in
        guard presented else { return }
        openURL(AppStoreSubscriptionSettings.url)
        isPresented = false
      }
    }
  }
#endif
