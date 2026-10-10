import SwiftUI

struct FrequencyDictionariesView: View {
  @State private var snapshot: FrequencyPackSnapshot?
  @State private var removingPackIDs: Set<FrequencyPackID> = []
  @State private var detailPack: FrequencyPackState?
  @State private var screenFailure: String?
  let client: FrequencyPackClient
  var downloads = FrequencyPackDownloads.shared

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
    .inlineNavigationTitle()
    .toolbar {
      if (snapshot?.enabledPackIDs.count ?? 0) > 1 {
        ListEditButton()
          .accessibilityIdentifier("frequency-packs.reorder")
      }
    }
    .contentMargins(.bottom, 120, for: .scrollContent)
    .accessibilityIdentifier("frequency-packs.list")
    .sheet(item: $detailPack) { pack in
      FrequencyPackDetailView(pack: pack)
    }
    .task { await load() }
    .onChange(of: Set(downloads.fractions.keys)) { downloading, stillDownloading in
      if !downloading.isSubset(of: stillDownloading) { refresh() }
    }
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
    .rowActions {
      if pack.availableActions.contains(.update), downloads.fraction(for: pack.id) == nil {
        Button("Update", systemImage: "arrow.down.circle") {
          download(pack.id)
        }
        .tint(.accentColor)
        .accessibilityIdentifier("frequency-pack.update.\(pack.id.rawValue)")
      }
    } trailing: {
      if pack.availableActions.contains(.remove), downloads.fraction(for: pack.id) == nil {
        Button("Remove", systemImage: "trash", role: .destructive) {
          remove(pack.id)
        }
        .accessibilityIdentifier("frequency-pack.remove.\(pack.id.rawValue)")
      }
      Button("Details", systemImage: "info.circle") {
        detailPack = pack
      }
      .accessibilityIdentifier("frequency-pack.details.\(pack.id.rawValue)")
    }
  }

  @ViewBuilder
  private func subtitle(for pack: FrequencyPackState) -> some View {
    if let failure = pack.failureMessage {
      Text(failure)
        .foregroundStyle(.red)
        .accessibilityIdentifier("frequency-pack.failure.\(pack.id.rawValue)")
    } else if pack.updateAvailable {
      Text("Update available · \(ThisDevice.updateGesture) to download")
        .foregroundStyle(.tint)
    } else {
      Text(pack.detailSummary)
        .foregroundStyle(.secondary)
    }
  }

  @ViewBuilder
  private func trailingControl(for pack: FrequencyPackState) -> some View {
    if let fraction = downloads.fraction(for: pack.id) {
      downloadProgress(fraction, for: pack)
    } else if removingPackIDs.contains(pack.id) {
      ProgressView()
        .accessibilityLabel("Removing \(pack.manifest.displayName)")
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
        download(pack.id)
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

  @ViewBuilder
  private func downloadProgress(_ fraction: Double, for pack: FrequencyPackState) -> some View {
    if fraction < 1 {
      Button {
        downloads.stop(pack.id)
      } label: {
        Gauge(value: fraction) {
          EmptyView()
        } currentValueLabel: {
          Image(systemName: "stop.fill")
            .font(.callout)
            .foregroundStyle(.tint)
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .tint(.accentColor)
        .scaleEffect(0.5)
        .frame(width: 28, height: 28)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel("Stop Downloading \(pack.manifest.displayName)")
      .accessibilityValue(fraction.formatted(.percent.precision(.fractionLength(0))))
      .accessibilityIdentifier("frequency-pack.progress.\(pack.id.rawValue)")
    } else {
      ProgressView()
        .accessibilityLabel("Installing \(pack.manifest.displayName)")
        .accessibilityIdentifier("frequency-pack.installing.\(pack.id.rawValue)")
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

  private func download(_ packID: FrequencyPackID) {
    let client = client
    downloads.start(packID) { progress in
      try await client.download(packID, progress)
    }
  }

  private func remove(_ packID: FrequencyPackID) {
    removingPackIDs.insert(packID)
    Task { @MainActor in
      defer { removingPackIDs.remove(packID) }
      try? await client.remove(packID)
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
      .inlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done", action: dismiss.callAsFunction)
        }
      }
    }
    .sheetSize(onMac: AppWindow.sheetSize)
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
