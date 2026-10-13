import Testing

@testable import SearchExperience

@Suite("A screen's loaded examples")
struct LoadedExamplesTests {
  private func page(_ numbers: Range<Int>, of listed: Int, countText: String? = nil) -> ExamplePage {
    ExamplePage(
      examples: numbers.compactMap { number in
        let digits = String(number, radix: 16)
        let id = "esp1_" + String(repeating: "0", count: 32 - digits.count) + digits
        return ExampleSentenceID(rawValue: id).map {
          LinkedExample(
            sentence: ExampleSentence(id: $0, japanese: "例文\(number)", english: "Example"),
            words: [])
        }
      },
      listed: listed,
      countText: countText)
  }

  private func numbers(_ loaded: LoadedExamples) -> [String] {
    loaded.examples.map(\.sentence.japanese)
  }

  @Test("the first page says what the list holds, and each next page continues it")
  func pagesContinueTheList() {
    var loaded = LoadedExamples()
    #expect(!loaded.holds("見る"))
    #expect(!loaded.hasMore)

    loaded.add(page(0..<25, of: 60, countText: "60 examples"), from: 0, of: "見る")
    #expect(loaded.holds("見る"))
    #expect(loaded.examples.count == 25)
    #expect(loaded.countText == "60 examples")
    #expect(loaded.hasMore)

    loaded.add(page(25..<50, of: 60), from: 25, of: "見る")
    loaded.add(page(50..<60, of: 60), from: 50, of: "見る")
    #expect(numbers(loaded) == (0..<60).map { "例文\($0)" })
    #expect(loaded.countText == "60 examples")
    #expect(!loaded.hasMore)
  }

  @Test("a page that doesn't continue the list is left out")
  func stalePagesAreLeftOut() {
    var loaded = LoadedExamples()
    loaded.add(page(0..<25, of: 60), from: 0, of: "見る")
    loaded.add(page(25..<50, of: 60), from: 25, of: "見る")

    loaded.add(page(25..<50, of: 60), from: 25, of: "見る")
    loaded.add(page(25..<50, of: 80), from: 50, of: "食べる")
    #expect(loaded.examples.count == 50)

    loaded.add(page(0..<3, of: 3), from: 0, of: "食べる")
    #expect(loaded.holds("食べる"))
    #expect(!loaded.holds("見る"))
    #expect(numbers(loaded) == ["例文0", "例文1", "例文2"])
    #expect(!loaded.hasMore)
  }

  @Test("a next page that comes back empty ends the list")
  func anEmptyPageEndsTheList() {
    var loaded = LoadedExamples()
    loaded.add(page(0..<25, of: 60, countText: "60 examples"), from: 0, of: "見る")
    loaded.add(.empty, from: 25, of: "見る")
    #expect(loaded.examples.count == 25)
    #expect(loaded.countText == "60 examples")
    #expect(!loaded.hasMore)
  }
}
