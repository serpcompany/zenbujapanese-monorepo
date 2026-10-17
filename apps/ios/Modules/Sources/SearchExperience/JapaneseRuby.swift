import Foundation

struct JapaneseRubySegment: Decodable, Hashable, Sendable {
  let base: String
  let reading: String?
  let kanjiReadings: [String]?

  private enum CodingKeys: String, CodingKey {
    case base = "text"
    case reading
    case kanjiReadings
  }
}

struct JapaneseRuby: Hashable, Sendable {
  let surface: String
  let reading: String
  let segments: [JapaneseRubySegment]
}

extension JapaneseRuby {
  init(surface: String, reading: String) {
    self.init(
      surface: surface, reading: reading,
      segments: PresentationCore.shared.rubySegments(surface: surface, reading: reading))
  }

  init(headwordOf entry: DictionaryEntry, on page: WordPage?) {
    if let page {
      self.init(surface: entry.headword, reading: entry.reading, segments: page.ruby)
    } else {
      self.init(surface: entry.headword, reading: entry.reading)
    }
  }
}
