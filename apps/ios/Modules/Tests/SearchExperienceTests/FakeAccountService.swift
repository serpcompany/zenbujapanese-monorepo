import Foundation

@testable import SearchExperience

final class FakeAccountService: @unchecked Sendable {
  private struct Entity {
    var version: Int
    var data: [String: Any]?
    var sequence: Int
  }

  private let lock = NSLock()
  private var accounts: [String: [String: Entity]] = [:]
  private var sessions: [String: String] = [:]
  private var accessTokens: [String: String] = [:]
  private var sequence = 0
  private var issued = 0

  init(on server: StubAccountServer) {
    server.respond { [self] request in lock.withLock { reply(to: request) } }
  }

  func userID(for email: String) -> String { "user-\(email)" }

  func data(of key: String, for email: String) -> [String: Any]? {
    lock.withLock { accounts[userID(for: email)]?[key]?.data }
  }

  func liveKeys(for email: String, entity: String) -> [String] {
    lock.withLock {
      (accounts[userID(for: email)] ?? [:])
        .filter { $0.key.hasPrefix("\(entity):") && $0.value.data != nil }.map(\.key).sorted()
    }
  }

  func change(for email: String, _ mutation: StubSyncRequest.Mutation) {
    lock.withLock { _ = apply(mutation, for: userID(for: email)) }
  }

  private func reply(to request: StubRequest) -> StubReply {
    switch request.route {
    case "POST /v1/auth/sign-in/email-otp":
      let email = request.json["email"] as? String ?? ""
      issued += 1
      let session = "session-\(issued).signed"
      sessions[session] = userID(for: email)
      let user: [String: Any] = [
        "id": userID(for: email), "email": email, "name": "", "emailVerified": true,
        "image": NSNull(), "createdAt": "2026-10-06T10:00:00.000Z",
        "updatedAt": "2026-10-06T10:00:00.000Z",
      ]
      return .json(200, ["token": "bare", "user": user], headers: ["set-auth-token": session])
    case "GET /v1/auth/token":
      guard let user = sessions[bearer(of: request)] else { return .error(401, "unauthorized") }
      issued += 1
      let token = StubTokens.access(expiresAt: Date.distantFuture, subject: "\(user)-\(issued)")
      accessTokens[token] = user
      return .json(200, ["token": token])
    case "POST /v1/sync":
      guard let user = accessTokens[bearer(of: request)] else { return .error(401, "unauthorized") }
      return sync(request.sync, for: user)
    case "POST /v1/auth/sign-out":
      sessions[bearer(of: request)] = nil
      return .json(200, ["success": true])
    default:
      return .error(404, "not_found")
    }
  }

  private func bearer(of request: StubRequest) -> String {
    String(request.header("Authorization")?.dropFirst("Bearer ".count) ?? "")
  }

  private func sync(_ request: StubSyncRequest, for user: String) -> StubReply {
    let results = request.mutations.map { apply($0, for: user) }
    let after = Int(request.cursor ?? "") ?? 0
    let changes = (accounts[user] ?? [:]).filter { $0.value.sequence > after }
      .sorted { $0.value.sequence < $1.value.sequence }
    let last = changes.last?.value.sequence ?? after
    let ordered =
      changes.filter { !$0.key.hasPrefix("listWord:") }
      + changes.filter { $0.key.hasPrefix("listWord:") }
    return StubSync.answer(
      results: results, changes: ordered.map { change(key: $0.key, $0.value) }, cursor: "\(last)")
  }

  private func change(key: String, _ entity: Entity) -> [String: Any] {
    let entityID = String(key.drop { $0 != ":" }.dropFirst())
    let kind = String(key.prefix { $0 != ":" })
    guard let data = entity.data else {
      return StubSync.gone(kind, entityID, version: entity.version)
    }
    return [
      "entity": kind, "entityId": entityID, "operation": "put", "version": entity.version,
      "data": data,
    ]
  }

  private func apply(_ mutation: StubSyncRequest.Mutation, for user: String) -> [String: Any] {
    let key = "\(mutation.entity):\(mutation.entityId)"
    let current = accounts[user]?[key]
    let version = current?.version ?? 0
    let base = mutation.baseVersion ?? 0
    let applied = { (version: Int) -> [String: Any] in
      ["id": mutation.id, "status": "applied", "version": version]
    }
    let conflict = { () -> [String: Any] in
      StubSync.conflict(
        mutation.id,
        current.map { self.change(key: key, $0) }
          ?? StubSync.gone(mutation.entity, mutation.entityId, version: 0))
    }
    let text = { (name: String) -> String in
      if case .string(let value) = mutation.fields?[name] { return value }
      return current?.data?[name] as? String ?? ""
    }
    switch (mutation.entity, mutation.operation) {
    case ("knownWord", let operation):
      let known = operation == "mark"
      if (current?.data?["known"] as? Bool ?? false) == known { return applied(version) }
      guard base == version else { return conflict() }
      return save(
        user, key,
        [
          "itemId": mutation.entityId, "headword": text("headword"),
          "reading": text("reading"), "known": known,
        ], version + 1, applied)
    case ("list", "create"):
      guard current == nil else { return StubSync.rejected(mutation.id, "already_exists") }
      var position = 0
      if case .number(let value) = mutation.fields?["position"] { position = value }
      return save(
        user, key,
        [
          "id": mutation.entityId, "name": text("name"), "position": position,
          "createdAt": "2026-10-06T10:00:00.000Z",
        ], 1, applied)
    case ("list", "update"):
      guard var data = current?.data else { return conflict() }
      if case .string(let name) = mutation.fields?["name"] { data["name"] = name }
      if case .number(let position) = mutation.fields?["position"] { data["position"] = position }
      if NSDictionary(dictionary: data).isEqual(to: current?.data ?? [:]) {
        return applied(version)
      }
      guard base == version else { return conflict() }
      return save(user, key, data, version + 1, applied)
    case ("list", "delete"):
      guard current?.data != nil else { return applied(version) }
      accounts[user] = accounts[user]?.filter {
        !$0.key.hasPrefix("listWord:\(mutation.entityId)/")
      }
      return save(user, key, nil, version + 1, applied)
    case ("listWord", "add"):
      let listID = String(mutation.entityId.prefix { $0 != "/" })
      guard accounts[user]?["list:\(listID)"]?.data != nil else {
        return StubSync.rejected(mutation.id, "unknown_list")
      }
      if current?.data != nil { return applied(version) }
      return save(
        user, key,
        [
          "listId": listID, "itemId": String(mutation.entityId.drop { $0 != "/" }.dropFirst()),
          "headword": text("headword"), "reading": text("reading"),
          "addedAt": "2026-10-06T10:00:00.000Z",
        ], version + 1, applied)
    case ("listWord", "remove"):
      guard current?.data != nil else { return applied(version) }
      guard base == version else { return conflict() }
      return save(user, key, nil, version + 1, applied)
    default:
      return StubSync.rejected(mutation.id, "unknown_operation")
    }
  }

  private func save(
    _ user: String, _ key: String, _ data: [String: Any]?, _ version: Int,
    _ applied: (Int) -> [String: Any]
  ) -> [String: Any] {
    sequence += 1
    accounts[user, default: [:]][key] = Entity(version: version, data: data, sequence: sequence)
    return applied(version)
  }
}
