import Foundation
import Testing
@testable import SearchExperience

@Suite("Optional frequency dictionary lifecycle", .serialized)
struct FrequencyPackLifecycleTests {
  @Test("downloaded packs enable, rank in order, restore, reorder, disable, and remove")
  func installEnableRestoreReorderAndRemove() async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    let bundledIDs = catalog.packs.filter(\.bundled).map(\.packID)
    #expect(bundledIDs.map(\.rawValue) == ["zenbu.jlpt.waller.levels", "zenbu.tubelex.youtube.ja.unidic-3.1"])
    let bundled = try #require(catalog.packs.first { $0.bundled && $0.packKind == .rank })
    let jlpt = try #require(catalog.packs.first { $0.packKind == .level })
    let optional = try #require(
      catalog.packs.first { $0.packID.rawValue == "zenbu.public.novels.ja.ordered-v1" }
    )
    let source = try novelSource()
    let storage = temporaryStorage()
    defer { try? FileManager.default.removeItem(at: storage) }

    let manager = try makeManager(catalog, storage: storage, source: source)
    let initial = try await manager.snapshot()
    #expect(initial.enabledPackIDs == bundledIDs)
    try await manager.disable(jlpt.packID)
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
    await #expect(throws: FrequencyPackError.packNotRemovable) {
      try await restored.remove(jlpt.packID)
    }
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

  @Test("JLPT is enabled first on a fresh install and supplies bundled levels")
  func bundledJLPTLevels() async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    let jlpt = try #require(catalog.packs.first { $0.packKind == .level })
    let storage = temporaryStorage()
    defer { try? FileManager.default.removeItem(at: storage) }

    let manager = try makeManager(catalog, storage: storage, source: Data())
    #expect(try await manager.snapshot().enabledPackIDs.first == jlpt.packID)
    // 会う (JMdict 1198180) is on Waller's N5 list; the other ID matches no entry.
    let meetID = try #require(jmdictID(1_198_180))
    let unlisted = LanguageReferenceID(rawValue: "ffffffffffffffffffffffffffffffff")
    let ranks = try await manager.evidence(for: [unlisted, meetID])
    guard case .level(let evidence) = ranks[meetID]?.first else {
      Issue.record("JLPT did not supply a level for 会う")
      return
    }
    #expect(evidence.level == .n5)
    #expect(ranks[meetID]?.count == 2)
    #expect(ranks[unlisted]?.first == .noEvidence(pack: jlpt.disclosure))

    try await manager.disable(jlpt.packID)
    try await manager.enable(jlpt.packID)
    #expect(try await manager.snapshot().enabledPackIDs.last == jlpt.packID)
  }

  @Test("an upgrade adds JLPT once at the top, and disabling it then sticks")
  func upgradeAddsJLPTOnce() async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    let jlpt = try #require(catalog.packs.first { $0.packKind == .level })
    let tubelex = try #require(catalog.packs.first { $0.bundled && $0.packKind == .rank })
    let storage = temporaryStorage()
    defer { try? FileManager.default.removeItem(at: storage) }
    try FileManager.default.createDirectory(at: storage, withIntermediateDirectories: true)
    try Data(#"{"enabledPackIDs":["\#(tubelex.packID.rawValue)"],"installedRecords":[]}"#.utf8)
      .write(to: storage.appendingPathComponent("state.json"))

    let upgraded = try makeManager(catalog, storage: storage, source: Data())
    #expect(try await upgraded.snapshot().enabledPackIDs == [jlpt.packID, tubelex.packID])
    try await upgraded.disable(jlpt.packID)
    let relaunched = try makeManager(catalog, storage: storage, source: Data())
    #expect(try await relaunched.snapshot().enabledPackIDs == [tubelex.packID])
  }

  private func jmdictID(_ sequence: Int) -> LanguageReferenceID? {
    let digest = Data("edrdg.jmdict\0\(sequence)".utf8).sha256
    return LanguageReferenceID(rawValue: String(digest.prefix(32)))
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
      bundledArtifactURLs: try catalog.bundledArtifactURLs(),
      languageDataURL: try FrequencyPackCatalog.languageDataURL(),
      storageDirectory: storage,
      download: { _ in source }
    )
  }

  private func packID(_ result: FrequencyLookupResult?) -> FrequencyPackID? {
    switch result {
    case .evidence(let evidence): evidence.pack.id
    case .level(let evidence): evidence.pack.id
    case .noEvidence(let pack): pack.id
    case .unavailable(let unavailable): unavailable.pack?.id
    case nil: nil
    }
  }
}
