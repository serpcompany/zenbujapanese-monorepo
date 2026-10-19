import StoreKit
import SwiftUI

enum AppStoreSubscriptionSettings {
  static let url = URL(string: "https://apps.apple.com/account/subscriptions")!
}

extension View {
  func appStoreSubscriptionSettings(isPresented: Binding<Bool>) -> some View {
    #if os(macOS)
      modifier(OpensSubscriptionSettings(isPresented: isPresented))
    #else
      manageSubscriptionsSheet(isPresented: isPresented)
    #endif
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
