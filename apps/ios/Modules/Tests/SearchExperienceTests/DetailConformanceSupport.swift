import Foundation

@testable import SearchExperience

/// Shared plumbing for the app-recorded detail conformance suites in
/// `apps/ios/LanguageData/Conformance/`: where they live, whether this run records them, and the
/// bundled artifacts they pin.
enum DetailConformance {
  /// Set by `TEST_RUNNER_ZENBU_RECORD_CONFORMANCE=1`, the same switch as the search suite.
  static var isRecording: Bool {
    ProcessInfo.processInfo.environment["ZENBU_RECORD_CONFORMANCE"] == "1"
  }

  static func suiteURL(_ fileName: String) -> URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()  // SearchExperienceTests
      .deletingLastPathComponent()  // Tests
      .deletingLastPathComponent()  // Modules
      .deletingLastPathComponent()  // apps/ios
      .appending(path: "LanguageData/Conformance/\(fileName)")
  }

  /// The SHA-256 of each named file as the app bundles it, so a suite states exactly which data
  /// it was recorded against. A name such as `Kuromoji/base.dat.gz` looks in that subdirectory
  /// first, as the app does.
  static func artifacts(_ names: [String]) throws -> [ConformanceArtifact] {
    guard let databaseURL = Bundle.languageReferenceDataURL,
      let bundle = Bundle(url: databaseURL.deletingLastPathComponent())
    else { throw DetailConformanceError.missingResource("LanguageReferenceData.sqlite3") }
    return try names.map { name in
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
      return ConformanceArtifact(name: name, sha256: try fileSHA256(url))
    }
  }

  static func write(_ value: some Encodable, to url: URL) throws {
    try (encoder.encode(value) + Data("\n".utf8)).write(to: url)
  }

  /// The top-level fields where two recorded values differ, for a readable failure.
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
