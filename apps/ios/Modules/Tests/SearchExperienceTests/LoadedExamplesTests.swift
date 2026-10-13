import Testing

@testable import SearchExperience

@MainActor
@Suite("A screen's loaded examples")
struct LoadedExamplesTests {
  @MainActor
  private final class Listing {
    static let pageSize = 25

    let word: String
    let listed: Int
    var asked: [ExampleBatch] = []
    var failing: Set<Int> = []
    var beforeAnswering: [Int: () async -> Void] = [:]

    init(_ word: String, listed: Int) {
      self.word = word
      self.listed = listed
    }

    func read(_ batch: ExampleBatch) async -> ExamplePage? {
      asked.append(batch)
      await beforeAnswering.removeValue(forKey: batch.from)?()
      if failing.remove(batch.from) != nil { return nil }
      let pageEnd = (batch.from / Self.pageSize + 1) * Self.pageSize
      let end = min(listed, pageEnd, batch.limit.map { batch.from + $0 } ?? .max)
      return ExamplePage(
        examples: (batch.from..<max(batch.from, end)).compactMap { number in
          let digits = String(number, radix: 16)
          let id = "esp1_" + String(repeating: "0", count: 32 - digits.count) + digits
          return ExampleSentenceID(rawValue: id).map {
            LinkedExample(
              sentence: ExampleSentence(id: $0, japanese: "\(word)\(number)", english: "Example"),
              words: [])
          }
        },
        listed: listed,
        countText: "\(listed) examples")
    }

    func rows(_ numbers: Range<Int>) -> [String] {
      numbers.map { "\(word)\($0)" }
    }
  }

  private func rows(_ loaded: LoadedExamples) -> [String] {
    loaded.examples.map(\.sentence.japanese)
  }

  @Test("the first answer holds a screen's rows, and the rest of its page follows at once")
  func theFirstScreenComesFirst() async {
    let miru = Listing("見る", listed: 60)
    let loaded = LoadedExamples()
    #expect(!loaded.answers("見る"))
    #expect(!loaded.hasMore)
    var shownWhenTheRestWasAsked: [String] = []
    miru.beforeAnswering[8] = { shownWhenTheRestWasAsked = rows(loaded) }

    await loaded.load("見る", rowsOnScreen: 8, read: miru.read)
    #expect(miru.asked == [ExampleBatch(from: 0, limit: 8), ExampleBatch(from: 8)])
    #expect(shownWhenTheRestWasAsked == miru.rows(0..<8))
    #expect(loaded.answers("見る"))
    #expect(rows(loaded) == miru.rows(0..<25))
    #expect(loaded.countText == "60 examples")
    #expect(loaded.hasMore)

    await loaded.loadMore(read: miru.read)
    await loaded.loadMore(read: miru.read)
    await loaded.loadMore(read: miru.read)
    #expect(miru.asked.dropFirst(2) == [ExampleBatch(from: 25), ExampleBatch(from: 50)])
    #expect(rows(loaded) == miru.rows(0..<60))
    #expect(!loaded.hasMore)
  }

  @Test("a screen that fits a whole page, or whose size isn't known, is answered in one read")
  func aWholePageIsOneRead() async {
    for rowsOnScreen in [nil, 30] {
      let miru = Listing("見る", listed: 60)
      let loaded = LoadedExamples()
      await loaded.load("見る", rowsOnScreen: rowsOnScreen, read: miru.read)
      #expect(miru.asked == [ExampleBatch(from: 0, limit: rowsOnScreen)])
      #expect(rows(loaded) == miru.rows(0..<25))
    }
  }

  @Test("coming back to a screen reads nothing it already holds")
  func comingBackKeepsTheList() async {
    let miru = Listing("見る", listed: 60)
    let loaded = LoadedExamples()
    await loaded.load("見る", rowsOnScreen: 8, read: miru.read)
    await loaded.loadMore(read: miru.read)
    await loaded.load("見る", rowsOnScreen: 8, read: miru.read)
    #expect(miru.asked.count == 3)
    #expect(rows(loaded) == miru.rows(0..<50))
  }

  @Test("a first read that fails is read again when the screen comes back")
  func aFailedFirstReadIsReadAgain() async {
    let miru = Listing("見る", listed: 60)
    miru.failing = [0]
    let loaded = LoadedExamples()
    await loaded.load("見る", rowsOnScreen: 8, read: miru.read)
    #expect(loaded.answers("見る"))
    #expect(loaded.examples.isEmpty)
    #expect(loaded.countText == nil)
    #expect(!loaded.hasMore)

    await loaded.load("見る", rowsOnScreen: 8, read: miru.read)
    #expect(rows(loaded) == miru.rows(0..<25))
    #expect(loaded.countText == "60 examples")
  }

  @Test("a later read that fails ends the list until the screen comes back")
  func aFailedLaterReadEndsTheList() async {
    let miru = Listing("見る", listed: 60)
    miru.failing = [8, 25]
    let loaded = LoadedExamples()
    await loaded.load("見る", rowsOnScreen: 8, read: miru.read)
    #expect(rows(loaded) == miru.rows(0..<8))
    #expect(!loaded.hasMore)

    await loaded.load("見る", rowsOnScreen: 8, read: miru.read)
    #expect(rows(loaded) == miru.rows(0..<25))
    await loaded.loadMore(read: miru.read)
    #expect(rows(loaded) == miru.rows(0..<25))
    #expect(!loaded.hasMore)

    await loaded.load("見る", rowsOnScreen: 8, read: miru.read)
    #expect(loaded.hasMore)
    await loaded.loadMore(read: miru.read)
    #expect(rows(loaded) == miru.rows(0..<50))
  }

  @Test("rows are asked for once while their read is under way")
  func aReadUnderWayIsNotRepeated() async {
    let miru = Listing("見る", listed: 60)
    let loaded = LoadedExamples()
    miru.beforeAnswering[8] = { await loaded.loadMore(read: miru.read) }
    await loaded.load("見る", rowsOnScreen: 8, read: miru.read)
    #expect(miru.asked == [ExampleBatch(from: 0, limit: 8), ExampleBatch(from: 8)])
    #expect(rows(loaded) == miru.rows(0..<25))
  }

  @Test("an answer for a list the screen has left is left out, and the new list is read in full")
  func aStaleAnswerIsLeftOut() async {
    let miru = Listing("見る", listed: 60)
    let taberu = Listing("食べる", listed: 30)
    let loaded = LoadedExamples()
    await loaded.load("見る", rowsOnScreen: nil, read: miru.read)
    miru.beforeAnswering[25] = {
      await loaded.load("食べる", rowsOnScreen: 8, read: taberu.read)
    }
    await loaded.loadMore(read: miru.read)
    #expect(loaded.answers("食べる"))
    #expect(!loaded.answers("見る"))
    #expect(rows(loaded) == taberu.rows(0..<25))
    #expect(loaded.countText == "30 examples")
    #expect(loaded.hasMore)
  }

  @Test("a screen's first rows are counted from the shortest an example row can be")
  func rowsOnScreenAreCountedFromTheShortestRow() {
    #expect(JapaneseExampleRowContent.rows(fitting: 874, translated: true) == 13)
    #expect(JapaneseExampleRowContent.rows(fitting: 874, translated: false) == 19)
    #expect(JapaneseExampleRowContent.rows(fitting: 0, translated: true) == nil)
  }
}
