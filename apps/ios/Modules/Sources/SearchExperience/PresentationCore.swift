import Foundation

final class PresentationCore: @unchecked Sendable {
  static let shared = PresentationCore(kanji: { KanjiFiles.bundled })

  private struct RubyKey: Hashable {
    let surface: String
    let reading: String

    static func == (left: RubyKey, right: RubyKey) -> Bool {
      left.surface.utf8.elementsEqual(right.surface.utf8)
        && left.reading.utf8.elementsEqual(right.reading.utf8)
    }

    func hash(into hasher: inout Hasher) {
      hasher.combine(surface)
      hasher.combine(reading)
    }
  }

  private let lock = NSLock()
  private let kanji: @Sendable () -> KanjiFiles?
  private var core: DictionaryCore?
  private var ruby: [RubyKey: [JapaneseRubySegment]] = [:]
  private var glosses: [String: String?] = [:]

  init(kanji: @escaping @Sendable () -> KanjiFiles?) {
    self.kanji = kanji
  }

  func answer<Answer: Decodable>(_ method: String, _ argument: String) throws -> Answer {
    try lock.withLock { try preparedCore().answer(method, argument) }
  }

  func answer<Answer: Decodable>(_ method: String, _ argument: some Encodable) throws -> Answer {
    try answer(method, String(decoding: try JSONEncoder().encode(argument), as: UTF8.self))
  }

  func rubySegments(surface: String, reading: String) -> [JapaneseRubySegment] {
    let key = RubyKey(surface: surface, reading: reading)
    return lock.withLock {
      if let segments = ruby[key] { return segments }
      var pair = JSONBytes()
      pair.append("[")
      pair.appendString(surface)
      pair.append(",")
      pair.appendString(reading)
      pair.append("]")
      guard
        let segments: [JapaneseRubySegment] = try? preparedCore().answer("ruby", pair.text)
      else { return [JapaneseRubySegment(base: surface, reading: nil, kanjiReadings: nil)] }
      if ruby.count >= Self.rubyCapacity { ruby.removeAll(keepingCapacity: true) }
      ruby[key] = segments
      return segments
    }
  }

  func normalizedQuery(_ rawValue: String) -> String {
    (try? answer("normalizeQuery", rawValue)) ?? rawValue
  }

  func gloss(_ meaning: String) -> String? {
    lock.withLock {
      if let gloss = glosses[meaning] { return gloss }
      let gloss = (try? preparedCore().answer("gloss", meaning) as String?) ?? nil
      if glosses.count >= Self.glossCapacity { glosses.removeAll(keepingCapacity: true) }
      glosses[meaning] = gloss
      return gloss
    }
  }

  private func preparedCore() throws -> DictionaryCore {
    if let core { return core }
    let prepared = try DictionaryCore(kanji: kanji)
    core = prepared
    return prepared
  }

  private static let rubyCapacity = 4_000
  private static let glossCapacity = 4_000
}
