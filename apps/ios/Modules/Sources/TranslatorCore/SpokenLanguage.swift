import Foundation

public enum SpokenLanguage: String, Codable, Sendable, CaseIterable, Hashable {
  case japanese = "ja"
  case english = "en"

  public var counterpart: SpokenLanguage {
    self == .japanese ? .english : .japanese
  }

  public var localeIdentifier: String {
    self == .japanese ? "ja-JP" : "en-US"
  }

  public func joined(_ sentences: [String]) -> String {
    sentences.joined(separator: self == .japanese ? "" : " ")
  }

  public static func detect(in text: String) -> SpokenLanguage? {
    var hasLatinLetter = false
    for scalar in text.unicodeScalars {
      if scalar.isJapaneseScript { return .japanese }
      if scalar.isASCIILetter { hasLatinLetter = true }
    }
    return hasLatinLetter ? .english : nil
  }
}

extension Unicode.Scalar {
  var isHiragana: Bool { (0x3041...0x309F).contains(value) }

  var isKatakana: Bool {
    (0x30A0...0x30FF).contains(value) || (0x31F0...0x31FF).contains(value)
      || (0xFF66...0xFF9F).contains(value)
  }

  var isKanji: Bool {
    (0x4E00...0x9FFF).contains(value) || (0x3400...0x4DBF).contains(value)
      || (0xF900...0xFAFF).contains(value) || value == 0x3005 || value == 0x3006
  }

  var isJapaneseScript: Bool { isHiragana || isKatakana || isKanji }

  var isASCIILetter: Bool {
    (0x41...0x5A).contains(value) || (0x61...0x7A).contains(value)
  }
}
