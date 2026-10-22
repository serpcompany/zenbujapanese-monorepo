import SafariServices
import SearchExperience
import SwiftUI

@main
struct HostApp: App {
  var body: some Scene {
    WindowGroup { HostView() }
  }
}

struct HostView: View {
  @State private var opened: [String] = []
  @State private var extensionState = "unknown"
  @State private var applied = ""
  @Environment(\.scenePhase) private var phase
  private let extensionID = (Bundle.main.bundleIdentifier ?? "") + ".safari"

  var body: some View {
    NavigationStack {
      List {
        Section("Safari extension") {
          Text("State: \(extensionState)").accessibilityIdentifier("extensionState")
          Button("Turn On in Safari Settings") { openSettings() }
          Button("Check Again") { Task { await checkState() } }
        }
        Section("Opened with") {
          ForEach(opened, id: \.self) { Text($0).font(.footnote.monospaced()) }
        }
        Section("Shared Changes") {
          Text(applied).font(.footnote.monospaced()).accessibilityIdentifier("applied")
          Button("Apply Shared Changes") { Task { await apply() } }
        }
      }
      .navigationTitle("Spike 947")
    }
    .onOpenURL { opened.insert($0.absoluteString, at: 0) }
    .task { await checkState() }
    .onChange(of: phase) { _, now in
      if now == .active { Task { await checkState(); await apply() } }
    }
  }

  private func apply() async {
    let result = await SafariExtensionSpike.applyPendingChanges()
    applied = result.map { "\($0.key): \($0.value)" }.sorted().joined(separator: "\n")
  }

  private func checkState() async {
    guard #available(iOS 26.2, *) else {
      extensionState = "needs iOS 26.2"
      return
    }
    extensionState = await withCheckedContinuation { done in
      SFSafariExtensionManager.getStateOfExtension(withIdentifier: extensionID) { state, error in
        done.resume(
          returning: state.map { $0.isEnabled ? "on" : "off" } ?? "error \(String(describing: error))")
      }
    }
  }

  private func openSettings() {
    guard #available(iOS 26.2, *) else { return }
    SFSafariSettings.openExtensionsSettings(forIdentifiers: [extensionID]) { error in
      if let error { extensionState = "open settings failed: \(error)" }
    }
  }
}
