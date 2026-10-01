import Foundation

@testable import SearchExperience

enum DetailConformance {
  static var isRecording: Bool {
    ProcessInfo.processInfo.environment["ZENBU_RECORD_CONFORMANCE"] == "1"
  }

  static func suiteURL(_ fileName: String) -> URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appending(path: "LanguageData/Conformance/\(fileName)")
  }

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
