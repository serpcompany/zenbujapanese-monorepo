import Foundation

struct FrequencyPackID: Codable, Hashable, RawRepresentable, Sendable {
  let rawValue: String

  init(rawValue: String) {
    self.rawValue = rawValue
  }

  init(from decoder: Decoder) throws {
    rawValue = try decoder.singleValueContainer().decode(String.self)
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }
}

struct FrequencyPackCatalog: Codable, Equatable, Sendable {
  let schemaVersion: Int
  let packs: [FrequencyPackManifest]
  let trustedHistoricalManifests: [FrequencyPackManifest]

  var allTrustedManifests: [FrequencyPackManifest] {
    packs + trustedHistoricalManifests
  }

  init(
    schemaVersion: Int,
    packs: [FrequencyPackManifest],
    trustedHistoricalManifests: [FrequencyPackManifest] = []
  ) {
    self.schemaVersion = schemaVersion
    self.packs = packs
    self.trustedHistoricalManifests = trustedHistoricalManifests
  }

  static func bundled() throws -> FrequencyPackCatalog {
    guard let url = Bundle.module.url(forResource: "FrequencyPackCatalog", withExtension: "json")
    else { throw FrequencyPackError.invalidCatalog }
    let catalog = try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
    guard catalog.schemaVersion == 1, catalog.packs.count >= 2,
      catalog.packs.contains(where: \.bundled),
      Set(catalog.packs.map(\.packID)).count == catalog.packs.count,
      Set(
        try catalog.allTrustedManifests.map {
          "\($0.packID.rawValue)@\($0.packVersion)@\(try $0.trustSHA256())"
        }
      ).count == catalog.packs.count + catalog.trustedHistoricalManifests.count,
      catalog.allTrustedManifests.allSatisfy({
        [1, 2].contains($0.mappingPolicyVersion) && $0.presentationPolicyVersion == 1
          && $0.runtimeInstallerVersion == 1 && !$0.offlineImporterSHA256.isEmpty
          && !$0.mappingPolicySHA256.isEmpty && !$0.languageDataSHA256.isEmpty
          && !$0.artifactContentSHA256.isEmpty
          && $0.hasValidSourceContract && $0.hasValidSmokeTest
          && ($0.packKind == .rank || ($0.bundled && !$0.removable))
      }),
      catalog.trustedHistoricalManifests.allSatisfy({ historical in
        !historical.bundled && catalog.packs.contains { $0.packID == historical.packID }
      })
    else { throw FrequencyPackError.invalidCatalog }
    return catalog
  }

  func bundledArtifactURLs() throws -> [FrequencyPackID: URL] {
    try Dictionary(
      uniqueKeysWithValues: packs.filter(\.bundled).map { manifest in
        guard let resource = manifest.bundledResource,
          let url = Bundle.module.url(forResource: resource, withExtension: "sqlite3")
        else { throw FrequencyPackError.missingBundledPack }
        return (manifest.packID, url)
      })
  }

  static func languageDataURL() throws -> URL {
    guard let url = Bundle.languageReferenceDataURL else { throw FrequencyPackError.invalidArtifact }
    return url
  }
}

enum FrequencyPackKind: String, Codable, Sendable {
  case rank
  case level
}

struct FrequencyPackManifest: Codable, Equatable, Sendable {
  let packID: FrequencyPackID
  let packVersion: String
  let kind: FrequencyPackKind?
  let displayName: String
  let domain: String
  let domainDescription: String
  let sourceIdentity: String
  let sourceSnapshot: String
  let measurement: String
  let tokenizer: String
  let normalization: String
  let rankTiePolicy: String
  let downloadURL: URL
  let sourceBytes: Int
  let sourceSHA256: String
  let sourceTotalTokens: Int
  let coveredSourceRows: Int
  let mappedRows: Int
  let ambiguousRows: Int
  let unmappedRows: Int
  let duplicateMappings: Int
  let mappingSHA256: String
  let artifactContentSHA256: String
  let mappingPolicyVersion: Int
  let mappingPolicySHA256: String
  let offlineImporterSHA256: String
  let runtimeInstallerVersion: Int
  let presentationPolicyVersion: Int
  let presentationCapabilities: [String]
  let languageDataSHA256: String
  let bundledArtifactSHA256: String?
  let bundledResource: String?
  let corpusDocuments: Int?
  let corpusVideos: Int?
  let corpusChannels: Int?
  let attribution: String
  let bundled: Bool
  let removable: Bool
  let orderedJSONSource: FrequencyPackOrderedJSONSource?
  let smokeTest: FrequencyPackSmokeTest

  var packKind: FrequencyPackKind { kind ?? .rank }

  var hasValidSourceContract: Bool {
    guard let orderedJSONSource else { return true }
    return !bundled && orderedJSONSource.rawJSONBytes > 0
      && !orderedJSONSource.archiveEntry.isEmpty
      && !presentationCapabilities.contains("count")
  }

  var hasValidSmokeTest: Bool {
    smokeTest.rank > 0
      && (packKind == .rank || JLPTLevel(rawValue: smokeTest.rank) != nil)
      && smokeTest.languageReferenceID.count == 32
      && smokeTest.languageReferenceID.unicodeScalars.allSatisfy {
        CharacterSet(charactersIn: "0123456789abcdef").contains($0)
      }
  }

  var disclosure: FrequencyPackDisclosure {
    FrequencyPackDisclosure(
      id: packID,
      kind: packKind,
      displayName: displayName,
      domain: domain,
      domainDescription: domainDescription,
      version: packVersion,
      attribution: attribution
    )
  }

  func trustSHA256() throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return try encoder.encode(self).sha256
  }
}

struct FrequencyPackOrderedJSONSource: Codable, Equatable, Sendable {
  let archiveEntry: String
  let rawJSONBytes: Int
}

struct FrequencyPackSmokeTest: Codable, Equatable, Sendable {
  let languageReferenceID: String
  let rank: Int
}
