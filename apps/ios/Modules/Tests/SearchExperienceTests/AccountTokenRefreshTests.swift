import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Access token refreshes shared between requests", .timeLimit(.minutes(1)))
struct AccountTokenRefreshTests {
  private static let fresh = StubReply.json(
    200, ["token": StubTokens.access(expiresAt: Date().addingTimeInterval(15 * 60))])

  private static func heldRefresh() -> (StubAccountServer, LaterReply, AccountTokens) {
    let server = StubAccountServer()
    let later = LaterReply()
    server.respond { request in
      request.route == "GET /v1/auth/token" ? .later(later) : .error(404, "not_found")
    }
    let tokens = AccountTokens(
      api: AccountAPI(baseURL: server.baseURL, session: server.session),
      storage: MemorySessionTokenStorage("first.signed"))
    return (server, later, tokens)
  }

  @Test("two requests at once with no access token make one refresh")
  func twoRequestsShareOneRefresh() async throws {
    let (server, later, tokens) = Self.heldRefresh()
    let one = Task { try await tokens.withAccessToken { $0 } }
    let two = Task { try await tokens.withAccessToken { $0 } }
    await later.asked()
    later.send(Self.fresh)
    let first = try await one.value
    let second = try await two.value
    #expect(first == second)
    #expect(server.requests(to: "GET /v1/auth/token").count == 1)
  }

  @Test("a refresh joined across a sign-out ends the session for every request waiting on it")
  func joinedRefreshAcrossASignOut() async throws {
    let (_, later, tokens) = Self.heldRefresh()
    let one = Task { try await tokens.withAccessToken { $0 } }
    let two = Task { try await tokens.withAccessToken { $0 } }
    await later.asked()
    tokens.forgetSession()
    later.send(Self.fresh)
    await #expect(throws: AccountServiceError.sessionEnded) { try await one.value }
    await #expect(throws: AccountServiceError.sessionEnded) { try await two.value }
  }

  @Test("a request cancelled while it waits for the shared refresh stops waiting")
  func cancelledWaiterStops() async throws {
    let (_, later, tokens) = Self.heldRefresh()
    let waiting = Task { try await tokens.withAccessToken { $0 } }
    let other = Task { try await tokens.withAccessToken { $0 } }
    await later.asked()
    waiting.cancel()
    await #expect(throws: CancellationError.self) { try await waiting.value }
    later.send(Self.fresh)
    #expect(try await other.value.isEmpty == false)
  }

  @Test("a refresh outlives the request that started it, so the next request joins it")
  func refreshOutlivesItsStarter() async throws {
    let (server, later, tokens) = Self.heldRefresh()
    let starter = Task { try await tokens.withAccessToken { $0 } }
    await later.asked()
    starter.cancel()
    _ = try? await starter.value
    let next = Task { try await tokens.withAccessToken { $0 } }
    await Task.yield()
    later.send(Self.fresh)
    #expect(try await next.value.isEmpty == false)
    #expect(server.requests(to: "GET /v1/auth/token").count == 1)
  }

  @Test("two requests the service refuses with 401 share one refresh")
  func refusedRequestsShareOneRefresh() async throws {
    let server = StubAccountServer()
    let later = LaterReply()
    let tokensAsked = CallCount()
    let stale = StubTokens.access(expiresAt: Date().addingTimeInterval(15 * 60), subject: "stale")
    server.respond { request in
      guard request.route == "GET /v1/auth/token" else { return .error(404, "not_found") }
      return tokensAsked.next() == 1 ? .json(200, ["token": stale]) : .later(later)
    }
    let tokens = AccountTokens(
      api: AccountAPI(baseURL: server.baseURL, session: server.session),
      storage: MemorySessionTokenStorage("first.signed"))
    #expect(try await tokens.withAccessToken { $0 } == stale)
    let refusesStale: @Sendable (String) async throws -> String = { token in
      guard token != stale else {
        throw AccountServiceError.refused(
          status: 401, code: "unauthorized", message: "", retryAfter: nil)
      }
      return token
    }
    let one = Task { try await tokens.withAccessToken(refusesStale) }
    let two = Task { try await tokens.withAccessToken(refusesStale) }
    await later.asked()
    later.send(Self.fresh)
    #expect(try await one.value == two.value)
    #expect(server.requests(to: "GET /v1/auth/token").count == 2)
  }
}
