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
    "a file the account refuses stays on the device and says why; one refused as too many goes again at the next launch after a photo the account held is deleted, not one emptied or never synced",
    arguments: [(409, "too_many_photos", true), (413, "too_large", false), (415, "unsupported_photo", false)])
  func refusedFiles(status: Int, code: String, retries: Bool) async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    await save(2, in: phone)
    try await phone.signIn()
    try await pad.signIn()
    service.refuseFiles(.error(status, code))
    for number in 2..<4 {
      await phone.media.save(
        EncounterMediaAttachment(name: "\(number).jpg", data: photo(number)), for: taberu)
    }
    try await phone.syncNow()
    #expect(phone.sync.state.refusedPhotos == [photo(2).sha256: code, photo(3).sha256: code])
    #expect(AccountMessage.refusedPhotos(phone.sync.state.refusedPhotos).count == 1)
    service.refuseFiles(nil)

    await phone.media.deleteMedia(photo(3).sha256)
    await pad.media.remove(taberu, mediaID: photo(0).sha256)
    try await pad.syncNow()
    try await phone.syncNow()
    #expect(!phone.sync.state.photoRoomFreed)
    await phone.launch()
    try await phone.syncNow()
    #expect(uploads(of: photo(2), on: phone) == 1)

    await pad.media.deleteMedia(photo(1).sha256)
    try await pad.syncNow()
    try await phone.syncNow()
    #expect(phone.sync.state.photoRoomFreed)
    await phone.launch()
    try await phone.syncNow()
    #expect(uploads(of: photo(2), on: phone) == (retries ? 2 : 1))
    #expect(service.liveKeys(for: Fixture.email, entity: "photo").count == (retries ? 1 : 0))
    #expect(service.liveKeys(for: Fixture.email, entity: "photoWord").count == (retries ? 1 : 0))
  }

  @Test("the notes on refused photos and on photos on their way say one photo, or how many")
  func photoNotesCountPhotos() {
    let device = ThisDevice.name
    let full = AccountSync.tooManyPhotos
    #expect(
      AccountMessage.refusedPhotos(["a": full]) == [
        "Your Zenbu account holds as many photos as it can, so 1 stays on this \(device). Delete some in the Media Library, and it syncs the next time Zenbu opens."
      ])
    #expect(
      AccountMessage.refusedPhotos(["a": full, "b": full]) == [
        "Your Zenbu account holds as many photos as it can, so 2 stay on this \(device). Delete some in the Media Library, and they sync the next time Zenbu opens."
      ])
    #expect(
      AccountMessage.refusedPhotos(["a": "too_large"]) == [
        "1 photo is too large, or a kind of image Zenbu can't sync, so it stays on this \(device)."
      ])
    #expect(
      AccountMessage.refusedPhotos(["a": "too_large", "b": "unsupported_photo"]) == [
        "2 photos are too large, or a kind of image Zenbu can't sync, so they stay on this \(device)."
      ])
    #expect(AccountMessage.photosOnTheirWay(1) == "1 photo from your Zenbu account is on its way.")
    #expect(AccountMessage.photosOnTheirWay(2) == "2 photos from your Zenbu account are on their way.")
    #expect(
      AccountMessage.photosWaitForSubscription(1)
        == "Syncing needs a Zenbu subscription. 1 photo from your Zenbu account comes once you subscribe.")
    #expect(
      AccountMessage.photosWaitForSubscription(2)
        == "Syncing needs a Zenbu subscription. 2 photos from your Zenbu account come once you subscribe.")
  }

  @Test("a photo held back for a later request keeps its changes in order, so a deletion and a re-save after it end as the learner left them")
  func heldBackPhotoKeepsItsOrder() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    try await phone.signIn()
    await save(AccountSync.filesPerRequest + 1, in: phone)
    let last = photo(AccountSync.filesPerRequest)
    await phone.media.deleteMedia(last.sha256)
    let miru = EncounterWordReference(
      id: SavedItemID(rawValue: AccountFixture.miru), headword: "見る", reading: "みる")
    await phone.media.save(EncounterMediaAttachment(name: "again.jpg", data: last), for: miru)
    try await phone.syncNow()

    #expect(
      service.liveKeys(for: Fixture.email, entity: "photoWord").filter { $0.contains(last.sha256) }
        == ["photoWord:\(last.sha256)/\(AccountFixture.miru)"])
  }

  @Test("downloads from the account are saved together, each photo with its word")
  func downloadsSavedTogether() async throws {
    let (_, phone, pad) = await Fixture.twoPhones()
    await save(3, in: phone)
    try await phone.signIn()
    try await pad.signIn()
    #expect(await shown(in: pad) == 3)
    #expect(await pad.media.library().allSatisfy { $0.words.map(\.headword) == ["食べる"] })
  }

  @Test(
    "a download cut off, or answered 5xx, is tried again at the next sync",
    arguments: [StubReply.offline, .error(503, "unavailable")])
  func retriedDownload(_ reply: StubReply) async throws {
    let (service, pad) = try await waitingDownload(reply)
    #expect(await shown(in: pad) == 0)
    #expect(pad.sync.photosOnTheirWay == 1)
    #expect(pad.account.photosComing == AccountMessage.photosOnTheirWay(1))

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
    "a download on its way across a sign-out and another sign-in leaves the new account's sync alone, whether it arrives or fails",
    .timeLimit(.minutes(1)), arguments: [true, false])
  func downloadAcrossAnotherSignIn(arrives: Bool) async throws {
    let fixture = try await Fixture.afterSignIn()
    let held = LaterReply()
    let file = photo(0)
    let reply: StubReply =
      arrives ? .answer(status: 200, headers: [:], body: file) : .error(404, "photo_file_missing")
    fixture.serve(
      sync: { _ in
        StubSync.answer(
          changes: [
            StubSync.put(
              "photo", file.sha256, 1,
              ["id": file.sha256, "name": "0.jpg", "savedAt": "2026-10-06T10:00:00.000Z"])
          ], cursor: "c2")
      },
      files: { _ in .later(held) })
    try await fixture.syncAcrossAnotherSignIn(holding: held, until: reply)
    #expect(fixture.sync.photosOnTheirWay == 0)

    #expect(downloads(of: file, on: fixture) == 1)
    #expect(await shown(in: fixture) == 0)
    #expect(fixture.sync.state.waitingFiles.isEmpty)
    #expect(fixture.sync.state.missingFiles.isEmpty)
    #expect(fixture.sync.account?.userID == "learner-2")
  }
}
