import Foundation
import Testing
@testable import SearchExperience

@Suite("Optional frequency dictionary lifecycle", .serialized)
final class FrequencyPackLifecycleTests {
  private let storage = FileManager.default.temporaryDirectory
    .appendingPathComponent("frequency-pack-lifecycle-\(UUID().uuidString)", isDirectory: true)

  deinit {
    try? FileManager.default.removeItem(at: storage)
  }

  @Test("downloaded packs enable, rank in order, restore, reorder, disable, and remove, and the lists the core reads follow each step")
  func installEnableRestoreReorderAndRemove() async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    let bundledIDs = catalog.packs.filter(\.bundled).map(\.packID)
    #expect(bundledIDs.map(\.rawValue) == ["zenbu.jlpt.waller.levels", "zenbu.tubelex.youtube.ja.unidic-3.1"])
    let bundled = try #require(catalog.packs.first { $0.bundled && $0.packKind == .rank })
    let jlpt = try #require(catalog.packs.first { $0.packKind == .level })
    let optional = try animePack(in: catalog)
    let source = try animeSource()

    let manager = try makeManager(catalog, storage: storage, source: source)
    let initial = try await manager.snapshot()
    #expect(initial.enabledPackIDs == bundledIDs)
    #expect(try listed(manager) == bundledIDs)
    #expect(manager.lists.version == 1)
    try await manager.disable(jlpt.packID)
    #expect(try listed(manager) == [bundled.packID])
    #expect(initial.packs.first { $0.id == optional.packID }?.isInstalled == false)

    try await manager.download(optional.packID)
    #expect(try await manager.snapshot().enabledPackIDs == [bundled.packID, optional.packID])
    #expect(try listed(manager) == [bundled.packID, optional.packID])
    try await manager.disable(optional.packID)
    #expect(try listed(manager) == [bundled.packID])
    try await manager.enable(optional.packID)
    #expect(try await manager.snapshot().enabledPackIDs == [bundled.packID, optional.packID])
    #expect(try listed(manager) == [bundled.packID, optional.packID])
    #expect(try manager.lists.told()?.lists?.map(\.unavailable) == [nil, nil])
    let identifier = LanguageReferenceID(rawValue: optional.smokeTest.languageReferenceID)
    #expect(
      try manager.lists.value(of: identifier, in: optional.disclosure) == optional.smokeTest.rank)
    let pinned = LanguageReferenceID(rawValue: bundled.smokeTest.languageReferenceID)
    #expect(try manager.lists.value(of: pinned, in: bundled.disclosure) == bundled.smokeTest.rank)

    let beforeTheUpdate = manager.lists.version
    try await manager.download(optional.packID)
    #expect(manager.lists.version == beforeTheUpdate + 1)
    #expect(try listed(manager) == [bundled.packID, optional.packID])
    #expect(
      try manager.lists.value(of: identifier, in: optional.disclosure) == optional.smokeTest.rank)

    try await manager.reorderEnabled([optional.packID, bundled.packID])
    #expect(try listed(manager) == [optional.packID, bundled.packID])
    quit(manager)
    let restored = try makeManager(catalog, storage: storage, source: source)
    #expect(try await restored.snapshot().enabledPackIDs == [optional.packID, bundled.packID])
    #expect(try listed(restored) == [optional.packID, bundled.packID])
    #expect(
      try restored.lists.value(of: identifier, in: optional.disclosure) == optional.smokeTest.rank)
    await #expect(throws: FrequencyPackError.invalidPack) {
      try await restored.reorderEnabled([optional.packID])
    }
    #expect(try listed(restored) == [optional.packID, bundled.packID])

    try await restored.disable(bundled.packID)
    await #expect(throws: FrequencyPackError.packNotRemovable) {
      try await restored.remove(jlpt.packID)
    }
    try await restored.remove(optional.packID)
    let removed = try await restored.snapshot()
    #expect(removed.enabledPackIDs.isEmpty)
    #expect(removed.packs.first { $0.id == optional.packID }?.isInstalled == false)
    #expect(try listed(restored) == [])
    #expect(
      try restored.lists.read("SELECT 1 AS value", [], from: optional.packID).error
        == "The list is not open")
    let relaunched = try makeManager(catalog, storage: storage, source: source)
    #expect(try await relaunched.snapshot().enabledPackIDs.isEmpty)
    #expect(try listed(relaunched) == [])
  }

  @Test("an installed pack whose file has gone is named as unavailable, and left out at the next launch")
  func missingInstall() async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    let bundledIDs = catalog.packs.filter(\.bundled).map(\.packID)
    let optional = try animePack(in: catalog)
    let manager = try makeManager(catalog, storage: storage, source: try animeSource())
    try await manager.download(optional.packID)
    #expect(try listed(manager) == bundledIDs + [optional.packID])

    try FileManager.default.removeItem(at: installedFile(of: optional))
    try await manager.disable(bundledIDs[0])
    #expect(try listed(manager) == [bundledIDs[1], optional.packID])
    #expect(try manager.lists.told()?.lists?.map(\.unavailable) == [nil, "Pack unavailable"])

    let relaunched = try makeManager(catalog, storage: storage, source: try animeSource())
    #expect(try listed(relaunched) == [bundledIDs[1]])
  }

  @Test("an installed pack whose file no longer reads is called unavailable on a word's page, beside the lists that read")
  func unreadableInstall() async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    let jlpt = try #require(catalog.packs.first { $0.packKind == .level })
    let optional = try animePack(in: catalog)
    let manager = try makeManager(catalog, storage: storage, source: try animeSource())
    try await manager.download(optional.packID)
    try Data("not a database".utf8).write(to: installedFile(of: optional))
    try await manager.disable(jlpt.packID)
    #expect(try manager.lists.told()?.lists?.map(\.unavailable) == [nil, nil])

    let word = try #require(
      try await LookupClient.live.entry(
        LanguageReferenceID(rawValue: optional.smokeTest.languageReferenceID)))
    let rows = try #require(
      WordPage(word, using: PresentationCore(listing: manager.lists))?.frequency)
    #expect(rows.map(\.source) == ["YouTube", "Anime"])
    #expect(rows.last?.value == "Unavailable")
    #expect(rows.last?.label == "Anime rank unavailable")
    #expect(rows.last?.details.explanation == "Frequency data unavailable")
    #expect(rows.first?.value != "Unavailable")
  }

  @Test("an update or a removal that can't change the installed file leaves the pack, the lists, and what they read as they were")
  func fileThatCannotChange() async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    let optional = try animePack(in: catalog)
    let manager = try makeManager(catalog, storage: storage, source: try animeSource())
    try await manager.download(optional.packID)
    let pinned = LanguageReferenceID(rawValue: optional.smokeTest.languageReferenceID)
    let version = manager.lists.version
    let enabled = try listed(manager)
    let installed = installedFile(of: optional).path
    try FileManager.default.setAttributes([.immutable: true], ofItemAtPath: installed)
    defer { try? FileManager.default.setAttributes([.immutable: false], ofItemAtPath: installed) }

    await #expect(throws: (any Error).self) { try await manager.download(optional.packID) }
    let afterTheUpdate = try await manager.snapshot().packs.first { $0.id == optional.packID }
    #expect(afterTheUpdate?.failureMessage == "Download or validation failed. Try again.")
    #expect(try stagedFiles().isEmpty)
    await #expect(throws: (any Error).self) { try await manager.remove(optional.packID) }

    #expect(manager.lists.version == version)
    #expect(try listed(manager) == enabled)
    #expect(try manager.lists.told()?.lists?.map(\.unavailable) == [nil, nil, nil])
    #expect(try manager.lists.value(of: pinned, in: optional.disclosure) == optional.smokeTest.rank)
    let kept = try await manager.snapshot()
    #expect(kept.enabledPackIDs == enabled)
    #expect(kept.packs.first { $0.id == optional.packID }?.isInstalled == true)
  }

  @Test("a staged download a crash left behind is cleared when the manager next starts")
  func staleStagedDownload() throws {
    let catalog = try FrequencyPackCatalog.bundled()
    try FileManager.default.createDirectory(at: storage, withIntermediateDirectories: true)
    try Data("half a download".utf8).write(
      to: installedFile(of: try animePack(in: catalog)).appendingPathExtension("staged"))
    #expect(try stagedFiles().count == 1)
    _ = try makeManager(catalog, storage: storage, source: Data())
    #expect(try stagedFiles().isEmpty)
  }

  @Test("a pack's smoke test holds its file to the entry and the value its manifest pins")
  func smokeTest() throws {
    let catalog = try FrequencyPackCatalog.bundled()
    let files = try catalog.bundledArtifactURLs()
    for bundled in catalog.packs where bundled.bundled {
      let file = try #require(files[bundled.packID])
      try FrequencyPackArtifact(url: file, manifest: bundled).validateSmokeTest()
      let pinned = bundled.smokeTest
      let others = [
        FrequencyPackSmokeTest(
          languageReferenceID: pinned.languageReferenceID, rank: pinned.rank + 1),
        FrequencyPackSmokeTest(
          languageReferenceID: String(repeating: "f", count: 32), rank: pinned.rank),
      ]
      for other in others {
        let artifact = try FrequencyPackArtifact(url: file, manifest: try bundled.pinning(other))
        #expect(throws: FrequencyPackError.invalidArtifact, "\(bundled.displayName) \(other)") {
          try artifact.validateSmokeTest()
        }
      }
    }
  }

  @Test("a saved single active pack migrates to the only enabled pack")
  func legacyActivePackMigrates() async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    let optional = try animePack(in: catalog)
    let source = try animeSource()

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

    let manager = try makeManager(catalog, storage: storage, source: Data())
    #expect(try await manager.snapshot().enabledPackIDs.first == jlpt.packID)
    let meetID = try #require(jmdictID(1_198_180))
    let unlisted = LanguageReferenceID(rawValue: "ffffffffffffffffffffffffffffffff")
    #expect(try manager.lists.told()?.ids?.first == jlpt.packID.rawValue)
    #expect(try manager.lists.told()?.lists?.first?.dictionary.kind == "level")
    #expect(try manager.lists.value(of: meetID, in: jlpt.disclosure) == 5)
    #expect(try manager.lists.value(of: unlisted, in: jlpt.disclosure) == nil)
    #expect(try listed(manager).count == 2)

    try await manager.disable(jlpt.packID)
    try await manager.enable(jlpt.packID)
    #expect(try await manager.snapshot().enabledPackIDs.last == jlpt.packID)
    #expect(try listed(manager).last == jlpt.packID)
  }

  @Test("an upgrade adds JLPT once at the top, and disabling it then sticks")
  func upgradeAddsJLPTOnce() async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    let jlpt = try #require(catalog.packs.first { $0.packKind == .level })
    let tubelex = try #require(catalog.packs.first { $0.bundled && $0.packKind == .rank })
    try FileManager.default.createDirectory(at: storage, withIntermediateDirectories: true)
    try Data(#"{"enabledPackIDs":["\#(tubelex.packID.rawValue)"],"installedRecords":[]}"#.utf8)
      .write(to: storage.appendingPathComponent("state.json"))

    let upgraded = try makeManager(catalog, storage: storage, source: Data())
    #expect(try await upgraded.snapshot().enabledPackIDs == [jlpt.packID, tubelex.packID])
    #expect(try listed(upgraded) == [jlpt.packID, tubelex.packID])
    try await upgraded.disable(jlpt.packID)
    let relaunched = try makeManager(catalog, storage: storage, source: Data())
    #expect(try await relaunched.snapshot().enabledPackIDs == [tubelex.packID])
    #expect(try listed(relaunched) == [tubelex.packID])
  }

  private func jmdictID(_ sequence: Int) -> LanguageReferenceID? {
    let digest = Data("edrdg.jmdict\0\(sequence)".utf8).sha256
    return LanguageReferenceID(rawValue: String(digest.prefix(32)))
  }

  private func animePack(in catalog: FrequencyPackCatalog) throws -> FrequencyPackManifest {
    try #require(catalog.packs.first { $0.packID.rawValue == "zenbu.jiten.anime.ja.ordered-v2" })
  }

  private func animeSource() throws -> Data {
    let sourceURL = try #require(
      Bundle.module.url(
        forResource: "jiten-anime", withExtension: "json.zip", subdirectory: "Fixtures")
    )
    return try Data(contentsOf: sourceURL)
  }

  private func makeManager(
    _ catalog: FrequencyPackCatalog, storage: URL, source: Data
  ) throws -> FrequencyPackManager {
    try .bundled(catalog, storageDirectory: storage, download: { _, _ in source })
  }

  private func quit(_ manager: FrequencyPackManager) {
    manager.lists.publish([])
  }

  private func installedFile(of pack: FrequencyPackManifest) -> URL {
    storage.appendingPathComponent(pack.packID.rawValue + ".sqlite3")
  }

  private func listed(_ manager: FrequencyPackManager) throws -> [FrequencyPackID] {
    try #require(try manager.lists.told()?.ids).map(FrequencyPackID.init(rawValue:))
  }

  private func stagedFiles() throws -> [URL] {
    try FileManager.default.contentsOfDirectory(at: storage, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "staged" }
  }
}

extension FrequencyPackManifest {
  fileprivate func pinning(_ smokeTest: FrequencyPackSmokeTest) throws -> FrequencyPackManifest {
    let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(self))
    var fields = try #require(encoded as? [String: Any])
    fields["smokeTest"] = [
      "languageReferenceID": smokeTest.languageReferenceID, "rank": smokeTest.rank,
    ]
    return try JSONDecoder().decode(
      FrequencyPackManifest.self, from: JSONSerialization.data(withJSONObject: fields))
  }
}
