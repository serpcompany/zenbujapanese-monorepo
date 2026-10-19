import Foundation

final class KanjiFiles: Sendable {
  static let bundled: KanjiFiles? = {
    guard
      let reference = BundledData.bundle.url(forResource: "KanjiReferenceData", withExtension: "json"),
      let elements = BundledData.bundle.url(
        forResource: "KanjiElementReferenceData", withExtension: "json")
    else { return nil }
    return KanjiFiles(reference: reference, elements: elements)
  }()

  let sources: [UInt8]
  private let reference: JSONRecordFile
  private let elements: JSONRecordFile

  init?(reference: URL, elements: URL) {
    guard
      let reference = JSONRecordFile(at: reference, recordsKeyedBy: ["entries": "character"]),
      let elements = JSONRecordFile(
        at: elements, recordsKeyedBy: ["kanji": "character", "elements": "glyph"]),
      let sources = try? JSONSerialization.data(withJSONObject: [
        "metadataSourceIdentity": reference.strings["metadataSourceIdentity"] ?? "",
        "componentSourceIdentity": reference.strings["componentSourceIdentity"] ?? "",
        "schema": elements.strings["schema"] ?? "",
        "elements": [
          "snapshot": elements.strings["snapshot"] ?? "",
          "structureSourceIdentity": elements.strings["structureSourceIdentity"] ?? "",
          "metadataSourceIdentity": elements.strings["metadataSourceIdentity"] ?? "",
          "metadataSourceSnapshot": elements.strings["metadataSourceSnapshot"] ?? "",
        ],
      ])
    else { return nil }
    self.reference = reference
    self.elements = elements
    self.sources = Array(sources) + [0]
  }

  func entry(_ character: String) -> [UInt8]? { reference.record(character, in: "entries") }

  func wholeReference() -> [UInt8] { reference.whole() }

  func structure(_ character: String) -> [UInt8]? { elements.record(character, in: "kanji") }

  func element(_ glyph: String) -> [UInt8]? { elements.record(glyph, in: "elements") }
}

private struct JSONRecordFile: Sendable {
  let strings: [String: String]
  private let data: Data
  private let records: [String: [UInt32: Range<Int>]]

  init?(at url: URL, recordsKeyedBy keys: [String: String]) {
    guard let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { return nil }
    var strings: [String: String] = [:]
    var records: [String: [UInt32: Range<Int>]] = [:]
    let complete = data.withUnsafeBytes { bytes in
      var scanner = JSONScanner(bytes: bytes)
      guard scanner.take(.openBrace) else { return false }
      if scanner.take(.closeBrace) { return true }
      repeat {
        guard let field = scanner.string(), scanner.take(.colon) else { return false }
        let name = scanner.text(field)
        scanner.skipSpace()
        if scanner.byte == .quote {
          guard let value = scanner.string() else { return false }
          strings[name] = scanner.text(value)
        } else if let key = keys[name], scanner.byte == .openBracket {
          guard let found = scanner.records(keyedBy: Array(key.utf8)) else { return false }
          records[name] = found
        } else if !scanner.skipValue() {
          return false
        }
      } while scanner.take(.comma)
      return scanner.take(.closeBrace)
    }
    guard complete else { return nil }
    self.data = data
    self.strings = strings
    self.records = records
  }

  func whole() -> [UInt8] { Array(data) + [0] }

  func record(_ name: String, in list: String) -> [UInt8]? {
    let scalars = name.unicodeScalars
    guard scalars.count == 1, let scalar = scalars.first,
      let range = records[list]?[scalar.value]
    else { return nil }
    let start = data.startIndex
    return Array(data[(start + range.lowerBound)..<(start + range.upperBound)]) + [0]
  }
}

extension UInt8 {
  fileprivate static let quote = UInt8(ascii: "\"")
  fileprivate static let backslash = UInt8(ascii: "\\")
  fileprivate static let colon = UInt8(ascii: ":")
  fileprivate static let comma = UInt8(ascii: ",")
  fileprivate static let openBrace = UInt8(ascii: "{")
  fileprivate static let closeBrace = UInt8(ascii: "}")
  fileprivate static let openBracket = UInt8(ascii: "[")
  fileprivate static let closeBracket = UInt8(ascii: "]")

  fileprivate var isJSONSpace: Bool { self == 0x20 || self == 0x0A || self == 0x0D || self == 0x09 }
}

private struct JSONScanner {
  let bytes: UnsafeRawBufferPointer
  var index = 0

  var byte: UInt8? { index < bytes.count ? bytes[index] : nil }

  mutating func skipSpace() {
    while let byte, byte.isJSONSpace { index += 1 }
  }

  mutating func take(_ expected: UInt8) -> Bool {
    skipSpace()
    guard byte == expected else { return false }
    index += 1
    return true
  }

  mutating func string() -> Range<Int>? {
    guard take(.quote) else { return nil }
    let start = index
    while let byte {
      if byte == .backslash {
        index += 2
      } else if byte == .quote {
        index += 1
        return start..<(index - 1)
      } else {
        index += 1
      }
    }
    return nil
  }

  func text(_ range: Range<Int>) -> String {
    let written = UnsafeRawBufferPointer(rebasing: bytes[range])
    guard written.contains(.backslash) else { return String(decoding: written, as: UTF8.self) }
    let quoted = Data(bytes[(range.lowerBound - 1)..<(range.upperBound + 1)])
    return (try? JSONDecoder().decode(String.self, from: quoted)) ?? ""
  }

  mutating func skipValue() -> Bool {
    skipSpace()
    guard let first = byte else { return false }
    if first == .quote { return string() != nil }
    guard first == .openBrace || first == .openBracket else {
      while let byte, byte != .comma, byte != .closeBrace, byte != .closeBracket,
        !byte.isJSONSpace
      {
        index += 1
      }
      return true
    }
    var depth = 0
    while let byte {
      if byte == .quote {
        guard string() != nil else { return false }
        continue
      }
      if byte == .openBrace || byte == .openBracket { depth += 1 }
      if byte == .closeBrace || byte == .closeBracket { depth -= 1 }
      index += 1
      if depth == 0 { return true }
    }
    return false
  }

  mutating func records(keyedBy key: [UInt8]) -> [UInt32: Range<Int>]? {
    guard take(.openBracket) else { return nil }
    var found: [UInt32: Range<Int>] = [:]
    if take(.closeBracket) { return found }
    repeat {
      skipSpace()
      let start = index
      guard take(.openBrace) else { return nil }
      var name: Range<Int>?
      if !take(.closeBrace) {
        repeat {
          guard let field = string(), take(.colon) else { return nil }
          skipSpace()
          if byte == .quote, bytes[field].elementsEqual(key) {
            guard let value = string() else { return nil }
            name = value
          } else if !skipValue() {
            return nil
          }
        } while take(.comma)
        guard take(.closeBrace) else { return nil }
      }
      let scalars = name.map { text($0).unicodeScalars }
      if let scalars, scalars.count == 1, let scalar = scalars.first {
        found[scalar.value] = start..<index
      }
    } while take(.comma)
    return take(.closeBracket) ? found : nil
  }
}
