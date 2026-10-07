import Foundation
import Security

protocol SessionTokenStorage: Sendable {
  func read() -> String?
  @discardableResult func save(_ token: String) -> Bool
  func delete()
}

struct KeychainSessionTokenStorage: SessionTokenStorage {
  static let service = "com.zenbujapanese.app.account"
  static let account = "session-token"

  private var query: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Self.service,
      kSecAttrAccount as String: Self.account,
    ]
  }

  func read() -> String? {
    var lookup = query
    lookup[kSecReturnData as String] = true
    lookup[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    guard SecItemCopyMatching(lookup as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data
    else { return nil }
    return String(data: data, encoding: .utf8)
  }

  @discardableResult
  func save(_ token: String) -> Bool {
    let data = Data(token.utf8)
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let updated = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if updated == errSecSuccess { return true }
    guard updated == errSecItemNotFound else { return false }
    return SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)
      == errSecSuccess
  }

  func delete() {
    SecItemDelete(query as CFDictionary)
  }
}

enum AccessTokenClaims {
  static func expiry(of token: String) -> Date? {
    let parts = token.split(separator: ".")
    guard parts.count == 3 else { return nil }
    var payload = parts[1].replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    payload += String(repeating: "=", count: (4 - payload.count % 4) % 4)
    guard let data = Data(base64Encoded: payload),
      let claims = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let expiry = claims["exp"] as? Double
    else { return nil }
    return Date(timeIntervalSince1970: expiry)
  }
}

@MainActor
final class AccountTokens {
  static let refreshMargin: TimeInterval = 60
  static let assumedLifetime: TimeInterval = 10 * 60

  private let api: AccountAPI
  private let storage: any SessionTokenStorage
  private let now: @MainActor () -> Date
  private var accessToken: (token: String, expiresAt: Date)?

  init(
    api: AccountAPI, storage: any SessionTokenStorage,
    now: @escaping @MainActor () -> Date = Date.init
  ) {
    self.api = api
    self.storage = storage
    self.now = now
  }

  var sessionToken: String? { storage.read() }

  func replaceSession(with token: String) {
    storage.save(token)
    accessToken = nil
  }

  func forgetSession() {
    storage.delete()
    accessToken = nil
  }

  func validAccessToken() async throws -> String {
    if let accessToken, accessToken.expiresAt.timeIntervalSince(now()) > Self.refreshMargin {
      return accessToken.token
    }
    return try await refreshedAccessToken()
  }

  func withAccessToken<Value: Sendable>(
    _ call: (String) async throws -> Value
  ) async throws -> Value {
    do {
      return try await call(try await validAccessToken())
    } catch AccountServiceError.refused(status: 401, _, _, _) {
      accessToken = nil
      return try await call(try await refreshedAccessToken())
    }
  }

  private func refreshedAccessToken() async throws -> String {
    guard let session = storage.read() else { throw AccountServiceError.sessionEnded }
    let token: String
    do {
      token = try await api.accessToken(sessionToken: session)
    } catch AccountServiceError.refused(status: 401, _, _, _) {
      throw AccountServiceError.sessionEnded
    }
    accessToken = (token, AccessTokenClaims.expiry(of: token) ?? now() + Self.assumedLifetime)
    return token
  }
}
