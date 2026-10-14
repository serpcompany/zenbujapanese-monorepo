import Foundation

final class PresentationCore: @unchecked Sendable {
  static let shared = PresentationCore(
    kanji: { KanjiFiles.bundled }, radicals: { RadicalLookupClient.bundledFile() },
    frequencyLists: .live)

  private struct Written: Hashable {
    var text: String

    init(_ text: String) {
      self.text = text
      self.text.makeContiguousUTF8()
    }

    static func == (left: Written, right: Written) -> Bool {
      left.text.utf8.withContiguousStorageIfAvailable { left in
        right.text.utf8.withContiguousStorageIfAvailable { right in
          left.count == right.count
            && (left.isEmpty || memcmp(left.baseAddress, right.baseAddress, left.count) == 0)
        }
      }.flatMap { $0 } ?? left.text.utf8.elementsEqual(right.text.utf8)
    }

    func hash(into hasher: inout Hasher) {
      let hashed: Void? = text.utf8.withContiguousStorageIfAvailable {
        hasher.combine(bytes: UnsafeRawBufferPointer($0))
      }
      if hashed == nil { hasher.combine(text) }
    }
  }

  private struct Pair: Hashable {
    let first: Written
    let second: Written
  }

  private struct Memo<Key: Hashable, Answer> {
    let capacity: Int
    private var answers: [Key: Answer] = [:]

    init(capacity: Int) {
      self.capacity = capacity
    }

    subscript(key: Key) -> Answer? { answers[key] }

    mutating func remember(_ answer: Answer, for key: Key) {
      if answers.count >= capacity { answers.removeAll(keepingCapacity: true) }
      answers[key] = answer
    }
  }

  let frequencyLists: FrequencyLists?
  private let lock = NSRecursiveLock()
  private let kanji: @Sendable () -> KanjiFiles?
  private let radicals: @Sendable () -> [UInt8]?
  private var core: DictionaryCore?
  private var ruby = Memo<Pair, [JapaneseRubySegment]>(capacity: 4_000)
  private var queries = Memo<Written, String>(capacity: 1_000)
  private var glosses = Memo<Written, String?>(capacity: 4_000)
  private var readings = Memo<Written, String?>(capacity: 4_000)
  private var sentences = Memo<[Written], String?>(capacity: 512)
  private var kanjiChecks = Memo<Written, Bool>(capacity: 4_000)
  private var pages = Memo<LanguageReferenceID, WordPage?>(capacity: 64)
  private var pagesListsVersion = 0

  init(
    kanji: @escaping @Sendable () -> KanjiFiles?,
    radicals: @escaping @Sendable () -> [UInt8]? = { nil },
    frequencyLists: FrequencyLists? = nil
  ) {
    self.kanji = kanji
    self.radicals = radicals
    self.frequencyLists = frequencyLists
  }

  func answer<Answer: Decodable>(_ method: String, _ argument: String) throws -> Answer {
    try lock.withLock { try preparedCore().answer(method, argument) }
  }

  func answer<Answer: Decodable>(_ method: String, _ argument: some Encodable) throws -> Answer {
    try answer(method, try DictionaryCore.argument(argument))
  }

  func rubySegments(surface: String, reading: String) -> [JapaneseRubySegment] {
    remembered(
      \.ruby, Pair(first: Written(surface), second: Written(reading)),
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
    remembered(\.queries, Written(rawValue), otherwise: rawValue) {
      try $0.text("normalizeQuery", rawValue) ?? rawValue
    }
  }

  func gloss(_ meaning: String) -> String? {
    remembered(\.glosses, Written(meaning), otherwise: nil) { try $0.text("gloss", meaning) }
  }

  func romaji(_ reading: String) -> String? {
    remembered(\.readings, Written(reading), otherwise: nil) { try $0.text("romaji", reading) }
  }

  func romaji(of words: [(surface: String, reading: String?)]) -> String? {
    var key: [Written] = []
    key.reserveCapacity(words.count * 2)
    for word in words {
      key.append(Written(word.surface))
      key.append(Written(word.reading ?? ""))
    }
    return remembered(\.sentences, key, otherwise: nil) {
      var spoken = JSONBytes()
      spoken.append("[")
      for word in words {
        spoken.append(spoken.last == UInt8(ascii: "[") ? "{\"surface\":" : ",{\"surface\":")
        spoken.appendString(word.surface)
        spoken.append(",\"reading\":")
        spoken.appendString(word.reading ?? "")
        spoken.append("}")
      }
      spoken.append("]")
      return try $0.text("sentenceRomaji", spoken.text)
    }
  }

  func containsJapaneseText(_ text: String) -> Bool {
    lock.withLock { (try? preparedCore().flag("containsJapaneseText", text)) ?? false }
  }

  func writtenLanguage(_ text: String) -> String? {
    lock.withLock { try? preparedCore().text("writtenLanguage", text) }
  }

  func isKanji(_ text: String) -> Bool {
    remembered(\.kanjiChecks, Written(text), otherwise: false) { try $0.flag("isKanji", text) }
  }

  func wordPage(of id: LanguageReferenceID, asking entry: () throws -> String) -> WordPage? {
    lock.withLock {
      let listsVersion = frequencyLists?.version ?? 0
      if listsVersion != pagesListsVersion {
        pages = Memo(capacity: pages.capacity)
        pagesListsVersion = listsVersion
      }
      return remembered(\.pages, id, otherwise: nil) { try $0.answer("wordPage", try entry()) }
    }
  }

  private func remembered<Key: Hashable, Answer>(
    _ memo: ReferenceWritableKeyPath<PresentationCore, Memo<Key, Answer>>, _ key: Key,
    otherwise fallback: Answer, _ ask: (DictionaryCore) throws -> Answer
  ) -> Answer {
    lock.withLock {
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
    let prepared = try DictionaryCore(
      kanji: kanji, radicals: radicals, frequencyLists: frequencyLists?.reading)
    core = prepared
    return prepared
  }
}
