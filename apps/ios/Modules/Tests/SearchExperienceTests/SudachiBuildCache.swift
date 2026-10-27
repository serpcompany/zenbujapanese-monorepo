import Foundation

@testable import SearchExperience

enum SudachiBuildCache {
  static let dictionary = Task { try await apartFromThePool { try located() } }

  private static let pack = try? LanguageTechnologyPackCatalog.bundled().bundledDefault

  static let artifact = ConformanceArtifact(
    name: "system_core.dic", sha256: pack?.installedSHA256 ?? "")

  static func analyzer() async throws -> SudachiJapaneseMorphologyAdapter {
    let dictionary = try await dictionary.value
    return try await apartFromThePool {
      try SudachiJapaneseMorphologyAdapter(dictionaryURL: dictionary)
    }
  }

  private static var root: URL {
    let environment = ProcessInfo.processInfo.environment
    if let cache = environment["ZENBU_SUDACHI_BUILD_CACHE"] {
      return URL(fileURLWithPath: cache)
    }
    let home = environment["SIMULATOR_HOST_HOME"] ?? NSHomeDirectory()
    return URL(fileURLWithPath: home)
      .appending(path: "Library/Caches/com.zenbujapanese.build/SudachiCore")
  }

  private static func located() throws -> URL {
    let contracts = root.appending(path: "contracts")
    let folders =
      (try? FileManager.default.contentsOfDirectory(
        at: contracts, includingPropertiesForKeys: nil)) ?? []
    for folder in folders.sorted(by: { $0.path < $1.path }) {
      let candidate = folder.appending(path: "system_core.dic")
      let size = try? candidate.resourceValues(forKeys: [.fileSizeKey]).fileSize
      if let pack, size == pack.installedBytes,
        try fileSHA256(candidate) == pack.installedSHA256
      {
        return candidate
      }
    }
    throw SudachiBuildCacheError.missing(contracts.path)
  }
}

enum SudachiBuildCacheError: Error, CustomStringConvertible {
  case missing(String)

  var description: String {
    switch self {
    case .missing(let path):
      "Sudachi's dictionary isn't in \(path). Fill the Sudachi build cache with "
        + "apps/ios/Tools/prepare_sudachi_core.py --cache-only (docs/agents/ios.md, Build and inspect)"
    }
  }
}
