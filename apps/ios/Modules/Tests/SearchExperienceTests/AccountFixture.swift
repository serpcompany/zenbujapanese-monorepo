import Foundation

@testable import SearchExperience

final class CallCount: @unchecked Sendable {
  private let lock = NSLock()
  private var count = 0

  func next() -> Int {
    lock.withLock {
      count += 1
      return count
    }
  }
}

@MainActor
final class AccountFixture {
  nonisolated static let sessionToken = "session-1.signed"
  nonisolated static let userID = "learner-1"
  nonisolated static let email = "learner@example.com"
  nonisolated static let taberu = "0123456789abcdef0123456789abcdef"
  nonisolated static let miru = "fedcba9876543210fedcba9876543210"

  let directory = FileManager.default.temporaryDirectory
    .appending(path: "account-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
  let server: StubAccountServer
  let storage: MemorySessionTokenStorage
  var now = Date(timeIntervalSince1970: 1_791_000_000)
  private(set) var wordKnowledge: WordKnowledge!
  private(set) var wordLists: WordLists!
  private(set) var account: ZenbuAccount!

  var sync: AccountSync { account.sync }

  init(sessionToken: String? = nil, server: StubAccountServer = StubAccountServer()) {
    storage = MemorySessionTokenStorage(sessionToken)
    self.server = server
  }

  deinit {
    try? FileManager.default.removeItem(at: directory)
  }

  func launch() async {
    if account != nil { await settle() }
    wordKnowledge = WordKnowledge(fileURL: directory.appending(path: "word-knowledge.json"))
    wordLists = WordLists(fileURL: directory.appending(path: "word-lists.json"))
    account = ZenbuAccount(
      configuration: AccountServiceConfiguration(serviceURL: server.baseURL, googleClientID: nil),
      session: server.session, storage: storage, wordKnowledge: wordKnowledge,
      wordLists: wordLists, fileURL: directory.appending(path: "account-sync.json"),
      now: { [unowned self] in now })
    sync.onLocalChange = nil
    await settle()
  }

  func settle() async {
    await wordKnowledge.flush()
    await wordLists.flush()
    await sync.flush()
  }

  func serve(
    tokenLifetime: TimeInterval = 15 * 60,
    sync: @escaping @Sendable (StubSyncRequest) -> StubReply = { request in
      StubSync.answer(results: StubSync.applied(request), cursor: "cursor-1")
    }
  ) {
    let accessToken = StubTokens.access(expiresAt: now + tokenLifetime)
    server.respond { request in
      switch request.route {
      case "GET /v1/auth/token":
        .json(200, ["token": accessToken])
      case "POST /v1/auth/email-otp/send-verification-otp":
        .json(200, ["success": true])
      case "POST /v1/auth/sign-in/email-otp":
        .json(200, Self.signedIn(), headers: ["set-auth-token": Self.sessionToken])
      case "POST /v1/sync":
        sync(request.sync)
      case "POST /v1/auth/sign-out":
        .json(200, ["success": true])
      case "GET /v1/auth/list-accounts":
        .json(200, [["providerId": "email", "accountId": Self.email]])
      case "DELETE /v1/me":
        .json(200, ["status": "deleted"])
      default:
        .error(404, "not_found")
      }
    }
  }

  static func afterSignIn() async throws -> AccountFixture {
    let fixture = AccountFixture()
    fixture.serve()
    await fixture.launch()
    try await fixture.signIn()
    return fixture
  }

  func answerNextSignIn(as userID: String, sessionToken: String) {
    server.respond { request in
      request.route == "POST /v1/auth/sign-in/email-otp"
        ? .json(200, Self.signedIn(as: userID), headers: ["set-auth-token": sessionToken])
        : .json(200, ["success": true])
    }
  }

  func signIn(as email: String = AccountFixture.email) async throws {
    try await account.signIn(email: email, code: "123456")
    await account.scheduler.settled()
    await settle()
  }

  func syncNow() async throws {
    try await sync.sync()
    await settle()
  }

  func markKnown(_ id: String, headword: String = "食べる") {
    wordKnowledge.setStatus(
      .known, id: LanguageReferenceID(rawValue: id), headword: headword, reading: "たべる")
  }

  func clearKnown(_ id: String) {
    wordKnowledge.setStatus(
      .unknown, id: LanguageReferenceID(rawValue: id), headword: "食べる", reading: "たべる")
  }

  func markMany(_ count: Int) {
    for number in 0..<count {
      let id = String(repeating: "0", count: 20) + String(format: "%012x", number + 1)
      markKnown(id, headword: "語\(number)")
    }
  }

  func addMiru(to listID: UUID) {
    wordLists.addWord(
      LanguageReferenceID(rawValue: Self.miru), headword: "見る", reading: "みる", to: listID)
  }

  var favorites: UUID { wordLists.lists[0].id }

  var queuedOperations: [String] {
    sync.state.queue.map { "\($0.key.entity) \($0.operation) \($0.key.entityID)" }
  }

  nonisolated static func signedIn(as userID: String = userID, email: String = email)
    -> [String: Any]
  {
    [
      "token": "session-1",
      "user": [
        "id": userID, "email": email, "name": "", "emailVerified": true, "image": NSNull(),
        "createdAt": "2026-10-06T10:00:00.000Z", "updatedAt": "2026-10-06T10:00:00.000Z",
      ],
    ]
  }

}
