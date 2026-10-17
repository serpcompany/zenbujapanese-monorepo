import Foundation
import Testing

@testable import SearchExperience

@MainActor
final class StandInSheets {
  var hashedNonces: [String] = []
  var googleURLs: [URL] = []
  var apple: Result<AppleSignInCredential, Error> = .success(
    AppleSignInCredential(
      identityToken: "apple.id-token", authorizationCode: "apple-code",
      name: AppleSignInName(PersonNameComponents(givenName: "Ada", familyName: "Lovelace"))))
  var googleCallback: (_ attempt: URLComponents, _ scheme: String) -> URL = { attempt, scheme in
    let state = attempt.queryItems?.first { $0.name == "state" }?.value ?? ""
    return URL(string: "\(scheme):/oauthredirect?code=google-code&state=\(state)")!
  }

  var providers: SignInProviders {
    SignInProviders(
      appleAuthorization: { [self] hashedNonce in
        hashedNonces.append(hashedNonce)
        return try apple.get()
      },
      webSignIn: { [self] url, scheme in
        googleURLs.append(url)
        guard let attempt = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
          throw GoogleSignInError.unexpectedCallback
        }
        return googleCallback(attempt, scheme)
      })
  }
}

@MainActor
@Suite("Sign in with Apple and Google, with only their sheets stood in", .serialized)
struct AccountProviderSignInTests {
  static let googleClientID = "1234-abcd.apps.googleusercontent.com"

  @Test("Apple gets the service's nonce hashed, and the account gets Apple's token, the nonce, and the name")
  func apple() async throws {
    let (fixture, sheets) = await signedOutFixture()

    try await fixture.account.signInWithApple()
    await settled(fixture)

    #expect(sheets.hashedNonces == [Data(AccountFixture.nonce.utf8).sha256])
    let signIn = try #require(fixture.server.requests(to: "POST /v1/auth/sign-in/social").first)
    #expect(signIn.json["provider"] as? String == "apple")
    let idToken = try #require(signIn.json["idToken"] as? [String: Any])
    #expect(idToken["token"] as? String == "apple.id-token")
    #expect(idToken["nonce"] as? String == AccountFixture.nonce)
    let name = (idToken["user"] as? [String: Any])?["name"] as? [String: Any]
    #expect(name?["firstName"] as? String == "Ada")
    #expect(fixture.storage.read() == AccountFixture.sessionToken)
    #expect(fixture.sync.account?.userID == AccountFixture.userID)
  }

  @Test("closing Apple's sheet leaves the learner signed out, and asks the account nothing more")
  func appleCanceled() async throws {
    let (fixture, sheets) = await signedOutFixture()
    sheets.apple = .failure(CancellationError())

    await #expect(throws: CancellationError.self) { try await fixture.account.signInWithApple() }

    #expect(fixture.server.requests(to: "POST /v1/auth/sign-in/social").isEmpty)
    #expect(fixture.storage.read() == nil)
    #expect(fixture.sync.account == nil)
  }

  @Test("a token the account refuses keeps the learner signed out")
  func appleRefused() async throws {
    let (fixture, _) = await signedOutFixture()
    fixture.server.respond { request in
      request.route == "POST /v1/auth/sign-in/nonce"
        ? .json(200, ["nonce": AccountFixture.nonce]) : .error(401, "invalid_token")
    }

    await #expect(throws: AccountServiceError.self) { try await fixture.account.signInWithApple() }

    #expect(fixture.storage.read() == nil)
    #expect(fixture.sync.account == nil)
  }

  @Test("Google's code is exchanged with PKCE at Google, and its ID token goes to the account with the nonce")
  func google() async throws {
    let google = StubAccountServer(host: "oauth2.googleapis.com")
    google.respond { _ in .json(200, ["id_token": "google.id-token"]) }
    let (fixture, sheets) = await signedOutFixture()

    try await fixture.account.signInWithGoogle()
    await settled(fixture)

    let attempt = try #require(
      sheets.googleURLs.first.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) })
    let asked = { (name: String) in attempt.queryItems?.first { $0.name == name }?.value }
    #expect(asked("nonce") == AccountFixture.nonce)
    let exchange = try #require(google.requests(to: "POST /token").first)
    let form = Dictionary(
      uniqueKeysWithValues: String(decoding: exchange.body, as: UTF8.self)
        .split(separator: "&").compactMap { pair -> (String, String)? in
          let parts = pair.split(separator: "=", maxSplits: 1).map(String.init)
          guard parts.count == 2 else { return nil }
          return (parts[0], parts[1].removingPercentEncoding ?? parts[1])
        })
    #expect(form["code"] == "google-code")
    #expect(form["client_id"] == Self.googleClientID)
    #expect(form["code_verifier"].map(GoogleSignIn.challenge(for:)) == asked("code_challenge"))
    let signIn = try #require(fixture.server.requests(to: "POST /v1/auth/sign-in/social").first)
    #expect(signIn.json["provider"] as? String == "google")
    let idToken = try #require(signIn.json["idToken"] as? [String: Any])
    #expect(idToken["token"] as? String == "google.id-token")
    #expect(idToken["nonce"] as? String == AccountFixture.nonce)
    #expect(fixture.storage.read() == AccountFixture.sessionToken)
  }

  @Test("a Google callback for another attempt, or one the learner declined, signs nothing in")
  func googleRefusedOrDeclined() async throws {
    let google = StubAccountServer(host: "oauth2.googleapis.com")
    let (fixture, sheets) = await signedOutFixture()
    sheets.googleCallback = { _, scheme in
      URL(string: "\(scheme):/oauthredirect?code=google-code&state=another-attempt")!
    }
    await #expect(throws: GoogleSignInError.self) { try await fixture.account.signInWithGoogle() }
    sheets.googleCallback = { _, scheme in
      URL(string: "\(scheme):/oauthredirect?error=access_denied")!
    }
    await #expect(throws: CancellationError.self) { try await fixture.account.signInWithGoogle() }

    #expect(google.requests.isEmpty)
    #expect(fixture.server.requests(to: "POST /v1/auth/sign-in/social").isEmpty)
    #expect(fixture.storage.read() == nil)
  }

  private func settled(_ fixture: AccountFixture) async {
    await fixture.account.scheduler.settled()
    await fixture.settle()
  }

  private func signedOutFixture() async -> (AccountFixture, StandInSheets) {
    let sheets = StandInSheets()
    let fixture = AccountFixture()
    fixture.providers = sheets.providers
    fixture.googleClientID = Self.googleClientID
    fixture.serve()
    await fixture.launch()
    return (fixture, sheets)
  }
}
