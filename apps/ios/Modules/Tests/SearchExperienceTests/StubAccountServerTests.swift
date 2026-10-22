import Foundation
import Testing

@testable import SearchExperience

@Suite("The stand-in account server", .timeLimit(.minutes(1)))
struct StubAccountServerTests {
  private static func status(of answer: (Data, URLResponse)) -> Int? {
    (answer.1 as? HTTPURLResponse)?.statusCode
  }

  @Test("a reply held for later holds only its own request, so another server's is answered meanwhile")
  func heldReplyHoldsOnlyItsOwnRequest() async throws {
    let holding = StubAccountServer()
    let held = LaterReply()
    holding.respond { _ in .later(held) }
    let other = StubAccountServer()
    other.respond { _ in .json(200, ["answered": true]) }
    let waiting = Task {
      try await holding.session.data(from: holding.baseURL.appending(path: "held"))
    }
    await held.asked()

    let answered = try await other.session.data(from: other.baseURL.appending(path: "other"))
    #expect(Self.status(of: answered) == 200)

    held.send(.json(200, ["answered": true]))
    #expect(Self.status(of: try await waiting.value) == 200)
  }
}
