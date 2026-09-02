import SwiftUI

struct FrequencyDictionariesView: View {
  @State private var snapshot: FrequencyPackSnapshot?
  @State private var workingPackID: FrequencyPackID?
  @State private var verifiedPackID: FrequencyPackID?
  @State private var screenFailure: String?
  let client: FrequencyPackClient

  var body: some View {
    List {
      if let snapshot {
        ForEach(snapshot.packs) { pack in
          Section {
            LabeledContent("Status") {
              Label(
                pack.isActive ? "Active" : (pack.isInstalled ? "Installed" : "Available"),
                systemImage: pack.isActive
                  ? "checkmark.circle.fill"
                  : (pack.isInstalled ? "checkmark.circle" : "arrow.down.circle")
              )
              .foregroundStyle(
                pack.isActive ? AnyShapeStyle(.tint) : AnyShapeStyle(.primary)
              )
              .accessibilityElement(children: .ignore)
              .accessibilityLabel(
                pack.isActive ? "Active" : (pack.isInstalled ? "Installed" : "Available")
              )
              .accessibilityValue(
                pack.isActive
                  ? "Selected frequency dictionary"
                  : (pack.isInstalled ? "Not selected" : "Not installed")
              )
              .accessibilityIdentifier("frequency-pack.status.\(pack.id.rawValue)")
            }
            LabeledContent("Source domain", value: pack.manifest.domain)
            LabeledContent("Version", value: pack.manifest.packVersion)
            LabeledContent("License", value: pack.manifest.licenseIdentifier)
            LabeledContent("Update", value: pack.updateStatus)
            Text(pack.manifest.domainDescription)
              .font(.footnote)
              .foregroundStyle(.secondary)
            Text(pack.manifest.attribution)
              .font(.footnote)
              .foregroundStyle(.secondary)
            Link("Source and license", destination: pack.manifest.licenseURL)
            storage(for: pack)
            if let failure = pack.failureMessage {
              Label(failure, systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Download failed")
                .accessibilityValue(failure)
                .accessibilityIdentifier("frequency-pack.failure.\(pack.id.rawValue)")
            }
            if verifiedPackID == pack.id {
              Label("Verified", systemImage: "checkmark.seal.fill")
                .foregroundStyle(.green)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Verified")
                .accessibilityValue("Download and checksum verified")
                .accessibilityIdentifier("frequency-pack.verified.\(pack.id.rawValue)")
            }
            actions(for: pack)
          } header: {
            Text(pack.manifest.displayName)
          }
        }
      } else if let screenFailure {
        ContentUnavailableView {
          Label("Frequency Dictionaries Unavailable", systemImage: "exclamationmark.triangle")
            .foregroundStyle(.red)
        } description: {
          Text(screenFailure)
        }
        Button("Retry", action: refresh)
      } else {
        ProgressView("Loading frequency dictionaries")
      }
    }
    .navigationTitle("Frequency Dictionaries")
    .navigationBarTitleDisplayMode(.inline)
    .contentMargins(.bottom, 120, for: .scrollContent)
    .accessibilityIdentifier("frequency-packs.list")
    .task { await load() }
    .task(id: verifiedPackID) {
      guard let verifiedPackID else { return }
      try? await Task.sleep(for: .seconds(8))
      guard !Task.isCancelled, self.verifiedPackID == verifiedPackID else { return }
      self.verifiedPackID = nil
    }
  }

  @ViewBuilder
  private func storage(for pack: FrequencyPackState) -> some View {
    if let installedBytes = pack.installedBytes {
      LabeledContent(
        "Storage",
        value: ByteCountFormatter.string(fromByteCount: Int64(installedBytes), countStyle: .file)
      )
    } else {
      LabeledContent(
        "Download",
        value: ByteCountFormatter.string(
          fromByteCount: Int64(pack.manifest.sourceBytes), countStyle: .file)
      )
    }
  }

  @ViewBuilder
  private func actions(for pack: FrequencyPackState) -> some View {
    if workingPackID == pack.id {
      ProgressView("Downloading \(pack.manifest.displayName)")
        .accessibilityValue("Download and validation in progress")
        .accessibilityIdentifier("frequency-pack.progress.\(pack.id.rawValue)")
      #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-FrequencyPackDownloadGate") {
          Button("Continue Download Fixture") {
            Task { await FrequencyPackDebugDownloadGate.shared.release() }
          }
          .accessibilityIdentifier("frequency-pack.fixture.continue")
        }
      #endif
    } else if pack.availableActions.contains(.download) {
      Button(pack.failureMessage == nil ? "Download" : "Retry") {
        perform(pack.id, confirmsVerification: true) { try await client.download(pack.id) }
      }
      .accessibilityIdentifier("frequency-pack.download.\(pack.id.rawValue)")
    } else {
      if pack.availableActions.contains(.activate) {
        Button("Use This Dictionary") {
          perform(pack.id) { try await client.activate(pack.id) }
        }
        .accessibilityIdentifier("frequency-pack.activate.\(pack.id.rawValue)")
      }
      if pack.availableActions.contains(.update) {
        Button("Check for Update") {
          perform(pack.id, confirmsVerification: true) { try await client.download(pack.id) }
        }
        .accessibilityIdentifier("frequency-pack.update.\(pack.id.rawValue)")
      }
      if pack.availableActions.contains(.remove) {
        Button(
          pack.isActive ? "Remove Pack and Use Included Dictionary" : "Remove Pack",
          role: .destructive
        ) {
          perform(pack.id) { try await client.remove(pack.id) }
        }
        .accessibilityIdentifier("frequency-pack.remove.\(pack.id.rawValue)")
      }
      if pack.availableActions.isEmpty {
        Text("Included with Zenbu · Works offline")
          .font(.footnote)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("frequency-pack.included.\(pack.id.rawValue)")
      }
    }
  }

  private func refresh() {
    Task { await load() }
  }

  private func perform(
    _ packID: FrequencyPackID,
    confirmsVerification: Bool = false,
    operation: @escaping @MainActor () async throws -> Void
  ) {
    workingPackID = packID
    Task { @MainActor in
      defer { workingPackID = nil }
      do {
        try await operation()
        if confirmsVerification {
          verifiedPackID = packID
        }
      } catch {}
      await load()
    }
  }

  @MainActor
  private func load() async {
    do {
      snapshot = try await client.snapshot()
      screenFailure = nil
    } catch {
      snapshot = nil
      screenFailure = "Pack information could not be loaded."
    }
  }
}
