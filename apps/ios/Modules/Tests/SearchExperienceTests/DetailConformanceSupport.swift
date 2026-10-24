import Foundation

@testable import SearchExperience

enum DetailConformance {
  static var isRecording: Bool {
    ProcessInfo.processInfo.environment["ZENBU_RECORD_CONFORMANCE"] == "1"
  }

  static func suiteURL(_ fileName: String) -> URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .appending(path: "../../../../../language-data/conformance/\(fileName)")
      .standardizedFileURL
  }

  static func artifacts(_ names: [String]) async throws -> [ConformanceArtifact] {
    guard let databaseURL = Bundle.languageReferenceDataURL,
      let bundle = Bundle(url: databaseURL.deletingLastPathComponent())
    else { throw DetailConformanceError.missingResource("LanguageReferenceData.sqlite3") }
    var artifacts: [ConformanceArtifact] = []
    for name in names {
      let path = name as NSString
      let fileName = path.lastPathComponent as NSString
      let directory = path.deletingLastPathComponent
      let resource = fileName.deletingPathExtension
      let fileExtension = fileName.pathExtension.isEmpty ? nil : fileName.pathExtension
      guard
        let url =
          (directory.isEmpty
          ? nil
          : bundle.url(
            forResource: resource, withExtension: fileExtension, subdirectory: directory))
          ?? bundle.url(forResource: resource, withExtension: fileExtension)
      else { throw DetailConformanceError.missingResource(name) }
      artifacts.append(ConformanceArtifact(name: name, sha256: try await digests.sha256(of: url)))
    }
    return artifacts
  }

  private static let digests = BundledFileDigests()

  static func write(_ value: some Encodable, to url: URL) throws {
    try (encoder.encode(value) + Data("\n".utf8)).write(to: url)
  }

  static func differences<Value: Encodable>(_ expected: Value, _ observed: Value) throws
    -> [String]
  {
    let expectedObject = try JSONSerialization.jsonObject(with: encoder.encode(expected))
    let observedObject = try JSONSerialization.jsonObject(with: encoder.encode(observed))
    guard let expectedFields = expectedObject as? [String: Any],
      let observedFields = observedObject as? [String: Any]
    else { return (expectedObject as? NSObject) == (observedObject as? NSObject) ? [] : ["value"] }
    return Set(expectedFields.keys).union(observedFields.keys).sorted().filter { key in
      (expectedFields[key] as? NSObject) != (observedFields[key] as? NSObject)
    }
  }

  private static var encoder: JSONEncoder {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    return encoder
  }
}

struct ConformanceArtifact: Codable, Equatable {
  let name: String
  let sha256: String
}

enum DetailConformanceError: Error {
  case missingResource(String)
}

private final class BundledFileDigests: @unchecked Sendable {
  private let lock = NSLock()
  private var digests: [URL: Task<String, Error>] = [:]

  func sha256(of url: URL) async throws -> String {
    let digest = lock.withLock {
      if let started = digests[url] { return started }
      let started = Task { try await apartFromThePool { try fileSHA256(url) } }
      digests[url] = started
      return started
    }
    return try await digest.value
  }
}
