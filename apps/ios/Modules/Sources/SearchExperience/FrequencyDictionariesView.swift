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
        enabledOrder(snapshot)
        ForEach(snapshot.packs) { pack in
          Section {
            status(for: pack)
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
    .toolbar {
      if (snapshot?.enabledPackIDs.count ?? 0) > 1 {
        EditButton()
          .accessibilityIdentifier("frequency-packs.reorder")
      }
    }
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
  private func enabledOrder(_ snapshot: FrequencyPackSnapshot) -> some View {
    Section {
      if snapshot.enabledPacks.isEmpty {
        Text("None enabled. Search uses dictionary relevance order and hides frequency ranks.")
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("frequency-packs.enabled.empty")
      } else {
        ForEach(Array(snapshot.enabledPacks.enumerated()), id: \.element.id) { index, pack in
          HStack(spacing: 12) {
            Text("\(index + 1)")
              .font(.body.monospacedDigit())
              .foregroundStyle(.secondary)
            Text(pack.manifest.displayName)
            Spacer(minLength: 0)
            if index == 0 {
              Text("Sorts Search")
                .font(.footnote)
                .foregroundStyle(.tint)
            }
          }
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(pack.manifest.displayName)
          .accessibilityValue(
            index == 0 ? "Priority 1, sorts search results" : "Priority \(index + 1)")
          .accessibilityIdentifier("frequency-packs.enabled.\(pack.id.rawValue)")
        }
        .onMove { source, destination in
          var order = snapshot.enabledPackIDs
          order.move(fromOffsets: source, toOffset: destination)
          reorder(order)
        }
      }
    } header: {
      Text("Enabled")
    } footer: {
      if snapshot.enabledPackIDs.count > 1 {
        Text(
          "Ranks appear in this order. Search sorts equally relevant results by the first dictionary. Drag to reorder."
        )
      }
    }
  }

  private func status(for pack: FrequencyPackState) -> some View {
    HStack(spacing: 12) {
      Text("Status")
      Spacer(minLength: 0)
      Label(
        pack.isEnabled ? "Enabled" : (pack.isInstalled ? "Installed" : "Available"),
        systemImage: pack.isEnabled
          ? "checkmark.circle.fill"
          : (pack.isInstalled ? "checkmark.circle" : "arrow.down.circle")
      )
      .foregroundStyle(pack.isEnabled ? AnyShapeStyle(.tint) : AnyShapeStyle(.primary))
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Status")
    .accessibilityValue(
      pack.isEnabled
        ? "Enabled"
        : (pack.isInstalled ? "Installed, not enabled" : "Available, not installed")
    )
    .accessibilityIdentifier("frequency-pack.status.\(pack.id.rawValue)")
  }

  @ViewBuilder
  private func storage(for pack: FrequencyPackState) -> some View {
    if let installedBytes = pack.installedBytes {
      LabeledContent(
        "Storage",
        value: ByteCountFormatter.string(fromByteCount: Int64(installedBytes), countStyle: .file)
      )
    }
  }

  @ViewBuilder
  private func actions(for pack: FrequencyPackState) -> some View {
    if workingPackID == pack.id {
      ProgressView("Downloading \(pack.manifest.displayName)")
        .accessibilityValue("Download and validation in progress")
        .accessibilityIdentifier("frequency-pack.progress.\(pack.id.rawValue)")
    } else if pack.availableActions.contains(.download) {
      Button(pack.failureMessage == nil ? FrequencyPackAction.download.label : "Retry") {
        perform(pack.id, confirmsVerification: true) { try await client.download(pack.id) }
      }
      .accessibilityIdentifier("frequency-pack.download.\(pack.id.rawValue)")
    } else {
      if pack.availableActions.contains(.enable) {
        Button(FrequencyPackAction.enable.label) {
          perform(pack.id) { try await client.enable(pack.id) }
        }
        .accessibilityIdentifier("frequency-pack.enable.\(pack.id.rawValue)")
      }
      if pack.availableActions.contains(.disable) {
        Button(FrequencyPackAction.disable.label) {
          perform(pack.id) { try await client.disable(pack.id) }
        }
        .accessibilityIdentifier("frequency-pack.disable.\(pack.id.rawValue)")
      }
      if pack.availableActions.contains(.update) {
        Button(FrequencyPackAction.update.label) {
          perform(pack.id, confirmsVerification: true) { try await client.download(pack.id) }
        }
        .accessibilityIdentifier("frequency-pack.update.\(pack.id.rawValue)")
      }
      if pack.availableActions.contains(.remove) {
        Button(FrequencyPackAction.remove.label, role: .destructive) {
          perform(pack.id) { try await client.remove(pack.id) }
        }
        .accessibilityIdentifier("frequency-pack.remove.\(pack.id.rawValue)")
      }
      if !pack.manifest.removable {
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

  private func reorder(_ order: [FrequencyPackID]) {
    if let snapshot {
      self.snapshot = FrequencyPackSnapshot(enabledPackIDs: order, packs: snapshot.packs)
    }
    Task { @MainActor in
      try? await client.reorderEnabled(order)
      await load()
    }
  }

  private func perform(
    _ packID: FrequencyPackID,
    confirmsVerification: Bool = false,
    operation: @escaping @MainActor () async throws -> Void
  ) {
    verifiedPackID = nil
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
