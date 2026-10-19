import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account sync: photo files going up and coming down")
struct AccountSyncFileTests {
  private typealias Fixture = AccountFixture
  private let taberu = EncounterWordReference(
    id: SavedItemID(rawValue: AccountFixture.taberu), headword: "食べる", reading: "たべる")

  private func photo(_ number: Int) -> Data { Data("写真\(number)".utf8) }

  private func save(_ count: Int, in fixture: Fixture) async {
    for number in 0..<count {
      await fixture.media.save(
        EncounterMediaAttachment(name: "\(number).jpg", data: photo(number)), for: taberu)
    }
  }

  private func uploads(of data: Data, on fixture: Fixture) -> Int {
    fixture.server.requests(to: "PUT /v1/photos/\(data.sha256)").count
  }

  private func downloads(of data: Data, on fixture: Fixture) -> Int {
    fixture.server.requests(to: "GET /v1/photos/\(data.sha256)").count
  }

  private func shown(in fixture: Fixture) async -> Int { await fixture.media.library().count }

  private func waitingDownload(
    _ reply: StubReply
  ) async throws -> (service: FakeAccountService, pad: Fixture) {
    let (service, phone, pad) = await Fixture.twoPhones()
    await save(1, in: phone)
    try await phone.signIn()
    service.refuseFiles(reply, on: "GET")
    try await pad.signIn()
    return (service, pad)
  }

  @Test(
    "a file the account refuses stays on the device and says why; one refused as too many goes again the next time the app opens",
    arguments: [(409, "too_many_photos", true), (413, "too_large", false), (415, "unsupported_photo", false)])
  func refusedFiles(status: Int, code: String, retries: Bool) async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    service.refuseFiles(.error(status, code))
    await save(1, in: phone)
    try await phone.signIn()
    #expect(phone.sync.state.refusedPhotos == [photo(0).sha256: code])
    #expect(AccountMessage.refusedPhotos(phone.sync.state.refusedPhotos).count == 1)

    service.refuseFiles(nil)
    await phone.launch()
    try await phone.syncNow()
    #expect(uploads(of: photo(0), on: phone) == (retries ? 2 : 1))
    #expect(service.liveKeys(for: Fixture.email, entity: "photo").count == (retries ? 1 : 0))
    #expect(service.liveKeys(for: Fixture.email, entity: "photoWord").count == (retries ? 1 : 0))
  }

  @Test(
    "a download cut off, or answered 5xx, is tried again at the next sync",
    arguments: [StubReply.offline, .error(503, "unavailable")])
  func retriedDownload(_ reply: StubReply) async throws {
    let (service, pad) = try await waitingDownload(reply)
    #expect(await shown(in: pad) == 0)
    #expect(pad.sync.photosOnTheirWay == 1)

    service.refuseFiles(nil, on: "GET")
    try await pad.syncNow()
    #expect(await shown(in: pad) == 1)
    #expect(pad.sync.photosOnTheirWay == 0)
  }

  @Test("a download answered 429 waits the seconds it's told before trying again, not the same sync")
  func downloadRetryAfter() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    await save(1, in: phone)
    try await phone.signIn()
    service.refuseFiles(.error(429, "too_many_requests", headers: ["Retry-After": "7"]), on: "GET")
    var waits: [TimeInterval] = []
    pad.sync.onRetryFiles = { waits.append($0) }
    try await pad.signIn()
    #expect(downloads(of: photo(0), on: pad) == 1)
    #expect(waits == [7])

    service.refuseFiles(nil, on: "GET")
    try await pad.syncNow()
    #expect(await shown(in: pad) == 1)
  }

  @Test("an upload answered 429 waits the seconds it's told, and the queue keeps the photo")
  func uploadRetryAfter() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.serve(files: { _ in .error(429, "too_many_requests", headers: ["Retry-After": "120"]) })
    await save(1, in: fixture)
    await fixture.account.scheduler.refresh()

    #expect(fixture.account.scheduler.remainingWait(atLeast: 0) == 120)
    #expect(fixture.queuedOperations.count == 2)
    fixture.account.scheduler.stop()
  }

  @Test("a photo whose upload was cut off goes again, and the files that went before it don't")
  func cutOffUpload() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    await save(3, in: phone)
    service.dropUpload(of: photo(2).sha256)
    try? await phone.signIn()
    try await phone.syncNow()

    #expect((0..<3).map { uploads(of: photo($0), on: phone) } == [1, 1, 2])
    #expect(service.liveKeys(for: Fixture.email, entity: "photo").count == 3)
  }

  @Test("settings and the profile photo go in the first request, beside at most four photos")
  func photosDontHoldUpTheRest() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    await save(10, in: phone)
    phone.defaults.set(1.5, forKey: TranslateExperience.speechSpeedKey)
    await phone.profile.setPhoto(try ProfilePhotoImage.png())
    try await phone.signIn()

    let first = try #require(phone.server.requests(to: "POST /v1/sync").first?.sync.mutations)
    #expect(first.filter { $0.entity == "photo" }.count == AccountSync.filesPerRequest)
    #expect(first.contains { $0.entity == "setting" })
    #expect(first.contains { $0.entity == "profilePhoto" })
    #expect(service.liveKeys(for: Fixture.email, entity: "photo").count == 10)
    #expect(service.liveKeys(for: Fixture.email, entity: "photoWord").count == 10)
  }

  @Test("a downloaded photo the device can't save yet is tried again at the next sync, with its word")
  func unsavedDownload() async throws {
    let (_, phone, pad) = await Fixture.twoPhones()
    await save(1, in: phone)
    try await phone.signIn()
    let index = pad.directory.appending(path: "Encounter Media/index.json")
    try FileManager.default.createDirectory(at: index, withIntermediateDirectories: true)
    try await pad.signIn()
    #expect(await shown(in: pad) == 0)
    #expect(pad.sync.photosOnTheirWay == 1)

    try FileManager.default.removeItem(at: index)
    try await pad.syncNow()
    #expect(await pad.media.library().flatMap { $0.words.map(\.headword) } == ["食べる"])
  }

  @Test(
    "a download on its way across a sign-out and another sign-in leaves the new account's sync alone",
    .timeLimit(.minutes(1)))
  func downloadAcrossAnotherSignIn() async throws {
    let fixture = try await Fixture.afterSignIn()
    let held = HeldReply()
    let file = photo(0)
    fixture.serve(
      sync: { _ in
        StubSync.answer(
          changes: [
            StubSync.put(
              "photo", file.sha256, 1,
              ["id": file.sha256, "name": "0.jpg", "savedAt": "2026-10-06T10:00:00.000Z"])
          ], cursor: "c2")
      },
      files: { _ in held.after(.answer(status: 200, headers: [:], body: file)) })
    let sync = Task { try await fixture.sync.sync() }
    while fixture.server.requests(to: "GET /v1/photos/\(file.sha256)").isEmpty {
      try await Task.sleep(for: .milliseconds(5))
    }
    fixture.sync.endSession()
    await fixture.sync.begin(
      AccountSignIn(sessionToken: "session-2.signed", userID: "learner-2", email: "second@example.com"))
    held.letGo()
    try await sync.value

    #expect(!held.wasNeverLetGo, "the held download was never let go")
    #expect(await shown(in: fixture) == 0)
    #expect(fixture.sync.state.waitingFiles.isEmpty)
    #expect(fixture.sync.account?.userID == "learner-2")
  }
}
