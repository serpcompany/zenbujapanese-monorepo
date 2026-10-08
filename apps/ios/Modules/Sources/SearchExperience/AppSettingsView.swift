import SwiftUI

struct AppSettingsView: View {
  var body: some View {
    TabView {
      Tab("Account", systemImage: "person.crop.circle") {
        NavigationStack { AccountSettingsPane() }
      }
      Tab("Reading Aids", systemImage: "character.book.closed") {
        NavigationStack { ReadingAidSettingsView() }
      }
      Tab("Frequency Dictionaries", systemImage: "chart.bar") {
        NavigationStack { FrequencyDictionariesView(client: .live) }
      }
    }
    .frame(
      minWidth: AppWindow.settingsSize.width, idealWidth: AppWindow.settingsSize.width,
      minHeight: AppWindow.settingsSize.height, idealHeight: AppWindow.settingsSize.height)
    .accessibilityIdentifier("settings.window")
  }
}

private struct AccountSettingsPane: View {
  @Environment(ZenbuAccount.self) private var zenbuAccount: ZenbuAccount?

  var body: some View {
    Form {
      Section {
        NavigationLink(value: AccountRoute.profile) {
          ProfileCardRow()
        }
        .accessibilityIdentifier("settings.profile")
        if zenbuAccount != nil {
          ZenbuAccountRow()
        }
      }
    }
    .formStyle(.grouped)
    .navigationTitle("Account")
    .navigationDestination(for: AccountRoute.self) { route in
      switch route {
      case .profile: ProfileView()
      case .zenbuAccount: ZenbuAccountView()
      default: EmptyView()
      }
    }
  }
}
