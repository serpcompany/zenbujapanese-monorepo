import Testing

@testable import SearchExperience

@Suite("Linked entries", .timeLimit(.minutes(1)))
struct LinkedEntriesTests {
  private static let kept = "kept"
  private static let late = "late"
  private static let moreThanTheCacheHolds = (0...LinkedEntries.capacity).map {
    word("other \($0)")
  }

  private static func word(_ entry: String) -> LinkedWord {
    LinkedWord(
      surface: entry, start: 0, end: 1, reading: nil, isFunctionWord: false, entry: entry,
      candidates: [], furigana: nil, ruby: nil, isPageWord: false, matchesQuery: false,
      attaches: nil)
  }

  private static func linked(
    reading read: @escaping @Sendable ([LanguageReferenceID]) async -> Void = { _ in }
  ) -> LinkedEntries {
    LinkedEntries(
      lookupClient: LookupClient(
        search: { _ in throw CancellationError() },
        entry: { _ in nil },
        entries: { ids in
          await read(ids)
          return Dictionary(
            uniqueKeysWithValues: ids.map {
              ($0, DictionaryEntry.fixture(id: $0.rawValue, headword: $0.rawValue))
            })
        },
        entryMatchingForm: { _ in nil },
        entriesMatchingForm: { _ in [] },
        entriesContainingKanji: { _ in [] }
      ))
  }

  private static func entries(_ tokens: [JapaneseTextToken]) -> [String?] {
    tokens.map { $0.entry?.id.rawValue }
  }

  @Test("a text that takes the cache past its capacity keeps the entries already cached")
  func aTextThatFillsTheCacheKeepsItsCachedEntries() async {
    let linked = Self.linked()
    _ = await linked.tokens([Self.word(Self.kept)], highlightedEntry: nil)

    let text = [Self.word(Self.kept)] + Self.moreThanTheCacheHolds
    let tokens = await linked.tokens(text, highlightedEntry: nil)

    #expect(Self.entries(tokens) == text.map(\.entry))
  }

  @Test("a text keeps the entries it found while another text's read empties the cache")
  func aTextKeepsItsEntriesWhileAnotherTextEmptiesTheCache() async {
    let (reached, reach) = AsyncStream<Void>.makeStream()
    let (released, release) = AsyncStream<Void>.makeStream()
    let linked = Self.linked { ids in
      guard ids.contains(LanguageReferenceID(rawValue: Self.late)) else { return }
      reach.yield()
      for await _ in released { break }
    }
    _ = await linked.tokens([Self.word(Self.kept)], highlightedEntry: nil)

    async let waiting = linked.tokens(
      [Self.word(Self.kept), Self.word(Self.late)], highlightedEntry: nil)
    for await _ in reached { break }
    _ = await linked.tokens(Self.moreThanTheCacheHolds, highlightedEntry: nil)
    release.yield()
    let tokens = await waiting

    #expect(Self.entries(tokens) == [Self.kept, Self.late])
  }

  @Test("a text links the page's own entry as the page has it")
  func aTextLinksThePagesOwnEntry() async {
    let page = DictionaryEntry.fixture(id: Self.kept, headword: "page word")

    let tokens = await Self.linked().tokens([Self.word(Self.kept)], highlightedEntry: page)

    #expect(tokens.map { $0.entry?.headword } == ["page word"])
  }
}
