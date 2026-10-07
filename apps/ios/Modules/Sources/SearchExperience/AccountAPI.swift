import Foundation

enum AccountServiceError: Error, Equatable, Sendable {
  case unreachable
  case refused(status: Int, code: String, message: String, retryAfter: TimeInterval?)
  case unreadableAnswer(status: Int)
  case missingSessionToken
  case sessionEnded
  case differentAccount

  var code: String? {
    if case .refused(_, let code, _, _) = self { return code }
    return nil
  }

  var status: Int? {
    switch self {
    case .refused(let status, _, _, _), .unreadableAnswer(let status): status
    default: nil
    }
  }
}

enum AccountSignInProvider: String, Sendable {
  case apple
  case google
}

struct AccountSignIn: Sendable, Equatable {
  let sessionToken: String
  let userID: String
  let email: String
}

struct AccountAPI: Sendable {
  let baseURL: URL
  let session: URLSession

  static func urlSession(
    _ configuration: URLSessionConfiguration = .ephemeral
  ) -> URLSession {
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.httpCookieAcceptPolicy = .never
    configuration.urlCache = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.timeoutIntervalForRequest = 30
    return URLSession(configuration: configuration)
  }

  private struct Empty: Codable {}

  private struct Nonce: Decodable {
    let nonce: String
  }

  private struct SignInAnswer: Decodable {
    struct User: Decodable {
      let id: String
      let email: String
    }
    let user: User
  }

  private struct SocialSignIn: Encodable {
    struct IDToken: Encodable {
      let token: String
      let nonce: String
    }
    let provider: String
    let idToken: IDToken
  }

  private struct EmailCode: Encodable {
    let email: String
    let type = "sign-in"
  }

  private struct EmailSignIn: Encodable {
    let email: String
    let otp: String
  }

  private struct AccessToken: Decodable {
    let token: String
  }

  private struct Identity: Decodable {
    let providerId: String
  }

  private struct Deletion: Encodable {
    let confirm = true
    let appleAuthorizationCode: String?
  }

  func signInNonce() async throws -> String {
    try await decoded(Nonce.self, from: send("POST", "v1/auth/sign-in/nonce", body: json(Empty())))
      .nonce
  }

  func signIn(
    provider: AccountSignInProvider, idToken: String, nonce: String
  ) async throws -> AccountSignIn {
    let body = SocialSignIn(
      provider: provider.rawValue, idToken: .init(token: idToken, nonce: nonce))
    return try signedIn(await send("POST", "v1/auth/sign-in/social", body: json(body)))
  }

  func sendEmailCode(to email: String) async throws {
    _ = try await send(
      "POST", "v1/auth/email-otp/send-verification-otp", body: json(EmailCode(email: email)))
  }

  func signIn(email: String, code: String) async throws -> AccountSignIn {
    try signedIn(
      await send(
        "POST", "v1/auth/sign-in/email-otp", body: json(EmailSignIn(email: email, otp: code))))
  }

  func accessToken(sessionToken: String) async throws -> String {
    try decoded(
      AccessToken.self, from: await send("GET", "v1/auth/token", bearer: sessionToken)
    ).token
  }

  func signOut(sessionToken: String) async throws {
    _ = try await send("POST", "v1/auth/sign-out", body: json(Empty()), bearer: sessionToken)
  }

  func signInProviders(sessionToken: String) async throws -> Set<String> {
    let identities = try decoded(
      [Identity].self, from: await send("GET", "v1/auth/list-accounts", bearer: sessionToken))
    return Set(identities.map(\.providerId))
  }

  func sync(_ request: SyncRequestBody, accessToken: String) async throws -> SyncAnswer {
    try decoded(
      SyncAnswer.self, from: await send("POST", "v1/sync", body: json(request), bearer: accessToken)
    )
  }

  func deleteAccount(accessToken: String, appleAuthorizationCode: String?) async throws {
    let body = Deletion(appleAuthorizationCode: appleAuthorizationCode)
    _ = try await send("DELETE", "v1/me", body: json(body), bearer: accessToken)
  }

  private func signedIn(_ answer: (Data, HTTPURLResponse)) throws -> AccountSignIn {
    let user = try decoded(SignInAnswer.self, from: answer).user
    guard let token = answer.1.value(forHTTPHeaderField: "set-auth-token"), !token.isEmpty else {
      throw AccountServiceError.missingSessionToken
    }
    return AccountSignIn(sessionToken: token, userID: user.id, email: user.email)
  }

  private func decoded<Value: Decodable>(
    _ type: Value.Type, from answer: (Data, HTTPURLResponse)
  ) throws -> Value {
    do {
      return try JSONDecoder.accountService.decode(type, from: answer.0)
    } catch {
      throw AccountServiceError.unreadableAnswer(status: answer.1.statusCode)
    }
  }

  private func json(_ value: some Encodable) throws -> Data {
    try JSONEncoder().encode(value)
  }

  private func send(
    _ method: String, _ path: String, body: Data? = nil, bearer: String? = nil
  ) async throws -> (Data, HTTPURLResponse) {
    var request = URLRequest(url: baseURL.appending(path: path))
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(AccountServiceConfiguration.clientID, forHTTPHeaderField: "X-Zenbu-Client")
    if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
    if let body {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = body
    }
    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await session.data(for: request)
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as URLError where error.code == .cancelled {
      throw CancellationError()
    } catch {
      throw AccountServiceError.unreachable
    }
    guard let http = response as? HTTPURLResponse else { throw AccountServiceError.unreachable }
    guard (200..<300).contains(http.statusCode) else { throw Self.refusal(http, data) }
    return (data, http)
  }

  private struct ErrorAnswer: Decodable {
    struct Detail: Decodable {
      let code: String
      let message: String?
    }
    let error: Detail
  }

  static func refusal(_ response: HTTPURLResponse, _ data: Data) -> AccountServiceError {
    let detail = (try? JSONDecoder().decode(ErrorAnswer.self, from: data))?.error
    return .refused(
      status: response.statusCode,
      code: detail?.code ?? "http_\(response.statusCode)",
      message: detail?.message
        ?? HTTPURLResponse.localizedString(forStatusCode: response.statusCode),
      retryAfter: retryAfter(response.value(forHTTPHeaderField: "Retry-After")))
  }

  static func retryAfter(_ value: String?, now: Date = Date()) -> TimeInterval? {
    guard let value = value?.trimmingCharacters(in: .whitespaces), !value.isEmpty else {
      return nil
    }
    if let seconds = TimeInterval(value) { return max(0, seconds) }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(identifier: "GMT")
    formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
    guard let date = formatter.date(from: value) else { return nil }
    return max(0, date.timeIntervalSince(now))
  }
}
