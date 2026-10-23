import Foundation
import TranslatorCore

@testable import SearchExperience

final class CallCount: @unchecked Sendable {
  private let lock = NSLock()
  private var count = 0

  var current: Int { lock.withLock { count } }

  func next() -> Int {
    lock.withLock {
      count += 1
      return count
    }
  }
}

final class LaterEachTime: @unchecked Sendable {
  private static let apart: TimeInterval = 0.001
  private let lock = NSLock()
  private var last = Date.distantPast

  func next() -> Date {
    lock.withLock {
      last = max(Date(), last.addingTimeInterval(Self.apart))
      return last
    }
  }
}

@MainActor
final class HeldRetries {
  private(set) var waits: [TimeInterval] = []
  private var held: [AsyncStream<Void>.Continuation] = []
  private let (waitStarted, startWait) = AsyncStream.makeStream(of: Void.self)

  var clock: SyncRetryClock {
    SyncRetryClock(
      wait: { [weak self] seconds in await self?.wait(seconds) }, jitter: { $0.upperBound })
  }

  func waited() async -> [TimeInterval] {
    var started = waitStarted.makeAsyncIterator()
    while waits.isEmpty, await started.next() != nil {}
    return waits
  }

  func release() {
    for retry in held { retry.finish() }
    held = []
  }

  private func wait(_ seconds: TimeInterval) async {
    waits.append(seconds)
    startWait.yield()
    let (released, retry) = AsyncStream.makeStream(of: Void.self)
    held.append(retry)
    for await _ in released {}
  }
}

@MainActor
final class AccountFixture {
  nonisolated static let sessionToken = "session-1.signed"
  nonisolated static let userID = "learner-1"
  nonisolated static let email = "learner@example.com"
  nonisolated static let taberu = "0123456789abcdef0123456789abcdef"
  nonisolated static let miru = "fedcba9876543210fedcba9876543210"
  nonisolated static let nonce = "nonce-1"

  let directory = FileManager.default.temporaryDirectory
    .appending(path: "account-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
  nonisolated let defaultsSuite = "account-tests-\(UUID().uuidString)"
  let server: StubAccountServer
  let storage: MemorySessionTokenStorage
  nonisolated static let start = Date(timeIntervalSince1970: 1_791_000_000)
  var now = AccountFixture.start
  var providers = SignInProviders.system
  var googleClientID: String?
  let retries = HeldRetries()
  let store = FakeAppStore()
  private(set) var wordKnowledge: WordKnowledge!
  private(set) var wordLists: WordLists!
  private(set) var watchHistory: WatchHistory!
  private(set) var translations: ConversationHistory!
  private(set) var profile: UserProfile!
  private(set) var notes: WordNoteStorage!
  private(set) var media: EncounterMediaStorage!
  private(set) var searches: RecentSearchHistory!
  private(set) var settings: SyncedSettings!
  var frequency = FrequencyChoice()
  private(set) var account: ZenbuAccount!
  lazy var defaults = UserDefaults(suiteName: defaultsSuite) ?? .standard
  nonisolated let searchTimes = LaterEachTime()

  var sync: AccountSync { account.sync }

  init(sessionToken: String? = nil, server: StubAccountServer = StubAccountServer()) {
    storage = MemorySessionTokenStorage(sessionToken)
    self.server = server
  }

  deinit {
    try? FileManager.default.removeItem(at: directory)
    UserDefaults().removePersistentDomain(forName: defaultsSuite)
  }

  func launch() async {
    if account != nil { await settle() }
    wordKnowledge = WordKnowledge(fileURL: directory.appending(path: "word-knowledge.json"))
    wordLists = WordLists(fileURL: directory.appending(path: "word-lists.json"))
    watchHistory = WatchHistory(defaults: defaults, now: { [unowned self] in now })
    translations = ConversationHistory(
      directory: directory.appending(path: "Translate Conversations"),
      now: { [unowned self] in now })
    profile = UserProfile(defaults: defaults, photoURL: directory.appending(path: "photo.jpg"))
    (notes, searches) = Self.stores(in: defaultsSuite, searchedAt: searchTimes)
    media = EncounterMediaStorage(
      directory: directory.appending(path: "Encounter Media"), placing: SavedWords.lookup)
    settings = SyncedSettings(defaults: defaults)
    account = ZenbuAccount(
      configuration: AccountServiceConfiguration(
        serviceURL: server.baseURL, googleClientID: googleClientID),
      session: server.session, storage: storage, wordKnowledge: wordKnowledge,
      wordLists: wordLists, watchHistory: watchHistory, translations: translations,
      profile: profile,
      kept: KeptStores(
        notes: notes, media: media, searches: searches, settings: settings, frequency: frequency),
      store: store, fileURL: directory.appending(path: "account-sync.json"), providers: providers,
      now: { [weak self] in self?.now ?? Self.start }, retryClock: retries.clock)
    sync.onLocalChange = nil
    await settle()
  }

  nonisolated private static func stores(in suite: String, searchedAt times: LaterEachTime)
    -> (WordNoteStorage, RecentSearchHistory)
  {
    (
      WordNoteStorage(
        defaults: UserDefaults(suiteName: suite) ?? UserDefaults(), placing: SavedWords.lookup),
      RecentSearchHistory(defaults: UserDefaults(suiteName: suite) ?? UserDefaults(), now: times.next)
    )
  }

  func settle() async {
    await wordKnowledge.flush()
    await wordLists.flush()
    await translations.flush()
    await sync.flush()
  }

  func serve(
    tokenLifetime: TimeInterval = 15 * 60,
    profile: StubReply = .json(200, AccountFixture.profile()),
    sync: @escaping @Sendable (StubSyncRequest) -> StubReply = { request in
      StubSync.answer(results: StubSync.applied(request), cursor: "cursor-1")
    },
    subscription: @escaping @Sendable (StubRequest) -> StubReply = { _ in
      .error(404, "not_found")
    },
    files: @escaping @Sendable (StubRequest) -> StubReply = { _ in .error(404, "not_found") },
    deletion: StubReply = .json(200, ["status": "deleted"]),
    patched: StubReply = .json(200, AccountFixture.profile(name: "Kana Fan", version: 2)),
    profiles: StubProfiles? = nil,
    signsInAs signedInID: String = AccountFixture.userID
  ) {
    let accessToken = StubTokens.access(expiresAt: now + tokenLifetime)
    server.respond { request in
      switch request.route {
      case "GET /v1/auth/token":
        .json(200, ["token": accessToken])
      case "POST /v1/auth/email-otp/send-verification-otp":
        .json(200, ["success": true])
      case "POST /v1/auth/sign-in/email-otp", "POST /v1/auth/sign-in/social":
        .json(200, Self.signedIn(as: signedInID), headers: ["set-auth-token": Self.sessionToken])
      case "POST /v1/auth/sign-in/nonce":
        .json(200, ["nonce": Self.nonce])
      case "POST /v1/sync":
        sync(request.sync)
      case "POST /v1/auth/sign-out":
        .json(200, ["success": true])
      case "GET /v1/auth/list-accounts":
        .json(200, [["providerId": "email", "accountId": Self.email]])
      case "GET /v1/me":
        profiles?.reply(to: request) ?? profile
      case "PATCH /v1/me":
        profiles?.reply(to: request) ?? patched
      case "DELETE /v1/me":
        deletion
      case "GET /v1/me/subscription", "POST /v1/me/subscription/apple":
        subscription(request)
      default:
        request.path.hasPrefix("/v1/photos/") ? files(request) : .error(404, "not_found")
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

  func syncAcrossAnotherSignIn(holding held: LaterReply, until reply: StubReply) async throws {
    let running = Task { try await sync.sync() }
    await held.asked()
    sync.endSession()
    await sync.begin(
      AccountSignIn(
        sessionToken: "session-2.signed", userID: "learner-2", email: "second@example.com"))
    held.send(reply)
    try await running.value
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

  static func twoPhones() async -> (
    service: FakeAccountService, phone: AccountFixture, pad: AccountFixture
  ) {
    let server = StubAccountServer()
    let service = FakeAccountService(on: server)
    let phone = AccountFixture(server: server)
    let pad = AccountFixture(server: server)
    await phone.launch()
    await pad.launch()
    return (service, phone, pad)
  }

  static func caughtUp(
    from syncedEntities: [String]?, after prepare: (AccountFixture) -> Void
  ) async throws -> (fixture: AccountFixture, request: StubSyncRequest) {
    let fixture = AccountFixture()
    fixture.serve()
    await fixture.launch()
    prepare(fixture)
    try await fixture.signIn()
    try await fixture.storeSyncedEntities(syncedEntities)
    await fixture.launch()
    try await fixture.syncNow()
    return (fixture, fixture.server.requests(to: "POST /v1/sync").last?.sync ?? StubSyncRequest())
  }

  func storeSyncedEntities(_ entities: [String]?) async throws {
    await settle()
    let file = directory.appending(path: "account-sync.json")
    var stored = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any]
    var state = stored?["state"] as? [String: Any]
    state?["syncedEntities"] = entities
    stored?["state"] = state
    try JSONSerialization.data(withJSONObject: stored ?? [:]).write(to: file)
  }

  func watch(_ videoID: String, title: String = "日本の朝ごはん", position: TimeInterval? = nil) {
    guard let id = YouTubeVideoID(rawValue: videoID) else { return }
    watchHistory.record(id) { video in
      video.title = title
      video.position = position ?? video.position
    }
  }

  var favorites: UUID { wordLists.lists[0].id }

  var queuedOperations: [String] {
    sync.state.queue.map { "\($0.key.entity) \($0.operation) \($0.key.entityID)" }
  }

  nonisolated static func profile(name: String = "", username: String? = nil, version: Int = 1)
    -> [String: Any]
  {
    [
      "id": userID, "name": name, "username": username ?? NSNull(), "email": email,
      "version": version, "createdAt": "2026-10-06T10:00:00.000Z",
      "updatedAt": "2026-10-06T10:00:00.000Z",
    ]
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
