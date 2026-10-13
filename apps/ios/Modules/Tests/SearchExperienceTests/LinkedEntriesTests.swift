import Testing

@testable import SearchExperience

@Suite("Linked entries")
struct LinkedEntriesTests {
  private static let kept = "kept"
  private static let late = "late"

  private func word(_ entry: String) -> LinkedWord {
    LinkedWord(
      surface: entry, start: 0, end: 1, reading: nil, isFunctionWord: false, entry: entry,
      candidates: [], furigana: nil, ruby: nil, accent: nil, attaches: nil, counted: true)
  }

  @Test(
    "a text keeps the entries it found while another text's read empties the cache",
    .timeLimit(.minutes(1)))
  func aTextKeepsItsEntriesWhileTheCacheIsEmptied() async {
    let (reached, reach) = AsyncStream<Void>.makeStream()
    let (released, release) = AsyncStream<Void>.makeStream()
    let linked = LinkedEntries(
      lookupClient: LookupClient(
        search: { _ in throw CancellationError() },
        entry: { _ in nil },
        entries: { ids in
          if ids.contains(LanguageReferenceID(rawValue: Self.late)) {
            reach.yield()
            for await _ in released { break }
          }
          return Dictionary(
            uniqueKeysWithValues: ids.map {
              ($0, DictionaryEntry.fixture(id: $0.rawValue, headword: $0.rawValue))
            })
        },
        entryMatchingForm: { _ in nil },
        entriesMatchingForm: { _ in [] },
        entriesContainingKanji: { _ in [] }
      ))
    _ = await linked.tokens([[word(Self.kept)]], highlightedEntry: nil)

    let text = [word(Self.kept), word(Self.late)]
    let moreThanTheCacheHolds = (0...LinkedEntries.capacity).map { word("other \($0)") }
    async let waiting = linked.tokens([text], highlightedEntry: nil)
    for await _ in reached { break }
    _ = await linked.tokens([moreThanTheCacheHolds], highlightedEntry: nil)
    release.yield()

    let tokens = await waiting
    #expect(tokens.map { $0.map { $0.entry?.id.rawValue } } == [[Self.kept, Self.late]])
  }
}
