import SwiftUI

struct CrashReportsSection: View {
  static let note: LocalizedStringKey =
    "When Zenbu crashes, freezes, or hits an error, such as a failed sync or download, it sends a report to its developers through Sentry: the app and system versions, the device's model and state (such as memory in use), a random ID for this install, and where in the app's code it happened. Reports never include your searches, words, sentences, notes, photos, conversations, or account details."

  var body: some View {
    Section {
      CrashReportsToggle()
    } footer: {
      Text(Self.note)
    }
  }
}

struct CrashReportsToggle: View {
  @AppStorage(CrashReportingPolicy.preferenceKey) private var sendsCrashReports = true

  var body: some View {
    Toggle(isOn: $sendsCrashReports) {
      SettingsRowLabel("Send Crash Reports", systemImage: "ladybug.fill", tint: .pink)
    }
    .accessibilityIdentifier("account.send-crash-reports")
    .onChange(of: sendsCrashReports) { _, sends in
      CrashReporter.setEnabled(sends)
    }
  }
}
