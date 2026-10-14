import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("A screen's loaded examples", .timeLimit(.minutes(1)))
struct LoadedExamplesTests {
  @MainActor
  private final class Listing {
    static let pageSize = 25

    let word: String
    let listed: Int
    var asked: [ExampleBatch] = []
    var failing: Set<Int> = []
    var beforeAnswering: [Int: () async -> Void] = [:]
    private var held: [Int: [(id: UUID, waiting: CheckedContinuation<Void, Never>)]] = [:]
    private var holding: Set<Int> = []

    init(_ word: String, listed: Int) {
      self.word = word
      self.listed = listed
    }

    func read(_ batch: ExampleBatch) async -> ExamplePage? {
      asked.append(batch)
      await beforeAnswering.removeValue(forKey: batch.from)?()
      if holding.contains(batch.from) {
        let id = UUID()
        await withTaskCancellationHandler {
          await withCheckedContinuation { waiting in
            if Task.isCancelled {
              waiting.resume()
            } else {
              held[batch.from, default: []].append((id, waiting))
            }
          }
        } onCancel: {
          Task { @MainActor in self.giveUp(id, from: batch.from) }
        }
      }
      if Task.isCancelled || failing.remove(batch.from) != nil { return nil }
      let pageEnd = min(listed, (batch.from / Self.pageSize + 1) * Self.pageSize)
      let end = min(pageEnd, batch.limit.map { batch.from + $0 } ?? .max)
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
        countText: "\(listed) examples",
        cutShort: end < pageEnd)
    }

    func hold(_ from: Int) {
      holding.insert(from)
    }

    func untilHeld(_ from: Int, reads: Int = 1) async {
      while (held[from]?.count ?? 0) < reads { await Task.yield() }
    }

    func answer(_ from: Int) {
      holding.remove(from)
      for read in held.removeValue(forKey: from) ?? [] { read.waiting.resume() }
    }

    func answer(_ from: Int, read number: Int) {
      held[from]?.remove(at: number).waiting.resume()
    }


    private func giveUp(_ id: UUID, from: Int) {
      guard let index = held[from]?.firstIndex(where: { $0.id == id }) else { return }
      held[from]?.remove(at: index).waiting.resume()
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

  @Test("a screen that fits its page or its whole list, or of unknown size, is answered in one read")
  func aWholePageIsOneRead() async {
    let screens: [(listed: Int, rowsOnScreen: Int?, shown: Int)] = [
      (60, nil, 25), (60, 30, 25), (60, 25, 25), (8, 8, 8), (5, 8, 5),
    ]
    for (listed, rowsOnScreen, shown) in screens {
      let miru = Listing("見る", listed: listed)
      let loaded = LoadedExamples()
      await loaded.load("見る", rowsOnScreen: rowsOnScreen, read: miru.read)
      #expect(miru.asked == [ExampleBatch(from: 0, limit: rowsOnScreen)])
      #expect(rows(loaded) == miru.rows(0..<shown))
      #expect(loaded.hasMore == (shown < listed))
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

  @Test("a first read that fails says so, not that there are no examples, and reading again lists them")
  func aFailedFirstReadIsNotAnEmptyList() async {
    let miru = Listing("見る", listed: 60)
    miru.failing = [0]
    let loaded = LoadedExamples()
    #expect(loaded.state(of: "見る") == .loading)
    await loaded.load("見る", rowsOnScreen: 8, read: miru.read)
    #expect(loaded.state(of: "見る") == .failed)

    miru.hold(0)
    let readingAgain = Task { await loaded.load("見る", rowsOnScreen: 8, read: miru.read) }
    await miru.untilHeld(0)
    #expect(loaded.state(of: "見る") == .loading)
    miru.answer(0)
    await readingAgain.value
    #expect(loaded.state(of: "見る") == .listed)
    #expect(rows(loaded) == miru.rows(0..<25))
  }

  @Test("a list read with no sentences in it is empty, not failed")
  func anEmptyListIsEmpty() async {
    let none = Listing("無", listed: 0)
    let loaded = LoadedExamples()
    await loaded.load("無", rowsOnScreen: 8, read: none.read)
    #expect(loaded.state(of: "無") == .empty)
    #expect(none.asked == [ExampleBatch(from: 0, limit: 8)])
  }

  @Test("a word the core has nothing to match sentences on has none, and a read that fails has failed")
  func aWordWithNothingToMatchHasNoExamples() async {
    let answers: [(any Error, LoadedExamples.State)] = [
      (ExampleSentenceRetrievalError.invalidQuery(.missingEntryEvidence), .empty),
      (ExampleSentenceRetrievalError.retrievalUnavailable(.queryFailed), .failed),
    ]
    for (error, state) in answers {
      var client = ExampleSentenceClient.live
      client.entryExamples = { _, _ in throw error }
      let entry = DictionaryEntry.fixture(id: "a1", headword: "ＮＧ", reading: "エヌジー")
      let loaded = LoadedExamples()
      await loaded.load("a1", rowsOnScreen: 8) { [client] in
        await client.shownExamples(entry, $0)
      }
      #expect(loaded.state(of: "a1") == state)
    }
  }

  @Test("a Retry tapped twice shows what the second read answers, whichever read answers first")
  func aRetryTappedTwiceShowsTheSecondRead() async {
    for secondAnswersFirst in [true, false] {
      let miru = Listing("見る", listed: 60)
      miru.failing = [0]
      let loaded = LoadedExamples()
      await loaded.load("見る", rowsOnScreen: nil, read: miru.read)
      miru.hold(0)
      let first = Task { await loaded.load("見る", rowsOnScreen: nil, read: miru.read) }
      await miru.untilHeld(0, reads: 1)
      let second = Task { await loaded.load("見る", rowsOnScreen: nil, read: miru.read) }
      await miru.untilHeld(0, reads: 2)
      if secondAnswersFirst {
        miru.answer(0, read: 1)
        await second.value
        #expect(loaded.state(of: "見る") == .listed)
        miru.failing = [0]
        miru.answer(0, read: 0)
        await first.value
      } else {
        miru.failing = [0]
        miru.answer(0, read: 0)
        await first.value
        #expect(loaded.state(of: "見る") == .loading)
        miru.answer(0, read: 0)
        await second.value
      }
      #expect(loaded.state(of: "見る") == .listed)
      #expect(rows(loaded) == miru.rows(0..<25))
    }
  }

  @Test("a Retry of one list that answers after another list was read is left out")
  func aRetryAnsweredAfterAnotherListIsLeftOut() async {
    let miru = Listing("見る", listed: 60)
    let taberu = Listing("食べる", listed: 30)
    miru.failing = [0]
    let loaded = LoadedExamples()
    await loaded.load("見る", rowsOnScreen: nil, read: miru.read)
    miru.hold(0)
    let retry = Task { await loaded.load("見る", rowsOnScreen: nil, read: miru.read) }
    await miru.untilHeld(0)
    await loaded.load("食べる", rowsOnScreen: nil, read: taberu.read)
    #expect(loaded.state(of: "食べる") == .listed)
    miru.answer(0)
    await retry.value
    #expect(loaded.state(of: "食べる") == .listed)
    #expect(rows(loaded) == taberu.rows(0..<25))
  }

  @Test("a later page that fails says so at the list's end, and is read again when asked")
  func aFailedLaterPageIsReadAgainWhenAsked() async {
    let miru = Listing("見る", listed: 60)
    miru.failing = [25]
    let loaded = LoadedExamples()
    await loaded.load("見る", rowsOnScreen: 8, read: miru.read)
    await loaded.loadMore(read: miru.read)
    #expect(loaded.laterReadFailed)
    #expect(!loaded.hasMore)
    #expect(loaded.state(of: "見る") == .listed)

    await loaded.readMoreAgain(read: miru.read)
    #expect(!loaded.laterReadFailed)
    #expect(rows(loaded) == miru.rows(0..<50))
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

  private func theRestIsReadOnce(
    leavingTheScreen: Bool,
    whileItIsRead asking: (@MainActor (LoadedExamples, Listing) async -> Void)? = nil
  ) async {
    let miru = Listing("見る", listed: 60)
    let loaded = LoadedExamples()
    miru.hold(8)
    let screen = Task { await loaded.load("見る", rowsOnScreen: 8, read: miru.read) }
    await miru.untilHeld(8)
    if leavingTheScreen { screen.cancel() }
    let answering = Task { miru.answer(8) }
    if let asking {
      await asking(loaded, miru)
      #expect(rows(loaded) == miru.rows(0..<25))
    }
    await answering.value
    await screen.value
    #expect(miru.asked == [ExampleBatch(from: 0, limit: 8), ExampleBatch(from: 8)])
    #expect(rows(loaded) == miru.rows(0..<25))
  }

  @Test("the end of the list and the screen share one read of the rows after it")
  func aReadUnderWayIsShared() async {
    await theRestIsReadOnce(leavingTheScreen: false) { loaded, miru in
      await loaded.loadMore(read: miru.read)
    }
  }

  @Test("rows being read when the screen is left are kept")
  func aReadIsKeptWhenTheScreenIsLeft() async {
    await theRestIsReadOnce(leavingTheScreen: true)
  }

  @Test("a screen left and come back to while its rows are read waits on that read")
  func aScreenBackWhileItsRowsAreReadWaitsOnThatRead() async {
    await theRestIsReadOnce(leavingTheScreen: true) { loaded, miru in
      await loaded.load("見る", rowsOnScreen: 8, read: miru.read)
    }
  }

  @Test("a first read that answers after the screen is left is left out, and read when it is back")
  func aFirstReadIsLeftOutWhenTheScreenIsLeft() async {
    let miru = Listing("見る", listed: 60)
    let loaded = LoadedExamples()
    miru.hold(0)
    let leaving = Task { await loaded.load("見る", rowsOnScreen: nil, read: miru.read) }
    await miru.untilHeld(0)
    leaving.cancel()
    miru.answer(0)
    await leaving.value
    #expect(!loaded.answers("見る"))
    #expect(loaded.examples.isEmpty)

    await loaded.load("見る", rowsOnScreen: nil, read: miru.read)
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
