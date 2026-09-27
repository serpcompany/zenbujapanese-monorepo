import Foundation
import Testing
@testable import SearchExperience

@Suite("Optional frequency dictionary lifecycle", .serialized)
struct FrequencyPackLifecycleTests {
  @Test("downloaded packs enable, rank in order, restore, reorder, disable, and remove")
  func installEnableRestoreReorderAndRemove() async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    let bundled = try #require(catalog.packs.first { $0.bundled })
    let optional = try #require(
      catalog.packs.first { $0.packID.rawValue == "zenbu.public.novels.ja.ordered-v1" }
    )
    let source = try novelSource()
    let storage = temporaryStorage()
    defer { try? FileManager.default.removeItem(at: storage) }

    let manager = try makeManager(catalog, storage: storage, source: source)
    let initial = try await manager.snapshot()
    #expect(initial.enabledPackIDs == [bundled.packID])
    #expect(initial.packs.first { $0.id == optional.packID }?.isInstalled == false)

    try await manager.download(optional.packID)
    #expect(try await manager.snapshot().enabledPackIDs == [bundled.packID, optional.packID])
    try await manager.disable(optional.packID)
    try await manager.enable(optional.packID)
    #expect(try await manager.snapshot().enabledPackIDs == [bundled.packID, optional.packID])
    let identifier = LanguageReferenceID(rawValue: optional.smokeTest.languageReferenceID)
    let ranks = try await manager.evidence(for: identifier)
    #expect(ranks.count == 2)
    #expect(packID(ranks.first) == bundled.packID)
    guard case .evidence(let evidence) = ranks.last else {
      Issue.record("The enabled optional pack did not supply its pinned evidence row")
      return
    }
    #expect(evidence.pack.id == optional.packID)
    #expect(evidence.rank == optional.smokeTest.rank)

    try await manager.reorderEnabled([optional.packID, bundled.packID])
    let restored = try makeManager(catalog, storage: storage, source: source)
    #expect(try await restored.snapshot().enabledPackIDs == [optional.packID, bundled.packID])
    #expect(packID(try await restored.evidence(for: identifier).first) == optional.packID)
    await #expect(throws: FrequencyPackError.invalidPack) {
      try await restored.reorderEnabled([optional.packID])
    }

    try await restored.disable(bundled.packID)
    try await restored.remove(optional.packID)
    let removed = try await restored.snapshot()
    #expect(removed.enabledPackIDs.isEmpty)
    #expect(removed.packs.first { $0.id == optional.packID }?.isInstalled == false)
    #expect(try await restored.evidence(for: identifier).isEmpty)
    #expect(
      try await makeManager(catalog, storage: storage, source: source).snapshot().enabledPackIDs
        .isEmpty)
  }

  @Test("a saved single active pack migrates to the only enabled pack")
  func legacyActivePackMigrates() async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    let optional = try #require(
      catalog.packs.first { $0.packID.rawValue == "zenbu.public.novels.ja.ordered-v1" }
    )
    let source = try novelSource()
    let storage = temporaryStorage()
    defer { try? FileManager.default.removeItem(at: storage) }

    let manager = try makeManager(catalog, storage: storage, source: source)
    try await manager.download(optional.packID)
    let stateURL = storage.appendingPathComponent("state.json")
    let savedState = try JSONSerialization.jsonObject(with: Data(contentsOf: stateURL))
    var state = try #require(savedState as? [String: Any])
    state["enabledPackIDs"] = nil
    state["activePackID"] = optional.packID.rawValue
    try JSONSerialization.data(withJSONObject: state).write(to: stateURL)

    let migrated = try makeManager(catalog, storage: storage, source: source)
    #expect(try await migrated.snapshot().enabledPackIDs == [optional.packID])
  }

  private func novelSource() throws -> Data {
    let sourceURL = try #require(
      Bundle.module.url(
        forResource: "Novel 5k", withExtension: "json.zip", subdirectory: "Fixtures")
    )
    return try Data(contentsOf: sourceURL)
  }

  private func temporaryStorage() -> URL {
    FileManager.default.temporaryDirectory
      .appendingPathComponent("frequency-pack-lifecycle-\(UUID().uuidString)", isDirectory: true)
  }

  private func makeManager(
    _ catalog: FrequencyPackCatalog, storage: URL, source: Data
  ) throws -> FrequencyPackManager {
    try FrequencyPackManager(
      catalog: catalog,
      bundledArtifactURL: try FrequencyPackCatalog.bundledArtifactURL(),
      languageDataURL: try FrequencyPackCatalog.languageDataURL(),
      storageDirectory: storage,
      download: { _ in source }
    )
  }

  private func packID(_ result: FrequencyLookupResult?) -> FrequencyPackID? {
    switch result {
    case .evidence(let evidence): evidence.pack.id
    case .noEvidence(let pack): pack.id
    case .unavailable(let unavailable): unavailable.pack?.id
    case nil: nil
    }
  }
}
