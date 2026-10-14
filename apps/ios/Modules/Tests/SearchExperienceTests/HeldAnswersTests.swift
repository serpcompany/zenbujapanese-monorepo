import Foundation
import Testing

@testable import SearchExperience

@Suite("Held answers")
struct HeldAnswersTests {
  private func at(_ second: TimeInterval) -> Date {
    Date(timeIntervalSince1970: second)
  }

  private func holds(_ count: Int, _ held: HeldAnswers) async -> Bool {
    for _ in 0..<100_000 {
      if await held.held == count { return true }
      await Task.yield()
    }
    return false
  }

  @Test("an answer held before the moment a test names is let go, and one held since stays held")
  func letsGoOnlyOfWhatWasHeldBefore() async throws {
    let held = HeldAnswers()
    let early = Task { try await held.wait(since: at(1)) }
    let late = Task { try await held.wait(since: at(5)) }
    #expect(await holds(2, held))

    #expect(await held.letGo(heldBefore: at(1)) == 0)
    #expect(await held.letGo(heldBefore: at(3)) == 1)
    try await early.value
    #expect(await held.held == 1)

    #expect(await held.letGo(heldBefore: at(9)) == 1)
    try await late.value
  }

  @Test("an answer whose asker gives up ends at once, though nothing ever lets it go")
  func aCancelledAnswerEnds() async {
    let held = HeldAnswers()
    let answer = Task { try await held.wait(since: at(1)) }
    #expect(await holds(1, held))
    answer.cancel()
    await #expect(throws: CancellationError.self) { try await answer.value }
    #expect(await held.held == 0)
    #expect(await held.letGo(heldBefore: at(9)) == 0)
  }

  @Test("an answer asked for by a task that has already given up isn't held at all")
  func anAnswerAskedAfterGivingUpIsNotHeld() async {
    let held = HeldAnswers()
    let answer = Task {
      withUnsafeCurrentTask { $0?.cancel() }
      try await held.wait(since: at(1))
    }
    await #expect(throws: CancellationError.self) { try await answer.value }
    #expect(await held.held == 0)
  }
}
