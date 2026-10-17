import Foundation

struct FrequencyPackClient: Sendable {
  var snapshot: @Sendable () async throws -> FrequencyPackSnapshot
  var download: @Sendable (FrequencyPackID, @escaping FrequencyPackManager.Progress) async throws -> Void
  var enable: @Sendable (FrequencyPackID) async throws -> Void
  var disable: @Sendable (FrequencyPackID) async throws -> Void
  var reorderEnabled: @Sendable ([FrequencyPackID]) async throws -> Void
  var remove: @Sendable (FrequencyPackID) async throws -> Void

  static let live = FrequencyPackClient(
    snapshot: { try await FrequencyPackStore.shared.snapshot() },
    download: { try await FrequencyPackStore.shared.download($0, progress: $1) },
    enable: { try await FrequencyPackStore.shared.enable($0) },
    disable: { try await FrequencyPackStore.shared.disable($0) },
    reorderEnabled: { try await FrequencyPackStore.shared.reorderEnabled($0) },
    remove: { try await FrequencyPackStore.shared.remove($0) }
  )
}

enum JLPTLevel: Int, CaseIterable, Sendable {
  case n1 = 1
  case n2
  case n3
  case n4
  case n5
}

enum FrequencyPackError: Error, Equatable {
  case missingBundledPack
  case invalidCatalog
  case invalidPack
  case invalidSource
  case invalidArtifact
  case checksumMismatch
  case mappingMismatch
  case packNotInstalled
  case packNotRemovable
  case sqlite(String)
}

extension FrequencyLists {
  static let live = FrequencyLists(opening: { await FrequencyPackStore.shared.opened() })
}

private actor FrequencyPackStore {
  static let shared = FrequencyPackStore()
  private let manager: FrequencyPackManager?

  init() {
    manager = Self.opened(publishingTo: .live)
    if manager == nil {
      FrequencyLists.live.publish(unavailable: "Bundled frequency data unavailable")
    }
  }

  private static func opened(publishingTo lists: FrequencyLists) -> FrequencyPackManager? {
    guard
      let languageDataURL = Bundle.languageReferenceDataURL,
      let catalog = try? FrequencyPackCatalog.bundled(),
      let bundledArtifactURLs = try? catalog.bundledArtifactURLs(),
      let support = FileManager.default.urls(
        for: .applicationSupportDirectory, in: .userDomainMask
      ).first
    else { return nil }
    return try? FrequencyPackManager(
      catalog: catalog,
      bundledArtifactURLs: bundledArtifactURLs,
      languageDataURL: languageDataURL,
      storageDirectory: support.appendingPathComponent("FrequencyPacks", isDirectory: true),
      lists: lists,
      download: { url, progress in
        let (data, response) = try await URLSession.shared.data(
          from: url, delegate: FrequencyPackDownloadProgress(report: progress))
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
          throw FrequencyPackError.invalidSource
        }
        return data
      }
    )
  }

  func opened() {}

  func snapshot() async throws -> FrequencyPackSnapshot {
    guard let manager else { throw FrequencyPackError.invalidCatalog }
    return try await manager.snapshot()
  }

  func download(
    _ packID: FrequencyPackID, progress: @escaping FrequencyPackManager.Progress
  ) async throws {
    guard let manager else { throw FrequencyPackError.invalidCatalog }
    try await manager.download(packID, progress: progress)
  }

  func enable(_ packID: FrequencyPackID) async throws {
    guard let manager else { throw FrequencyPackError.invalidCatalog }
    try await manager.enable(packID)
  }

  func disable(_ packID: FrequencyPackID) async throws {
    guard let manager else { throw FrequencyPackError.invalidCatalog }
    try await manager.disable(packID)
  }

  func reorderEnabled(_ packIDs: [FrequencyPackID]) async throws {
    guard let manager else { throw FrequencyPackError.invalidCatalog }
    try await manager.reorderEnabled(packIDs)
  }

  func remove(_ packID: FrequencyPackID) async throws {
    guard let manager else { throw FrequencyPackError.invalidCatalog }
    try await manager.remove(packID)
  }
}
