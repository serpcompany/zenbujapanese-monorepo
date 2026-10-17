import Foundation
import Testing

@testable import SearchExperience

@Suite("Held answers", .timeLimit(.minutes(1)))
struct HeldAnswersTests {
  private actor Asked {
    private(set) var ended = false
    private(set) var gaveUp = false

    func end(gaveUp: Bool) {
      ended = true
      self.gaveUp = gaveUp
    }
  }

  private func at(_ second: TimeInterval) -> Date {
    Date(timeIntervalSince1970: second)
  }

  private func eventually(_ condition: () async -> Bool) async -> Bool {
    for _ in 0..<100_000 {
      if await condition() { return true }
      await Task.yield()
    }
    return false
  }

  private func ask(
    _ held: HeldAnswers, since second: TimeInterval, givenUpFirst: Bool = false
  ) -> (Task<Void, Never>, Asked) {
    let asked = Asked()
    let since = at(second)
    let asking = Task {
      if givenUpFirst { withUnsafeCurrentTask { $0?.cancel() } }
      do {
        try await held.wait(since: since)
        await asked.end(gaveUp: false)
      } catch {
        await asked.end(gaveUp: error is CancellationError)
      }
    }
    return (asking, asked)
  }

  @Test("an answer held before the moment a test names is let go, and one held since stays held")
  func letsGoOnlyOfWhatWasHeldBefore() async {
    let held = HeldAnswers()
    let (_, early) = ask(held, since: 1)
    let (_, late) = ask(held, since: 5)
    #expect(await eventually { await held.held == 2 })

    #expect(await held.letGo(heldBefore: at(1)) == 0)
    #expect(await held.letGo(heldBefore: at(3)) == 1)
    #expect(await eventually { await early.ended })
    let lateEnded = await late.ended
    #expect(!lateEnded)
    #expect(await held.held == 1)

    #expect(await held.letGo(heldBefore: at(9)) == 1)
    #expect(await eventually { await late.ended })
    let earlyGaveUp = await early.gaveUp
    let lateGaveUp = await late.gaveUp
    #expect(!earlyGaveUp && !lateGaveUp)
  }

  @Test("an answer whose asker gives up ends at once, though nothing ever lets it go")
  func aCancelledAnswerEnds() async {
    let held = HeldAnswers()
    let (asking, asked) = ask(held, since: 1)
    #expect(await eventually { await held.held == 1 })
    asking.cancel()
    #expect(await eventually { await asked.ended })
    #expect(await asked.gaveUp)
    #expect(await held.held == 0)
    #expect(await held.letGo(heldBefore: at(9)) == 0)
  }

  @Test("an answer asked for by a task that has already given up ends, and isn't left held")
  func anAnswerAskedAfterGivingUpEnds() async {
    let held = HeldAnswers()
    let (_, asked) = ask(held, since: 1, givenUpFirst: true)
    #expect(await eventually { await asked.ended })
    #expect(await asked.gaveUp)
    #expect(await held.held == 0)
  }
}
