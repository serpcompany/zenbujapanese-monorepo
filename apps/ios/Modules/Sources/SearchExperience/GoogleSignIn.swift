import AuthenticationServices
import CryptoKit

enum GoogleSignInError: Error, Equatable {
  case refused(String)
  case unexpectedCallback
}

struct GoogleSignIn: Sendable {
  static let authorizationEndpoint = URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!
  static let tokenEndpoint = URL(string: "https://oauth2.googleapis.com/token")!

  struct Attempt: Sendable, Equatable {
    let url: URL
    let verifier: String
    let state: String
  }

  let clientID: String
  let session: URLSession

  var redirectScheme: String {
    clientID.split(separator: ".").reversed().joined(separator: ".")
  }

  var redirectURI: String { "\(redirectScheme):/oauthredirect" }

  func attempt(nonce: String) -> Attempt {
    let verifier = Self.randomToken(bytes: 32)
    let state = Self.randomToken(bytes: 16)
    var components = URLComponents(url: Self.authorizationEndpoint, resolvingAgainstBaseURL: false)!
    components.queryItems = [
      URLQueryItem(name: "client_id", value: clientID),
      URLQueryItem(name: "redirect_uri", value: redirectURI),
      URLQueryItem(name: "response_type", value: "code"),
      URLQueryItem(name: "scope", value: "openid email"),
      URLQueryItem(name: "code_challenge", value: Self.challenge(for: verifier)),
      URLQueryItem(name: "code_challenge_method", value: "S256"),
      URLQueryItem(name: "nonce", value: nonce),
      URLQueryItem(name: "state", value: state),
      URLQueryItem(name: "prompt", value: "select_account"),
    ]
    return Attempt(url: components.url!, verifier: verifier, state: state)
  }

  func idToken(from callback: URL, for attempt: Attempt) async throws -> String {
    let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
    let value = { (name: String) in items.first { $0.name == name }?.value }
    if let error = value("error") {
      if error == "access_denied" { throw CancellationError() }
      throw GoogleSignInError.refused(error)
    }
    guard value("state") == attempt.state, let code = value("code") else {
      throw GoogleSignInError.unexpectedCallback
    }
    var request = URLRequest(url: Self.tokenEndpoint)
    request.httpMethod = "POST"
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    request.httpBody = Self.form([
      ("code", code), ("client_id", clientID), ("redirect_uri", redirectURI),
      ("code_verifier", attempt.verifier), ("grant_type", "authorization_code"),
    ])
    let (data, response): (Data, URLResponse)
    do {
      (data, response) = try await session.data(for: request)
    } catch {
      throw AccountServiceError.unreachable
    }
    struct Tokens: Decodable {
      let id_token: String
    }
    guard (response as? HTTPURLResponse)?.statusCode == 200,
      let tokens = try? JSONDecoder().decode(Tokens.self, from: data)
    else { throw GoogleSignInError.refused("token_exchange_failed") }
    return tokens.id_token
  }

  static func challenge(for verifier: String) -> String {
    base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
  }

  private static func randomToken(bytes count: Int) -> String {
    var generator = SystemRandomNumberGenerator()
    return base64URL(
      Data((0..<count).map { _ in UInt8.random(in: .min ... .max, using: &generator) }))
  }

  private static func base64URL(_ data: Data) -> String {
    data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  private static func form(_ fields: [(String, String)]) -> Data {
    let allowed = CharacterSet(
      charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
    let encode = { (text: String) in
      text.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    }
    return Data(fields.map { "\(encode($0.0))=\(encode($0.1))" }.joined(separator: "&").utf8)
  }
}

@MainActor
final class WebSignInPresenter: NSObject, ASWebAuthenticationPresentationContextProviding {
  private var session: ASWebAuthenticationSession?

  func callback(for url: URL, scheme: String) async throws -> URL {
    defer { session = nil }
    return try await withCheckedThrowingContinuation { continuation in
      let session = ASWebAuthenticationSession(url: url, callback: .customScheme(scheme)) {
        callback, error in
        if let callback {
          continuation.resume(returning: callback)
        } else if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin {
          continuation.resume(throwing: CancellationError())
        } else {
          continuation.resume(throwing: error ?? GoogleSignInError.unexpectedCallback)
        }
      }
      session.presentationContextProvider = self
      self.session = session
      if !session.start() {
        continuation.resume(throwing: GoogleSignInError.unexpectedCallback)
      }
    }
  }

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    keyWindowAnchor()
  }
}
