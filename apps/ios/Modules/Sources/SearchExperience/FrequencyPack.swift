import Foundation

typealias FrequencyRanks = [FrequencyLookupResult]

struct FrequencyCapability: Sendable {
  private let batchLookup:
    @Sendable ([LanguageReferenceID]) async throws -> [LanguageReferenceID: FrequencyRanks]

  init(
    batchLookup:
      @escaping @Sendable ([LanguageReferenceID]) async throws
      -> [LanguageReferenceID: FrequencyRanks]
  ) {
    self.batchLookup = batchLookup
  }

  func evidence(for id: LanguageReferenceID) async throws -> FrequencyRanks {
    guard let result = try await batchLookup([id])[id] else {
      throw FrequencyPackError.invalidArtifact
    }
    return result
  }

  func evidence(for ids: [LanguageReferenceID]) async throws
    -> [LanguageReferenceID: FrequencyRanks]
  {
    let results = try await batchLookup(ids)
    guard ids.allSatisfy({ results[$0] != nil }) else {
      throw FrequencyPackError.invalidArtifact
    }
    return results
  }

  static let live = FrequencyCapability(batchLookup: { ids in
    try await FrequencyPackStore.shared.evidence(for: ids)
  })

  static func freshBundledTUBELEX() throws -> FrequencyCapability {
    guard
      let url = Bundle.module.url(
        forResource: "TUBELEXFrequencyPack", withExtension: "sqlite3")
    else {
      throw FrequencyPackError.missingBundledPack
    }
    let catalog = try FrequencyPackCatalog.bundled()
    guard
      let manifest = catalog.packs.first(where: {
        $0.bundled && $0.bundledResource == "TUBELEXFrequencyPack"
      })
    else {
      throw FrequencyPackError.invalidCatalog
    }
    let artifact = try FrequencyPackArtifact(url: url, manifest: manifest)
    try artifact.validateSmokeTest()
    return FrequencyCapability(batchLookup: { ids in
      try artifact.evidence(for: ids).mapValues { [$0] }
    })
  }
}

struct FrequencyPackClient: Sendable {
  var snapshot: @Sendable () async throws -> FrequencyPackSnapshot
  var download: @Sendable (FrequencyPackID) async throws -> Void
  var enable: @Sendable (FrequencyPackID) async throws -> Void
  var disable: @Sendable (FrequencyPackID) async throws -> Void
  var reorderEnabled: @Sendable ([FrequencyPackID]) async throws -> Void
  var remove: @Sendable (FrequencyPackID) async throws -> Void

  static let live = FrequencyPackClient(
    snapshot: { try await FrequencyPackStore.shared.snapshot() },
    download: { try await FrequencyPackStore.shared.download($0) },
    enable: { try await FrequencyPackStore.shared.enable($0) },
    disable: { try await FrequencyPackStore.shared.disable($0) },
    reorderEnabled: { try await FrequencyPackStore.shared.reorderEnabled($0) },
    remove: { try await FrequencyPackStore.shared.remove($0) }
  )
}

enum FrequencyLookupResult: Equatable, Sendable {
  case evidence(FrequencyEvidence)
  case level(FrequencyLevelEvidence)
  case noEvidence(pack: FrequencyPackDisclosure)
  case unavailable(FrequencyPackUnavailable)

  var hasEvidence: Bool { sortValue != nil }

  var sortValue: Int? {
    switch self {
    case .evidence(let evidence): evidence.rank
    case .level(let evidence): evidence.level.sortValue
    case .noEvidence, .unavailable: nil
    }
  }

  var pack: FrequencyPackDisclosure? {
    switch self {
    case .evidence(let evidence): evidence.pack
    case .level(let evidence): evidence.pack
    case .noEvidence(let pack): pack
    case .unavailable(let unavailable): unavailable.pack
    }
  }

  var tier: FrequencyTier? {
    switch self {
    case .evidence(let evidence): FrequencyTier(rank: evidence.rank)
    case .level(let evidence): FrequencyTier(level: evidence.level)
    case .noEvidence, .unavailable: nil
    }
  }

  static func unavailableResults(
    for ids: [LanguageReferenceID],
    pack: FrequencyPackDisclosure?,
    reason: String
  ) -> [LanguageReferenceID: FrequencyLookupResult] {
    var results: [LanguageReferenceID: FrequencyLookupResult] = [:]
    for id in ids {
      results[id] = .unavailable(FrequencyPackUnavailable(pack: pack, reason: reason))
    }
    return results
  }
}

struct FrequencyPackUnavailable: Equatable, Sendable {
  let pack: FrequencyPackDisclosure?
  let reason: String
}

struct FrequencyEvidence: Equatable, Sendable {
  let pack: FrequencyPackDisclosure
  let languageReferenceID: LanguageReferenceID
  let rank: Int
  let coveredSourceRows: Int
  let sourceCount: Int
  let sourceTotalTokens: Int
  let sourceDocuments: Int?
  let sourceVideos: Int?
  let sourceChannels: Int?
  let matchedForm: String
  let sourcePartOfSpeech: String?
  let sourceRecordDigest: String
  let mappingRelation: MappingRelation

  enum MappingRelation: String, Equatable, Sendable {
    case exactWrittenReading
    case exactReading
    case exactReadingPOS
    case exactWrittenPOS
    case uniqueFormFallback
  }

  var topPercentDisplay: String {
    let percent = Double(rank) / Double(coveredSourceRows) * 100
    return "Top \(String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), percent))%"
  }
}

enum JLPTLevel: Int, CaseIterable, Sendable {
  case n1 = 1
  case n2
  case n3
  case n4
  case n5

  var label: String { "N\(rawValue)" }

  var sortValue: Int { 6 - rawValue }
}

struct FrequencyLevelEvidence: Equatable, Sendable {
  let pack: FrequencyPackDisclosure
  let languageReferenceID: LanguageReferenceID
  let level: JLPTLevel

  static let explanation =
    "JLPT levels are study estimates from Jonathan Waller's vocabulary lists. JLPT has "
    + "published no official vocabulary list since 2010."
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

private actor FrequencyPackStore {
  static let shared = FrequencyPackStore()
  private let manager: FrequencyPackManager?

  init() {
    guard
      let languageDataURL = Bundle.languageReferenceDataURL,
      let catalog = try? FrequencyPackCatalog.bundled(),
      let bundledArtifactURLs = try? catalog.bundledArtifactURLs(),
      let support = FileManager.default.urls(
        for: .applicationSupportDirectory, in: .userDomainMask
      ).first
    else {
      manager = nil
      return
    }
    let storageDirectory = support.appendingPathComponent("FrequencyPacks", isDirectory: true)
    manager = try? FrequencyPackManager(
      catalog: catalog,
      bundledArtifactURLs: bundledArtifactURLs,
      languageDataURL: languageDataURL,
      storageDirectory: storageDirectory,
      download: { url in
        let (data, response) = try await URLSession.shared.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
          throw FrequencyPackError.invalidSource
        }
        return data
      }
    )
  }

  func evidence(for ids: [LanguageReferenceID]) async throws
    -> [LanguageReferenceID: FrequencyRanks]
  {
    guard let manager else {
      return FrequencyLookupResult.unavailableResults(
        for: ids, pack: nil, reason: "Bundled frequency data unavailable"
      ).mapValues { [$0] }
    }
    return try await manager.evidence(for: ids)
  }

  func snapshot() async throws -> FrequencyPackSnapshot {
    guard let manager else { throw FrequencyPackError.invalidCatalog }
    return try await manager.snapshot()
  }

  func download(_ packID: FrequencyPackID) async throws {
    guard let manager else { throw FrequencyPackError.invalidCatalog }
    try await manager.download(packID)
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
