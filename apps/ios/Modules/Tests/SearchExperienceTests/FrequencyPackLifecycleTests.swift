import Foundation
import Testing
@testable import SearchExperience

@Suite("Optional frequency dictionary lifecycle", .serialized)
struct FrequencyPackLifecycleTests {
  @Test("downloaded pack supplies evidence, restores, and can be removed")
  func installActivateRestoreAndRemove() async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    let optional = try #require(
      catalog.packs.first { $0.packID.rawValue == "zenbu.public.novels.ja.ordered-v1" }
    )
    let sourceURL = try #require(
      Bundle.module.url(
        forResource: "Novel 5k", withExtension: "json.zip", subdirectory: "Fixtures")
    )
    let source = try Data(contentsOf: sourceURL)
    let storage = FileManager.default.temporaryDirectory
      .appendingPathComponent("frequency-pack-lifecycle-\(UUID().uuidString)", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: storage) }

    let manager = try FrequencyPackManager(
      catalog: catalog,
      bundledArtifactURL: try FrequencyPackCatalog.bundledArtifactURL(),
      languageDataURL: try FrequencyPackCatalog.languageDataURL(),
      storageDirectory: storage,
      download: { _ in source }
    )
    #expect(
      try await manager.snapshot().packs.first { $0.id == optional.packID }?.isInstalled == false
    )

    try await manager.download(optional.packID)
    try await manager.activate(optional.packID)
    let identifier = LanguageReferenceID(rawValue: optional.smokeTest.languageReferenceID)
    let installedEvidence = try await manager.evidence(for: identifier)
    guard case .evidence(let evidence) = installedEvidence else {
      Issue.record("The activated optional pack did not supply its pinned evidence row")
      return
    }
    #expect(evidence.pack.id == optional.packID)
    #expect(evidence.rank == optional.smokeTest.rank)

    let restored = try FrequencyPackManager(
      catalog: catalog,
      bundledArtifactURL: try FrequencyPackCatalog.bundledArtifactURL(),
      languageDataURL: try FrequencyPackCatalog.languageDataURL(),
      storageDirectory: storage,
      download: { _ in source }
    )
    #expect(try await restored.snapshot().activePackID == optional.packID)
    guard case .evidence(let restoredEvidence) = try await restored.evidence(for: identifier) else {
      Issue.record("The restored optional pack did not supply evidence")
      return
    }
    #expect(restoredEvidence.pack.id == optional.packID)

    try await restored.remove(optional.packID)
    let removed = try await restored.snapshot()
    #expect(removed.activePackID == catalog.packs.first(where: \.bundled)?.packID)
    #expect(removed.packs.first { $0.id == optional.packID }?.isInstalled == false)
  }
}
