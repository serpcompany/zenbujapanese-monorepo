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
      candidates: [], furigana: nil, ruby: nil, accent: nil, attaches: nil)
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

  private static func link(
    _ text: [LinkedWord], in linked: LinkedEntries, page: DictionaryEntry? = nil
  ) async -> [JapaneseTextToken] {
    await linked.tokens([text], highlightedEntry: page)[0]
  }

  private static func entries(_ tokens: [JapaneseTextToken]) -> [String?] {
    tokens.map { $0.entry?.id.rawValue }
  }

  @Test("a text that takes the cache past its capacity keeps the entries already cached")
  func aTextThatFillsTheCacheKeepsItsCachedEntries() async {
    let linked = Self.linked()
    _ = await Self.link([Self.word(Self.kept)], in: linked)

    let text = [Self.word(Self.kept)] + Self.moreThanTheCacheHolds
    let tokens = await Self.link(text, in: linked)

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
    _ = await Self.link([Self.word(Self.kept)], in: linked)

    async let waiting = Self.link([Self.word(Self.kept), Self.word(Self.late)], in: linked)
    for await _ in reached { break }
    _ = await Self.link(Self.moreThanTheCacheHolds, in: linked)
    release.yield()
    let tokens = await waiting

    #expect(Self.entries(tokens) == [Self.kept, Self.late])
  }

  @Test("a text past the cache's capacity starts it again, so an entry it pushed out is read again")
  func aTextPastTheCapacityStartsTheCacheAgain() async {
    let reads = Reads()
    let linked = Self.linked { await reads.record($0) }
    _ = await Self.link([Self.word(Self.kept)], in: linked)
    _ = await Self.link(Self.moreThanTheCacheHolds, in: linked)

    let tokens = await Self.link([Self.word(Self.kept)], in: linked)
    let keptReads = await reads.ids.count { $0.rawValue == Self.kept }

    #expect(Self.entries(tokens) == [Self.kept])
    #expect(keptReads == 2)
  }

  @Test("texts linked together share one read and each keeps its cached entries past capacity")
  func textsLinkedTogetherKeepTheirCachedEntries() async {
    let reads = Reads()
    let linked = Self.linked { await reads.record($0) }
    _ = await Self.link([Self.word(Self.kept)], in: linked)

    let texts = [[Self.word(Self.kept)], Self.moreThanTheCacheHolds]
    let tokens = await linked.tokens(texts, highlightedEntry: nil)
    let readCalls = await reads.calls

    #expect(tokens.map(Self.entries) == texts.map { $0.map(\.entry) })
    #expect(readCalls == 2)
  }

  private actor Reads {
    private(set) var ids: [LanguageReferenceID] = []
    private(set) var calls = 0

    func record(_ read: [LanguageReferenceID]) {
      ids += read
      calls += 1
    }
  }

  @Test("a text links the page's own entry as the page has it")
  func aTextLinksThePagesOwnEntry() async {
    let page = DictionaryEntry.fixture(id: Self.kept, headword: "page word")

    let tokens = await Self.link([Self.word(Self.kept)], in: Self.linked(), page: page)

    #expect(tokens.map { $0.entry?.headword } == ["page word"])
  }
}
