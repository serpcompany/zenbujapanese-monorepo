import SwiftUI

enum AppSettingsPane: CaseIterable, Identifiable {
  case account
  case readingAids
  case frequencyDictionaries

  var id: Self { self }

  var title: LocalizedStringKey {
    switch self {
    case .account: "Account"
    case .readingAids: "Reading Aids"
    case .frequencyDictionaries: "Frequency Dictionaries"
    }
  }

  var systemImage: String {
    switch self {
    case .account: "person.crop.circle"
    case .readingAids: "character.book.closed"
    case .frequencyDictionaries: "chart.bar"
    }
  }
}

struct AppSettingsView: View {
  var body: some View {
    TabView {
      ForEach(AppSettingsPane.allCases) { pane in
        Tab(pane.title, systemImage: pane.systemImage) {
          NavigationStack { content(of: pane) }
        }
      }
    }
    .frame(
      minWidth: AppWindow.settingsSize.width, idealWidth: AppWindow.settingsSize.width,
      minHeight: AppWindow.settingsSize.height, idealHeight: AppWindow.settingsSize.height)
    .accessibilityIdentifier("settings.window")
  }

  @ViewBuilder
  private func content(of pane: AppSettingsPane) -> some View {
    switch pane {
    case .account: AccountSettingsPane()
    case .readingAids: ReadingAidSettingsView()
    case .frequencyDictionaries: FrequencyDictionariesView(client: .live)
    }
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
