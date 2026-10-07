import Foundation

@testable import SearchExperience

struct StubRequest: Sendable {
  let method: String
  let path: String
  let headers: [String: String]
  let body: Data

  var route: String { "\(method) \(path)" }

  func header(_ name: String) -> String? {
    headers.first { $0.key.caseInsensitiveCompare(name) == .orderedSame }?.value
  }

  var json: [String: Any] {
    (try? JSONSerialization.jsonObject(with: body) as? [String: Any]) ?? [:]
  }

  var sync: StubSyncRequest {
    (try? JSONDecoder().decode(StubSyncRequest.self, from: body)) ?? StubSyncRequest()
  }
}

struct StubSyncRequest: Decodable, Sendable {
  struct Mutation: Decodable, Sendable, Equatable {
    let id: String
    let entity: String
    let operation: String
    let entityId: String
    let baseVersion: Int?
    let fields: [String: SyncFieldValue]?
  }

  var cursor: String?
  var mutations: [Mutation] = []
}

enum StubReply: Sendable {
  case answer(status: Int, headers: [String: String], body: Data)
  case offline

  static func json(_ status: Int, _ object: Any, headers: [String: String] = [:]) -> StubReply {
    .answer(
      status: status, headers: headers.merging(["Content-Type": "application/json"]) { a, _ in a },
      body: (try? JSONSerialization.data(withJSONObject: object)) ?? Data())
  }

  static func error(_ status: Int, _ code: String, headers: [String: String] = [:]) -> StubReply {
    json(status, ["error": ["code": code, "message": code]], headers: headers)
  }
}

final class StubAccountServer: @unchecked Sendable {
  private static let lock = NSLock()
  nonisolated(unsafe) private static var servers: [String: StubAccountServer] = [:]

  let host = "stub-\(UUID().uuidString.lowercased()).test"
  private let lock = NSLock()
  private var handler: @Sendable (StubRequest) -> StubReply = { _ in .error(404, "not_found") }
  private var received: [StubRequest] = []

  init() {
    Self.lock.withLock { Self.servers[host] = self }
  }

  deinit {
    Self.lock.withLock { Self.servers[host] = nil }
  }

  var baseURL: URL { URL(string: "https://\(host)")! }

  var session: URLSession {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [StubURLProtocol.self]
    return AccountAPI.urlSession(configuration)
  }

  var requests: [StubRequest] { lock.withLock { received } }

  func requests(to route: String) -> [StubRequest] {
    requests.filter { $0.route == route }
  }

  func respond(_ handler: @escaping @Sendable (StubRequest) -> StubReply) {
    lock.withLock { self.handler = handler }
  }

  fileprivate func reply(to request: StubRequest) -> StubReply {
    let handler = lock.withLock {
      received.append(request)
      return self.handler
    }
    return handler(request)
  }

  fileprivate static func server(for host: String?) -> StubAccountServer? {
    lock.withLock { host.flatMap { servers[$0] } }
  }
}

final class StubURLProtocol: URLProtocol {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    guard let url = request.url, let server = StubAccountServer.server(for: url.host()) else {
      client?.urlProtocol(self, didFailWithError: URLError(.cannotFindHost))
      return
    }
    let stub = StubRequest(
      method: request.httpMethod ?? "GET", path: url.path(),
      headers: request.allHTTPHeaderFields ?? [:], body: Self.body(of: request))
    switch server.reply(to: stub) {
    case .offline:
      client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
    case .answer(let status, let headers, let body):
      let response = HTTPURLResponse(
        url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: body)
      client?.urlProtocolDidFinishLoading(self)
    }
  }

  override func stopLoading() {}

  private static func body(of request: URLRequest) -> Data {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return Data() }
    stream.open()
    defer { stream.close() }
    var data = Data()
    var buffer = [UInt8](repeating: 0, count: 4096)
    while stream.hasBytesAvailable {
      let count = stream.read(&buffer, maxLength: buffer.count)
      guard count > 0 else { break }
      data.append(buffer, count: count)
    }
    return data
  }
}

final class MemorySessionTokenStorage: SessionTokenStorage, @unchecked Sendable {
  private let lock = NSLock()
  private var token: String?

  init(_ token: String? = nil) {
    self.token = token
  }

  func read() -> String? { lock.withLock { token } }

  @discardableResult
  func save(_ token: String) -> Bool {
    lock.withLock { self.token = token }
    return true
  }

  func delete() { lock.withLock { token = nil } }
}

enum StubTokens {
  static func access(expiresAt: Date, subject: String = "learner") -> String {
    let header = encode(["alg": "EdDSA"])
    let claims = encode(["sub": subject, "exp": Int(expiresAt.timeIntervalSince1970)])
    return "\(header).\(claims).signature"
  }

  private static func encode(_ object: [String: Any]) -> String {
    ((try? JSONSerialization.data(withJSONObject: object)) ?? Data()).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}

enum StubSync {
  static func answer(
    results: [[String: Any]] = [], changes: [[String: Any]] = [], cursor: String,
    hasMore: Bool = false
  ) -> StubReply {
    .json(200, ["results": results, "changes": changes, "cursor": cursor, "hasMore": hasMore])
  }

  static func applied(_ request: StubSyncRequest, version: Int = 1) -> [[String: Any]] {
    request.mutations.map { ["id": $0.id, "status": "applied", "version": version] }
  }

  static func rejected(_ id: String, _ code: String) -> [String: Any] {
    ["id": id, "status": "rejected", "error": ["code": code, "message": code]]
  }

  static func conflict(_ id: String, _ current: [String: Any]) -> [String: Any] {
    ["id": id, "status": "conflict", "version": current["version"] ?? 0, "current": current]
  }

  static func knownWord(_ itemID: String, known: Bool, version: Int, headword: String = "食べる")
    -> [String: Any]
  {
    put(
      "knownWord", itemID, version,
      ["itemId": itemID, "headword": headword, "reading": "たべる", "known": known])
  }

  static func list(_ id: UUID, name: String, position: Int = 0, version: Int) -> [String: Any] {
    let listID = id.uuidString.lowercased()
    return put(
      "list", listID, version,
      ["id": listID, "name": name, "position": position, "createdAt": "2026-10-06T10:00:00.000Z"])
  }

  static func listWord(_ listID: UUID, _ itemID: String, version: Int) -> [String: Any] {
    let list = listID.uuidString.lowercased()
    return put(
      "listWord", "\(list)/\(itemID)", version,
      [
        "listId": list, "itemId": itemID, "headword": "見る", "reading": "みる",
        "addedAt": "2026-10-06T10:00:00.000Z",
      ])
  }

  static func watchedVideo(
    _ videoID: String, at watchedAt: String, version: Int, title: String = "Elsewhere",
    position: Double = 42.5
  ) -> [String: Any] {
    put(
      "watchedVideo", videoID, version,
      [
        "videoId": videoID, "title": title, "author": NSNull(), "duration": 600,
        "position": position, "comprehension": 0.5, "watchedAt": watchedAt,
      ])
  }

  static func gone(_ entity: String, _ entityID: String, version: Int) -> [String: Any] {
    [
      "entity": entity, "entityId": entityID, "operation": "delete", "version": version,
      "data": NSNull(),
    ]
  }

  static func put(
    _ entity: String, _ entityID: String, _ version: Int, _ data: [String: Any]
  ) -> [String: Any] {
    ["entity": entity, "entityId": entityID, "operation": "put", "version": version, "data": data]
  }
}
