import Foundation
import Observation
import TranslatorCore

@MainActor
@Observable
final class ZenbuAccount {
  static let shared: ZenbuAccount? = AccountServiceConfiguration.resolve().map {
    ZenbuAccount(
      configuration: $0, session: AccountAPI.urlSession(),
      storage: KeychainSessionTokenStorage(), wordKnowledge: .shared, wordLists: .shared,
      watchHistory: .shared, translations: .shared)
  }

  let configuration: AccountServiceConfiguration
  let sync: AccountSync
  @ObservationIgnored let scheduler: AccountSyncScheduler
  @ObservationIgnored private let api: AccountAPI
  @ObservationIgnored private let session: URLSession

  init(
    configuration: AccountServiceConfiguration,
    session: URLSession,
    storage: any SessionTokenStorage,
    wordKnowledge: WordKnowledge,
    wordLists: WordLists,
    watchHistory: WatchHistory,
    translations: ConversationHistory,
    fileURL: URL = AccountSync.defaultFileURL,
    now: @escaping @MainActor () -> Date = Date.init
  ) {
    let api = AccountAPI(baseURL: configuration.serviceURL, session: session)
    self.configuration = configuration
    self.api = api
    self.session = session
    sync = AccountSync(
      api: api, tokens: AccountTokens(api: api, storage: storage, now: now),
      wordKnowledge: wordKnowledge, wordLists: wordLists, watchHistory: watchHistory,
      translations: translations, fileURL: fileURL, now: now)
    scheduler = AccountSyncScheduler(sync: sync, now: now)
  }

  var account: SignedInAccount? { sync.account }
  var offersGoogle: Bool { configuration.googleClientID != nil }
  var offersApple: Bool { configuration.offersApple }

  func sendEmailCode(to email: String) async throws {
    try await api.sendEmailCode(to: Self.normalized(email))
  }

  func signIn(email: String, code: String) async throws {
    await start(try await emailSignIn(email: email, code: code))
  }

  func signInWithApple() async throws {
    await start(try await appleSignIn().signIn)
  }

  func signInWithGoogle() async throws {
    await start(try await googleSignIn())
  }

  func signOut() async {
    if let token = sync.tokens.sessionToken {
      try? await api.signOut(sessionToken: token)
    }
    scheduler.stop()
    sync.endSession()
  }

  func signInMethods() async throws -> Set<String> {
    guard let token = sync.tokens.sessionToken else { throw AccountServiceError.sessionEnded }
    do {
      return try await api.signInProviders(sessionToken: token)
    } catch AccountServiceError.refused(status: 401, _, _, _) {
      sync.endSession(onItsOwn: true)
      throw AccountServiceError.sessionEnded
    }
  }

  func confirmIdentityWithApple() async throws -> String {
    let (signIn, authorizationCode) = try await appleSignIn()
    try await reauthenticate(signIn)
    return authorizationCode
  }

  func confirmIdentityWithGoogle() async throws {
    try await reauthenticate(try await googleSignIn())
  }

  func confirmIdentity(email: String, code: String) async throws {
    try await reauthenticate(try await emailSignIn(email: email, code: code))
  }

  func deleteAccount(appleAuthorizationCode: String?) async throws {
    do {
      try await sync.tokens.withAccessToken { [api] token in
        try await api.deleteAccount(
          accessToken: token, appleAuthorizationCode: appleAuthorizationCode)
      }
    } catch AccountServiceError.unreachable {
      guard try await accountIsGone() else { throw AccountServiceError.unreachable }
    } catch AccountServiceError.sessionEnded {
      sync.endSession(onItsOwn: true)
      throw AccountServiceError.sessionEnded
    }
    scheduler.stop()
    sync.forgetAccount()
  }

  private func accountIsGone() async throws -> Bool {
    guard let token = sync.tokens.sessionToken else { return true }
    do {
      _ = try await api.accessToken(sessionToken: token)
      return false
    } catch AccountServiceError.refused(status: 401, _, _, _) {
      return true
    }
  }

  private func start(_ signIn: AccountSignIn) async {
    await sync.begin(signIn)
    scheduler.stop()
    scheduler.syncNow()
  }

  private func reauthenticate(_ signIn: AccountSignIn) async throws {
    let earlier = sync.tokens.sessionToken
    do {
      try sync.confirm(signIn)
    } catch {
      try? await api.signOut(sessionToken: signIn.sessionToken)
      throw error
    }
    if let earlier, earlier != signIn.sessionToken {
      try? await api.signOut(sessionToken: earlier)
    }
  }

  private func emailSignIn(email: String, code: String) async throws -> AccountSignIn {
    try await api.signIn(
      email: Self.normalized(email), code: code.trimmingCharacters(in: .whitespacesAndNewlines))
  }

  private func appleSignIn() async throws -> (signIn: AccountSignIn, authorizationCode: String) {
    let nonce = try await api.signInNonce()
    let credential = try await AppleSignIn.credential(nonce: nonce)
    let signIn = try await api.signIn(
      provider: .apple, idToken: credential.identityToken, nonce: nonce, name: credential.name)
    return (signIn, credential.authorizationCode)
  }

  private func googleSignIn() async throws -> AccountSignIn {
    guard let clientID = configuration.googleClientID else {
      throw GoogleSignInError.refused("not_configured")
    }
    let google = GoogleSignIn(clientID: clientID, session: session)
    let nonce = try await api.signInNonce()
    let attempt = google.attempt(nonce: nonce)
    let callback = try await WebSignInPresenter().callback(
      for: attempt.url, scheme: google.redirectScheme)
    let idToken = try await google.idToken(from: callback, for: attempt)
    return try await api.signIn(provider: .google, idToken: idToken, nonce: nonce)
  }

  private static func normalized(_ email: String) -> String {
    email.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
