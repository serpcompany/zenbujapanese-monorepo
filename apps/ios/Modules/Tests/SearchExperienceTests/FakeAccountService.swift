import Foundation

@testable import SearchExperience

final class FakeAccountService: @unchecked Sendable {
  struct Entity {
    var version: Int
    var data: [String: Any]?
    var sequence: Int
  }

  let lock = NSLock()
  var accounts: [String: [String: Entity]] = [:]
  var files: [String: [String: Data]] = [:]
  var emptiedPhotos: [String: [String: [String: Any]]] = [:]
  var photosUnavailable = false
  var fileRefusals: [String: StubReply] = [:]
  var droppedUploads: Set<String> = []
  var pageSize = 100
  var refusesSet = false
  private(set) var invalidCursors = 0
  private var forgottenThrough: [String: Int] = [:]
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

  func setPageSize(_ size: Int) {
    lock.withLock { pageSize = size }
  }

  func forget(_ key: String, for email: String) {
    let user = userID(for: email)
    lock.withLock {
      guard let entity = accounts[user]?.removeValue(forKey: key) else { return }
      forgottenThrough[user] = max(forgottenThrough[user] ?? 0, entity.sequence)
    }
  }

  func profile(for email: String) -> [String: Any] {
    lock.withLock { profile(of: userID(for: email)).data ?? [:] }
  }

  func editProfileOnTheWebsite(for email: String, _ fields: [String: SyncFieldValue]) {
    let user = userID(for: email)
    lock.withLock {
      let mutation = StubSyncRequest.Mutation(
        id: UUID().uuidString, entity: "profile", operation: "update", entityId: user,
        baseVersion: profile(of: user).version, fields: fields)
      _ = apply(mutation, for: user)
    }
  }

  private func reply(to request: StubRequest) -> StubReply {
    switch request.route {
    case "POST /v1/auth/sign-in/email-otp":
      let email = request.json["email"] as? String ?? ""
      issued += 1
      let session = "session-\(issued).signed"
      sessions[session] = userID(for: email)
      return .json(
        200, AccountFixture.signedIn(as: userID(for: email), email: email),
        headers: ["set-auth-token": session])
    case "GET /v1/auth/token":
      guard let user = sessions[bearer(of: request)] else { return .error(401, "unauthorized") }
      issued += 1
      let token = StubTokens.access(expiresAt: Date.distantFuture, subject: "\(user)-\(issued)")
      accessTokens[token] = user
      return .json(200, ["token": token])
    case "POST /v1/sync":
      guard let user = accessTokens[bearer(of: request)] else { return .error(401, "unauthorized") }
      return sync(request.sync, for: user)
    case "GET /v1/me":
      guard let user = accessTokens[bearer(of: request)] else { return .error(401, "unauthorized") }
      return .json(200, profile(of: user).data ?? [:])
    case "POST /v1/auth/sign-out":
      sessions[bearer(of: request)] = nil
      return .json(200, ["success": true])
    default:
      guard request.path.hasPrefix("/v1/photos/") else { return .error(404, "not_found") }
      guard let user = accessTokens[bearer(of: request)] else { return .error(401, "unauthorized") }
      return photoFile(request, for: user)
    }
  }

  private func bearer(of request: StubRequest) -> String {
    String(request.header("Authorization")?.dropFirst("Bearer ".count) ?? "")
  }

  private func sync(_ request: StubSyncRequest, for user: String) -> StubReply {
    let position = (request.cursor ?? "").split(separator: ".").compactMap { Int($0) }
    let after = position.first ?? 0
    let floor = position.dropFirst().first ?? after
    if request.cursor != nil, forgottenThrough[user] ?? 0 > floor {
      invalidCursors += 1
      return .error(410, "invalid_cursor")
    }
    let results = request.mutations.map { apply($0, for: user) }
    let nextFloor = request.cursor == nil ? sequence : max(floor, after)
    let pending = (accounts[user] ?? [:]).filter { $0.value.sequence > after }
      .sorted { $0.value.sequence < $1.value.sequence }
    let page = pending.prefix(pageSize)
    let last = page.last?.value.sequence ?? after
    let isChild = { (key: String) in key.hasPrefix("listWord:") || key.hasPrefix("photoWord:") }
    let ordered = page.filter { !isChild($0.key) } + page.filter { isChild($0.key) }
    return StubSync.answer(
      results: results, changes: ordered.map { syncedChange(key: $0.key, $0.value, of: user) },
      cursor: "\(last).\(nextFloor)", hasMore: pending.count > page.count,
      searchKey: searchKey(of: user).hexString)
  }

  private func syncedChange(key: String, _ entity: Entity, of user: String) -> [String: Any] {
    var synced = change(key: key, entity)
    let photoID = String(key.dropFirst("photo:".count))
    if key.hasPrefix("photo:"), entity.data == nil, emptiedPhotos[user]?[photoID] != nil {
      synced["emptied"] = true
    }
    return synced
  }

  func change(key: String, _ entity: Entity) -> [String: Any] {
    let entityID = String(key.drop { $0 != ":" }.dropFirst())
    let kind = String(key.prefix { $0 != ":" })
    guard let data = entity.data else {
      return StubSync.gone(kind, entityID, version: entity.version)
    }
    return StubSync.put(kind, entityID, entity.version, data)
  }

  private func profile(of user: String) -> Entity {
    let key = "profile:\(user)"
    if let profile = accounts[user]?[key] { return profile }
    let profile = Entity(
      version: 1,
      data: ["id": user, "name": "", "username": NSNull(), "email": user, "version": 1],
      sequence: 0)
    accounts[user, default: [:]][key] = profile
    return profile
  }

  private func apply(_ mutation: StubSyncRequest.Mutation, for user: String) -> [String: Any] {
    if mutation.entity == "profile" { _ = profile(of: user) }
    if SyncEntity.kept.contains(mutation.entity) { return applyKept(mutation, for: user) }
    if mutation.entity == SyncEntity.knownWord { return applyKnownWord(mutation, for: user) }
    let key = "\(mutation.entity):\(mutation.entityId)"
    let current = accounts[user]?[key]
    let version = current?.version ?? 0
    let base = mutation.baseVersion ?? 0
    let (applied, conflict) = outcomes(of: mutation, key: key, current: current)
    let text = { (name: String) -> String in
      if case .string(let value) = mutation.fields?[name] { return value }
      return current?.data?[name] as? String ?? ""
    }
    switch (mutation.entity, mutation.operation) {
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
    case ("watchedVideo", "watch"):
      if current != nil, current?.data == nil, base != version { return conflict() }
      var data = current?.data ?? ["videoId": mutation.entityId]
      for (name, value) in mutation.fields ?? [:] { data[name] = Self.json(value) }
      return save(user, key, data, version + 1, applied)
    case ("watchedVideo", "remove"):
      guard current?.data != nil else { return applied(version) }
      return save(user, key, nil, version + 1, applied)
    case ("bookmarkedSentence", "add"):
      if current?.data != nil { return applied(version) }
      var data: [String: Any] = ["id": mutation.entityId]
      for (name, value) in mutation.fields ?? [:] { data[name] = Self.json(value) }
      return save(user, key, data, version + 1, applied)
    case ("bookmarkedSentence", "remove"):
      guard current?.data != nil else { return applied(version) }
      guard base == version else { return conflict() }
      return save(user, key, nil, version + 1, applied)
    case ("profile", "update"):
      guard var data = current?.data else {
        return StubSync.rejected(mutation.id, "invalid_mutation")
      }
      guard base == version else { return conflict() }
      if case .string(let name) = mutation.fields?["name"] {
        let trimmed = name.precomposedStringWithCanonicalMapping
          .split(whereSeparator: \.isWhitespace).joined(separator: " ")
        let refused: Set<Unicode.GeneralCategory> = [.control, .format]
        guard (1...100).contains(trimmed.unicodeScalars.count),
          !trimmed.unicodeScalars.contains(where: { refused.contains($0.properties.generalCategory) })
        else { return StubSync.rejected(mutation.id, "invalid_fields") }
        data["name"] = trimmed
      }
      switch mutation.fields?["username"] {
      case .string(let username):
        guard !usernameTaken(username, byOtherThan: user) else {
          return StubSync.rejected(mutation.id, "username_taken")
        }
        data["username"] = username
      case .null:
        data["username"] = NSNull()
      default:
        break
      }
      if NSDictionary(dictionary: data).isEqual(to: current?.data ?? [:]) {
        return applied(version)
      }
      data["version"] = version + 1
      return save(user, key, data, version + 1, applied)
    default:
      return StubSync.rejected(mutation.id, "unknown_operation")
    }
  }

  func outcomes(
    of mutation: StubSyncRequest.Mutation, key: String, current: Entity?
  ) -> (applied: (Int) -> [String: Any], conflict: () -> [String: Any]) {
    let entityID = String(key.drop { $0 != ":" }.dropFirst())
    return (
      { version in ["id": mutation.id, "status": "applied", "version": version] },
      {
        StubSync.conflict(
          mutation.id,
          current.map { self.change(key: key, $0) }
            ?? StubSync.gone(mutation.entity, entityID, version: 0))
      }
    )
  }

  private func usernameTaken(_ username: String, byOtherThan user: String) -> Bool {
    accounts.contains { owner, entities in
      owner != user && entities["profile:\(owner)"]?.data?["username"] as? String == username
    }
  }

  static func json(_ value: SyncFieldValue) -> Any {
    switch value {
    case .string(let text): text
    case .number(let number): number
    case .decimal(let number): number
    case .bool(let flag): flag
    case .null: NSNull()
    }
  }

  func save(
    _ user: String, _ key: String, _ data: [String: Any]?, _ version: Int,
    _ applied: (Int) -> [String: Any]
  ) -> [String: Any] {
    sequence += 1
    accounts[user, default: [:]][key] = Entity(version: version, data: data, sequence: sequence)
    return applied(version)
  }
}
