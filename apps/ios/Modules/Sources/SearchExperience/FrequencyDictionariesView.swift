import SwiftUI

struct FrequencyDictionariesView: View {
  @State private var snapshot: FrequencyPackSnapshot?
  @State private var workingPackID: FrequencyPackID?
  @State private var detailPack: FrequencyPackState?
  @State private var screenFailure: String?
  let client: FrequencyPackClient

  var body: some View {
    List {
      if let snapshot {
        enabledSection(snapshot)
        let installed = snapshot.packs.filter { $0.isInstalled && !$0.isEnabled }
        if !installed.isEmpty {
          Section("Installed") {
            ForEach(installed) { row(for: $0) }
          }
        }
        let available = snapshot.packs.filter { !$0.isInstalled }
        if !available.isEmpty {
          Section("Available") {
            ForEach(available) { row(for: $0) }
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
    .sheet(item: $detailPack) { pack in
      FrequencyPackDetailView(pack: pack)
    }
    .task { await load() }
  }

  private func enabledSection(_ snapshot: FrequencyPackSnapshot) -> some View {
    Section {
      ForEach(snapshot.enabledPacks) { row(for: $0) }
        .onMove { source, destination in
          var order = snapshot.enabledPackIDs
          order.move(fromOffsets: source, toOffset: destination)
          reorder(order)
        }
    } header: {
      Text("Enabled")
    } footer: {
      Group {
        if snapshot.enabledPackIDs.isEmpty {
          Text("None enabled. Search uses dictionary relevance order and hides frequency ranks.")
        } else if snapshot.enabledPackIDs.count > 1 {
          Text("Ranks appear in this order. Search sorts by the first dictionary, then the next.")
        }
      }
      .accessibilityIdentifier("frequency-packs.enabled.footer")
    }
  }

  private func row(for pack: FrequencyPackState) -> some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(pack.manifest.displayName)
        subtitle(for: pack)
          .font(.footnote)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      trailingControl(for: pack)
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("frequency-pack.row.\(pack.id.rawValue)")
    .swipeActions(edge: .trailing) {
      if pack.availableActions.contains(.remove) {
        Button("Remove", systemImage: "trash", role: .destructive) {
          perform(pack.id) { try await client.remove(pack.id) }
        }
        .accessibilityIdentifier("frequency-pack.remove.\(pack.id.rawValue)")
      }
      Button("Details", systemImage: "info.circle") {
        detailPack = pack
      }
      .accessibilityIdentifier("frequency-pack.details.\(pack.id.rawValue)")
    }
    .swipeActions(edge: .leading) {
      if pack.availableActions.contains(.update) {
        Button("Update", systemImage: "arrow.down.circle") {
          perform(pack.id) { try await client.download(pack.id) }
        }
        .tint(.accentColor)
        .accessibilityIdentifier("frequency-pack.update.\(pack.id.rawValue)")
      }
    }
  }

  @ViewBuilder
  private func subtitle(for pack: FrequencyPackState) -> some View {
    if let failure = pack.failureMessage {
      Text(failure)
        .foregroundStyle(.red)
        .accessibilityIdentifier("frequency-pack.failure.\(pack.id.rawValue)")
    } else if pack.updateAvailable {
      Text("Update available · swipe right to download")
        .foregroundStyle(.tint)
    } else {
      Text(pack.detailSummary)
        .foregroundStyle(.secondary)
    }
  }

  @ViewBuilder
  private func trailingControl(for pack: FrequencyPackState) -> some View {
    if workingPackID == pack.id {
      ProgressView()
        .accessibilityLabel("Downloading \(pack.manifest.displayName)")
        .accessibilityIdentifier("frequency-pack.progress.\(pack.id.rawValue)")
    } else if pack.isInstalled {
      Toggle(
        pack.manifest.displayName,
        isOn: Binding(
          get: { pack.isEnabled },
          set: { setEnabled(pack.id, $0) }
        )
      )
      .labelsHidden()
      .accessibilityIdentifier("frequency-pack.toggle.\(pack.id.rawValue)")
    } else {
      Button {
        perform(pack.id) { try await client.download(pack.id) }
      } label: {
        Image(
          systemName: pack.failureMessage == nil ? "arrow.down.circle" : "arrow.clockwise.circle"
        )
        .font(.title2)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel(
        pack.failureMessage == nil
          ? "Download \(pack.manifest.displayName)" : "Retry \(pack.manifest.displayName)"
      )
      .accessibilityIdentifier("frequency-pack.download.\(pack.id.rawValue)")
    }
  }

  private func refresh() {
    Task { await load() }
  }

  private func setEnabled(_ packID: FrequencyPackID, _ isEnabled: Bool) {
    if let snapshot {
      var order = snapshot.enabledPackIDs.filter { $0 != packID }
      if isEnabled { order.append(packID) }
      withAnimation { self.snapshot = snapshot.withEnabledPackIDs(order) }
    }
    Task { @MainActor in
      if isEnabled {
        try? await client.enable(packID)
      } else {
        try? await client.disable(packID)
      }
      await load()
    }
  }

  private func reorder(_ order: [FrequencyPackID]) {
    snapshot = snapshot?.withEnabledPackIDs(order)
    Task { @MainActor in
      try? await client.reorderEnabled(order)
      await load()
    }
  }

  private func perform(
    _ packID: FrequencyPackID,
    operation: @escaping @MainActor () async throws -> Void
  ) {
    workingPackID = packID
    Task { @MainActor in
      defer { workingPackID = nil }
      try? await operation()
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

private struct FrequencyPackDetailView: View {
  @Environment(\.dismiss) private var dismiss
  let pack: FrequencyPackState

  var body: some View {
    NavigationStack {
      List {
        Section {
          Text(pack.manifest.domainDescription)
        }
        Section {
          LabeledContent("Domain", value: pack.manifest.domain)
          LabeledContent("Version", value: pack.manifest.packVersion)
          LabeledContent("Status", value: pack.manifest.bundled ? "Included" : pack.updateStatus)
          if let storage = pack.storageText {
            LabeledContent("Storage", value: storage)
          }
        }
        Section("Source") {
          Text(pack.manifest.attribution)
            .font(.footnote)
        }
      }
      .navigationTitle(pack.manifest.displayName)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done", action: dismiss.callAsFunction)
        }
      }
    }
    .accessibilityIdentifier("frequency-pack.detail")
  }
}

extension FrequencyPackState {
  fileprivate var storageText: String? {
    installedBytes.map {
      ByteCountFormatter.string(fromByteCount: Int64($0), countStyle: .file)
    }
  }

  fileprivate var detailSummary: String {
    let detail = manifest.bundled ? "Included" : storageText
    return [manifest.domain, detail].compactMap { $0 }.joined(separator: " · ")
  }
}

extension FrequencyPackSnapshot {
  fileprivate func withEnabledPackIDs(_ ids: [FrequencyPackID]) -> FrequencyPackSnapshot {
    FrequencyPackSnapshot(
      enabledPackIDs: ids,
      packs: packs.map { pack in
        FrequencyPackState(
          manifest: pack.manifest,
          isInstalled: pack.isInstalled,
          isEnabled: ids.contains(pack.id),
          installedBytes: pack.installedBytes,
          failureMessage: pack.failureMessage,
          updateStatus: pack.updateStatus,
          updateAvailable: pack.updateAvailable
        )
      }
    )
  }
}
