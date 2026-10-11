import Foundation

final class PresentationCore: @unchecked Sendable {
  static let shared = PresentationCore(
    kanji: { KanjiFiles.bundled }, radicals: { RadicalLookupClient.bundledFile() })

  private struct Written: Hashable {
    let text: String

    static func == (left: Written, right: Written) -> Bool {
      left.text.utf8.elementsEqual(right.text.utf8)
    }

    func hash(into hasher: inout Hasher) {
      hasher.combine(text)
    }
  }

  private struct Memo<Answer> {
    let capacity: Int
    private var answers: [[Written]: Answer] = [:]

    init(capacity: Int) {
      self.capacity = capacity
    }

    subscript(key: [Written]) -> Answer? { answers[key] }

    mutating func remember(_ answer: Answer, for key: [Written]) {
      if answers.count >= capacity { answers.removeAll(keepingCapacity: true) }
      answers[key] = answer
    }
  }

  private struct SpokenWord: Encodable {
    let surface: String
    let reading: String
  }

  private let lock = NSRecursiveLock()
  private let kanji: @Sendable () -> KanjiFiles?
  private let radicals: @Sendable () -> [UInt8]?
  private var core: DictionaryCore?
  private var ruby = Memo<[JapaneseRubySegment]>(capacity: 4_000)
  private var glosses = Memo<String?>(capacity: 4_000)
  private var readings = Memo<String?>(capacity: 4_000)
  private var sentences = Memo<String?>(capacity: 512)
  private var kanjiChecks = Memo<Bool>(capacity: 4_000)

  init(
    kanji: @escaping @Sendable () -> KanjiFiles?,
    radicals: @escaping @Sendable () -> [UInt8]? = { nil }
  ) {
    self.kanji = kanji
    self.radicals = radicals
  }

  func answer<Answer: Decodable>(_ method: String, _ argument: String) throws -> Answer {
    try lock.withLock { try preparedCore().answer(method, argument) }
  }

  func answer<Answer: Decodable>(_ method: String, _ argument: some Encodable) throws -> Answer {
    try answer(method, try DictionaryCore.argument(argument))
  }

  func rubySegments(surface: String, reading: String) -> [JapaneseRubySegment] {
    remembered(
      \.ruby, [surface, reading],
      otherwise: [JapaneseRubySegment(base: surface, reading: nil, kanjiReadings: nil)]
    ) { core in
      var pair = JSONBytes()
      pair.append("[")
      pair.appendString(surface)
      pair.append(",")
      pair.appendString(reading)
      pair.append("]")
      return try core.answer("ruby", pair.text)
    }
  }

  func normalizedQuery(_ rawValue: String) -> String {
    (try? answer("normalizeQuery", rawValue)) ?? rawValue
  }

  func gloss(_ meaning: String) -> String? {
    remembered(\.glosses, [meaning], otherwise: nil) { try $0.answer("gloss", meaning) }
  }

  func romaji(_ reading: String) -> String? {
    remembered(\.readings, [reading], otherwise: nil) { try $0.answer("romaji", reading) }
  }

  func romaji(of words: [(surface: String, reading: String?)]) -> String? {
    remembered(\.sentences, words.flatMap { [$0.surface, $0.reading ?? ""] }, otherwise: nil) {
      let spoken = words.map { SpokenWord(surface: $0.surface, reading: $0.reading ?? "") }
      return try $0.answer("sentenceRomaji", try DictionaryCore.argument(spoken))
    }
  }

  func isKanji(_ text: String) -> Bool {
    remembered(\.kanjiChecks, [text], otherwise: false) { try $0.answer("isKanji", text) }
  }

  private func remembered<Answer: Decodable>(
    _ memo: ReferenceWritableKeyPath<PresentationCore, Memo<Answer>>, _ texts: [String],
    otherwise fallback: Answer, _ ask: (DictionaryCore) throws -> Answer
  ) -> Answer {
    lock.withLock {
      let key = texts.map(Written.init)
      if let known = self[keyPath: memo][key] { return known }
      do {
        let answer = try ask(preparedCore())
        self[keyPath: memo].remember(answer, for: key)
        return answer
      } catch {
        return fallback
      }
    }
  }

  private func preparedCore() throws -> DictionaryCore {
    if let core { return core }
    let prepared = try DictionaryCore(kanji: kanji, radicals: radicals)
    core = prepared
    return prepared
  }
}
