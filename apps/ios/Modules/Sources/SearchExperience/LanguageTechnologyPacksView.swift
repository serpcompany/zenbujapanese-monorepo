import SwiftUI

struct LanguageTechnologyPacksView: View {
  @State private var snapshot: LanguageTechnologyPackSnapshot?
  @State private var workingPackID: LanguageTechnologyPackID?
  @State private var screenFailure: String?
  @State private var operationTask: Task<Void, Never>?
  let client: LanguageTechnologyPackClient

  var body: some View {
    List {
      if let snapshot {
        Section {
          Text(
            "This optional on-device pack identifies Japanese word boundaries, dictionary forms, readings, and parts of speech after text recognition. Without it, recognized text stays available but word links are reduced."
          )
          .font(.footnote)
          .foregroundStyle(.secondary)
        }
        ForEach(snapshot.packs) { pack in
          Section(pack.manifest.displayName) {
            LabeledContent("Status") {
              Label(
                pack.isActive ? "Active" : "Available",
                systemImage: pack.isActive ? "checkmark.circle.fill" : "arrow.down.circle"
              )
              .accessibilityElement(children: .ignore)
              .accessibilityLabel(pack.isActive ? "Active" : "Available")
              .accessibilityValue(
                pack.isActive ? "Ready for on-device analysis" : "Not installed"
              )
              .accessibilityIdentifier("language-technology-pack.status.\(pack.id.rawValue)")
            }
            LabeledContent(
              "Engine", value: "\(pack.manifest.engine) \(pack.manifest.engineVersion)")
            LabeledContent(
              pack.updateAvailable ? "Installed dictionary" : "Dictionary",
              value: "Core \(pack.installedVersion ?? pack.manifest.packVersion)"
            )
            if pack.updateAvailable {
              LabeledContent("Available update", value: "Core \(pack.manifest.packVersion)")
            }
            LabeledContent("Analysis", value: pack.manifest.splitPolicy)
            LabeledContent("License", value: pack.manifest.licenseIdentifier)
            LabeledContent(
              pack.isInstalled ? "Storage" : "Download",
              value: ByteCountFormatter.string(
                fromByteCount: Int64(pack.installedBytes ?? pack.manifest.downloadBytes),
                countStyle: .file)
            )
            if !pack.isInstalled {
              LabeledContent(
                "Installed size",
                value: ByteCountFormatter.string(
                  fromByteCount: Int64(pack.manifest.installedBytes), countStyle: .file)
              )
            }
            Text(pack.manifest.attribution)
              .font(.footnote)
              .foregroundStyle(.secondary)
            Link(
              "Source and license",
              destination: URL(
                string: "https://github.com/WorksApplications/SudachiDict/releases/tag/v20260723")!
            )
            if let failure = pack.failureMessage {
              Label(failure, systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red)
                .accessibilityIdentifier("language-technology-pack.failure.\(pack.id.rawValue)")
            }
            actions(for: pack)
          }
        }
      } else if let screenFailure {
        ContentUnavailableView {
          Label("Japanese Text Analysis Unavailable", systemImage: "exclamationmark.triangle")
        } description: {
          Text(screenFailure)
        }
        Button("Retry", action: refresh)
      } else {
        ProgressView("Loading Japanese Text Analysis")
      }
    }
    .navigationTitle("Japanese Text Analysis")
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityIdentifier("language-technology-packs.list")
    .task { await load() }
    .onDisappear {
      operationTask?.cancel()
      operationTask = nil
    }
  }

  @ViewBuilder
  private func actions(for pack: LanguageTechnologyPackState) -> some View {
    if workingPackID == pack.id {
      ProgressView("Downloading and verifying")
        .accessibilityValue("Download and validation in progress")
        .accessibilityIdentifier("language-technology-pack.progress.\(pack.id.rawValue)")
    } else if !pack.isInstalled {
      Button(pack.failureMessage == nil ? "Download" : "Retry") {
        perform(pack.id) { try await client.download(pack.id) }
      }
      .accessibilityIdentifier("language-technology-pack.download.\(pack.id.rawValue)")
    } else {
      if pack.updateAvailable {
        Button("Download Update") {
          perform(pack.id) { try await client.download(pack.id) }
        }
        .accessibilityIdentifier("language-technology-pack.update.\(pack.id.rawValue)")
      }
      Button("Remove Pack", role: .destructive) {
        perform(pack.id) { try await client.remove(pack.id) }
      }
      .accessibilityIdentifier("language-technology-pack.remove.\(pack.id.rawValue)")
    }
  }

  private func refresh() {
    Task { await load() }
  }

  private func load() async {
    do {
      snapshot = try await client.snapshot()
      screenFailure = nil
    } catch {
      snapshot = nil
      screenFailure = "The pack catalog could not be verified."
    }
  }

  private func perform(
    _ id: LanguageTechnologyPackID,
    operation: @escaping @Sendable () async throws -> Void
  ) {
    workingPackID = id
    operationTask?.cancel()
    operationTask = Task { @MainActor in
      do {
        try await operation()
      } catch is CancellationError {
        workingPackID = nil
        operationTask = nil
        return
      } catch {}
      workingPackID = nil
      await load()
      operationTask = nil
    }
  }
}
