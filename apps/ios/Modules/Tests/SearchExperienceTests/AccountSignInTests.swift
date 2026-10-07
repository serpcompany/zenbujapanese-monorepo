import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account sign-in and tokens")
struct AccountSignInTests {
  @Test("an emailed code signs in, keeping the signed session token, and names the app")
  func emailCodeSignIn() async throws {
    let fixture = AccountFixture()
    fixture.serve()
    await fixture.launch()

    try await fixture.account.sendEmailCode(to: "  \(AccountFixture.email) ")
    try await fixture.signIn()

    let code = try #require(
      fixture.server.requests(to: "POST /v1/auth/email-otp/send-verification-otp").first)
    #expect(code.json["email"] as? String == AccountFixture.email)
    #expect(code.json["type"] as? String == "sign-in")
    let signIn = try #require(fixture.server.requests(to: "POST /v1/auth/sign-in/email-otp").first)
    #expect(signIn.json["otp"] as? String == "123456")
    #expect(fixture.storage.read() == AccountFixture.sessionToken)
    #expect(
      fixture.sync.account
        == SignedInAccount(userID: AccountFixture.userID, email: AccountFixture.email))
    #expect(fixture.server.requests.allSatisfy { $0.header("X-Zenbu-Client") == "zenbu-ios" })
    #expect(fixture.server.requests.allSatisfy { $0.header("Cookie") == nil })
  }

  @Test("the session token goes only to sign-in routes, and the access token to sync")
  func tokensGoWhereTheyBelong() async throws {
    let fixture = AccountFixture()
    fixture.serve()
    await fixture.launch()
    try await fixture.signIn()

    let token = try #require(fixture.server.requests(to: "GET /v1/auth/token").first)
    #expect(token.header("Authorization") == "Bearer \(AccountFixture.sessionToken)")
    let sync = try #require(fixture.server.requests(to: "POST /v1/sync").first)
    let bearer = try #require(sync.header("Authorization"))
    #expect(bearer.hasPrefix("Bearer ") && !bearer.contains(AccountFixture.sessionToken))
  }

  @Test("an access token is reused until it nears expiry, then refreshed")
  func accessTokenRefresh() async throws {
    let fixture = AccountFixture()
    fixture.serve(tokenLifetime: 15 * 60)
    await fixture.launch()
    try await fixture.signIn()
    try await fixture.syncNow()
    #expect(fixture.server.requests(to: "GET /v1/auth/token").count == 1)

    fixture.now += 14 * 60 + 30
    try await fixture.syncNow()
    #expect(fixture.server.requests(to: "GET /v1/auth/token").count == 2)
  }

  @Test("a 401 from sync gets a new access token and sends the same changes once more")
  func unauthorizedSyncRefreshes() async throws {
    let fixture = AccountFixture()
    let calls = CallCount()
    fixture.serve { request in
      calls.next() == 1
        ? .error(401, "unauthorized")
        : StubSync.answer(results: StubSync.applied(request), cursor: "cursor-1")
    }
    await fixture.launch()
    try await fixture.signIn()

    let syncs = fixture.server.requests(to: "POST /v1/sync")
    #expect(syncs.count == 2)
    #expect(syncs[0].sync.mutations == syncs[1].sync.mutations)
    #expect(fixture.server.requests(to: "GET /v1/auth/token").count == 2)
    #expect(fixture.sync.state.queue.isEmpty)
  }

  @Test("when the service ends the session, the app signs out and keeps its data")
  func endedSession() async throws {
    let fixture = AccountFixture()
    fixture.serve()
    await fixture.launch()
    try await fixture.signIn()
    fixture.markKnown(AccountFixture.taberu)
    fixture.server.respond { request in
      request.route == "GET /v1/auth/token" ? .error(401, "unauthorized") : .error(500, "internal")
    }
    fixture.now += 20 * 60

    await #expect(throws: AccountServiceError.sessionEnded) { try await fixture.syncNow() }

    #expect(fixture.sync.account == nil)
    #expect(fixture.sync.sessionEndedOnItsOwn)
    #expect(fixture.storage.read() == nil)
    #expect(fixture.wordKnowledge.isKnown(storedID: AccountFixture.taberu))
  }

  @Test("a refused sign-in keeps the app signed out and says why")
  func refusedSignIn() async throws {
    let fixture = AccountFixture()
    fixture.server.respond { _ in .error(400, "invalid_otp") }
    await fixture.launch()

    await #expect(
      throws: AccountServiceError.refused(
        status: 400, code: "invalid_otp", message: "invalid_otp", retryAfter: nil)
    ) { try await fixture.signIn() }
    #expect(fixture.sync.account == nil)
    #expect(fixture.storage.read() == nil)
  }

  @Test("a session token left in the Keychain after a reinstall is forgotten")
  func reinstallForgetsSession() async {
    let fixture = AccountFixture(sessionToken: "left-over")
    fixture.serve()
    await fixture.launch()
    #expect(fixture.storage.read() == nil)
    #expect(fixture.sync.account == nil)
  }

  @Test("Retry-After is read as seconds or as an HTTP date")
  func retryAfter() {
    let now = Date(timeIntervalSince1970: 1_767_225_600)
    #expect(AccountAPI.retryAfter("7", now: now) == 7)
    #expect(AccountAPI.retryAfter("Thu, 01 Jan 2026 00:00:30 GMT", now: now) == 30)
    #expect(AccountAPI.retryAfter(nil, now: now) == nil)
    #expect(AccountAPI.retryAfter("soon", now: now) == nil)
  }

  @Test("the service URL comes from a launch argument, the environment, or the build")
  func serviceURL() throws {
    let defaults = try #require(UserDefaults(suiteName: "account-tests-\(UUID().uuidString)"))
    #expect(
      AccountServiceConfiguration.resolve(
        bundle: .main, defaults: defaults,
        environment: ["ZENBU_ACCOUNT_API_URL": "http://localhost:8789"])?.serviceURL
        == URL(string: "http://localhost:8789"))
    defaults.set("https://example.test", forKey: AccountServiceConfiguration.serviceURLKey)
    #expect(
      AccountServiceConfiguration.resolve(
        bundle: .main, defaults: defaults,
        environment: ["ZENBU_ACCOUNT_API_URL": "http://localhost:8789"])?.serviceURL
        == URL(string: "https://example.test"))
    #expect(
      AccountServiceConfiguration.resolve(bundle: .main, defaults: defaults, environment: [:])?
        .googleClientID == nil)
  }

  @Test("Google's request carries PKCE, the nonce, and the reversed client ID")
  func googleRequest() throws {
    let google = GoogleSignIn(
      clientID: "1234-abcd.apps.googleusercontent.com", session: AccountAPI.urlSession())
    let attempt = google.attempt(nonce: "nonce-1")
    let items = try #require(
      URLComponents(url: attempt.url, resolvingAgainstBaseURL: false)?.queryItems)
    let value = { (name: String) in items.first { $0.name == name }?.value }
    #expect(google.redirectScheme == "com.googleusercontent.apps.1234-abcd")
    #expect(value("redirect_uri") == "com.googleusercontent.apps.1234-abcd:/oauthredirect")
    #expect(value("nonce") == "nonce-1")
    #expect(value("code_challenge_method") == "S256")
    #expect(value("code_challenge") == GoogleSignIn.challenge(for: attempt.verifier))
    #expect(value("state") == attempt.state)
  }

  @Test("Apple gets the nonce's SHA-256")
  func appleNonce() {
    #expect(
      SignInNonce.sha256("abc")
        == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  }
}
