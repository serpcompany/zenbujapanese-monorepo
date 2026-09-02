import SwiftUI

struct FrequencyDictionariesView: View {
  @State private var snapshot: FrequencyPackSnapshot?
  @State private var workingPackID: FrequencyPackID?
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
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("frequency-pack.failure.\(pack.id.rawValue)")
            }
            actions(for: pack)
          } header: {
            Text(pack.manifest.displayName)
          }
        }
      } else if let screenFailure {
        ContentUnavailableView(
          "Frequency Dictionaries Unavailable",
          systemImage: "exclamationmark.triangle",
          description: Text(screenFailure)
        )
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
      ProgressView("Validating \(pack.manifest.displayName)")
        .accessibilityIdentifier("frequency-pack.progress.\(pack.id.rawValue)")
    } else if pack.availableActions.contains(.download) {
      Button(pack.failureMessage == nil ? "Download" : "Retry") {
        perform(pack.id) { try await client.download(pack.id) }
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
          perform(pack.id) { try await client.download(pack.id) }
        }
        .accessibilityIdentifier("frequency-pack.update.\(pack.id.rawValue)")
      }
      if pack.availableActions.contains(.remove) {
        Button(
          pack.isActive ? "Remove and Use Included Dictionary" : "Remove Download",
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
    operation: @escaping @MainActor () async throws -> Void
  ) {
    workingPackID = packID
    Task { @MainActor in
      defer { workingPackID = nil }
      do {
        try await operation()
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
