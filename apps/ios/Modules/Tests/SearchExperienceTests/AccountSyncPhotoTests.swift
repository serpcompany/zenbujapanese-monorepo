import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account sync: photos and the profile photo")
struct AccountSyncPhotoTests {
  private typealias Fixture = AccountFixture
  private let photo = Data("朝ごはんの写真".utf8)
  private let taberu = EncounterWordReference(
    id: SavedItemID(rawValue: AccountFixture.taberu), headword: "食べる", reading: "たべる")
  private let miru = EncounterWordReference(
    id: SavedItemID(rawValue: AccountFixture.miru), headword: "見る", reading: "みる")

  private var photoID: String { photo.sha256 }

  private func save(on word: EncounterWordReference, in fixture: Fixture) async {
    await fixture.media.save(EncounterMediaAttachment(name: "朝.jpg", data: photo), for: word)
  }

  private func words(in fixture: Fixture) async -> Set<String> {
    Set(await fixture.media.library().flatMap { $0.words.map(\.headword) })
  }

  private func downloads(on fixture: Fixture) -> Int {
    fixture.server.requests(to: "GET /v1/photos/\(photoID)").count
  }

  @Test("a photo saved on one phone uploads its file before the change that names it, then shows on the other with its word")
  func photoOnTwoPhones() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    await save(on: taberu, in: phone)
    try await phone.signIn()
    let routes = phone.server.requests.map(\.route).filter {
      $0.hasPrefix("PUT /v1/photos/") || $0 == "POST /v1/sync"
    }
    #expect(routes.prefix(2) == ["PUT /v1/photos/\(photoID)", "POST /v1/sync"])
    #expect(service.file(photoID, for: Fixture.email) == photo)

    try await pad.signIn()
    #expect(await words(in: pad) == ["食べる"])
    #expect(await pad.media.fileData(photoID) == photo)
  }

  @Test("removing a photo's last word sends only the word's removal, and a word added on a phone that hadn't seen it brings the photo back to both")
  func lastWordRemoved() async throws {
    let (_, phone, pad) = await Fixture.twoPhones()
    await save(on: taberu, in: phone)
    try await phone.signIn()
    try await pad.signIn()

    await phone.media.remove(taberu, mediaID: photoID)
    try await phone.syncNow()
    let sent = phone.server.requests(to: "POST /v1/sync").last?.sync.mutations
    #expect(sent?.map { "\($0.entity) \($0.operation)" } == ["photoWord remove"])
    await save(on: miru, in: pad)
    try await pad.syncNow()
    try await phone.syncNow()

    #expect(await words(in: pad) == ["見る"])
    #expect(await words(in: phone) == ["見る"])
  }

  @Test("deleting a photo in the Media Library deletes it and its words on the other phone, and drops a word added there since")
  func photoDeleted() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    await save(on: taberu, in: phone)
    try await phone.signIn()
    try await pad.signIn()

    await phone.media.deleteMedia(photoID)
    try await phone.syncNow()
    await save(on: miru, in: pad)
    try await pad.syncNow()

    #expect(await pad.media.library().isEmpty)
    #expect(pad.sync.state.queue.isEmpty)
    #expect(service.file(photoID, for: Fixture.email) == nil)
    #expect(service.liveKeys(for: Fixture.email, entity: "photoWord").isEmpty)
  }

  @Test("a photo whose file the account lost is never deleted: it waits for the app's next launch, and shows once the file is back")
  func missingFile() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    await save(on: taberu, in: phone)
    try await phone.signIn()
    service.loseFile(photoID, for: Fixture.email)

    try await pad.signIn()
    try await pad.syncNow()
    #expect(downloads(on: pad) == 1)
    #expect(await pad.media.library().isEmpty)
    #expect(pad.sync.state.queue.isEmpty)

    service.restoreFile(photo, for: Fixture.email)
    await pad.launch()
    try await pad.syncNow()
    #expect(downloads(on: pad) == 2)
    #expect(await words(in: pad) == ["食べる"])
    #expect(service.liveKeys(for: Fixture.email, entity: "photo").count == 1)
  }

  @Test("a download answered 402, not subscribed, waits for the app's next launch too")
  func downloadNotSubscribed() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    await save(on: taberu, in: phone)
    try await phone.signIn()
    service.refuseFiles(.error(402, "subscription_required"), on: "GET")

    try await pad.signIn()
    try await pad.syncNow()
    #expect(downloads(on: pad) == 1)
    #expect(await pad.media.library().isEmpty)
    #expect(pad.sync.state.queue.isEmpty)
  }

  @Test("a photo the device already holds is never downloaded: two phones that saved one image share it")
  func heldFileNotDownloaded() async throws {
    let (_, phone, pad) = await Fixture.twoPhones()
    await save(on: taberu, in: phone)
    await save(on: miru, in: pad)
    try await phone.signIn()
    try await pad.signIn()
    try await phone.syncNow()

    #expect(downloads(on: phone) == 0)
    #expect(await words(in: pad) == ["食べる", "見る"])
    #expect(await words(in: phone) == ["食べる", "見る"])
  }

  @Test("a file the service refuses stays on the device with its word, and the rest still syncs")
  func refusedFile() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    service.refuseFiles(.error(413, "too_large"))
    await save(on: taberu, in: phone)
    phone.markKnown(Fixture.miru)
    try await phone.signIn()

    #expect(await words(in: phone) == ["食べる"])
    #expect(phone.sync.state.queue.isEmpty)
    #expect(service.liveKeys(for: Fixture.email, entity: "photo").isEmpty)
    #expect(service.liveKeys(for: Fixture.email, entity: "knownWord").count == 1)
  }

  @Test("while the account has no photo storage, photos and their words wait, the rest syncs, and they go once it has")
  func photosUnavailable() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    service.setPhotosUnavailable(true)
    await save(on: taberu, in: phone)
    phone.markKnown(Fixture.miru)
    try await phone.signIn()
    #expect(
      Set(phone.queuedOperations) == [
        "photo add \(photoID)", "photoWord add \(photoID)/\(Fixture.taberu)",
      ])
    #expect(service.liveKeys(for: Fixture.email, entity: "knownWord").count == 1)

    service.setPhotosUnavailable(false)
    try await phone.syncNow()
    #expect(phone.sync.state.queue.isEmpty)
    #expect(service.liveKeys(for: Fixture.email, entity: "photoWord").count == 1)
  }

  @Test("a photo the account says isn't uploaded waits, with its word, for the next sync, and goes then")
  func notUploadedWaits() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    service.refuseFiles(.json(201, ["id": photoID]))
    await save(on: taberu, in: phone)
    try await phone.signIn()
    #expect(phone.server.requests(to: "PUT /v1/photos/\(photoID)").count == 1)
    #expect(
      Set(phone.queuedOperations) == [
        "photo add \(photoID)", "photoWord add \(photoID)/\(Fixture.taberu)",
      ])

    service.refuseFiles(nil)
    try await phone.syncNow()
    #expect(phone.sync.state.queue.isEmpty)
    #expect(service.liveKeys(for: Fixture.email, entity: "photoWord").count == 1)
    #expect(await words(in: phone) == ["食べる"])
  }

  @Test("a profile photo set on one phone shows on the other, and removing it there removes it here")
  func profilePhoto() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    try await phone.signIn()
    try await pad.signIn()

    await phone.profile.setPhoto(try ProfilePhotoImage.png())
    try await phone.syncNow()
    let jpeg = try #require(phone.profile.photoData)
    let key = "profilePhoto:\(service.userID(for: Fixture.email))"
    #expect(service.data(of: key, for: Fixture.email)?["photoId"] as? String == jpeg.sha256)
    try await pad.syncNow()
    #expect(pad.profile.photoData == jpeg)
    #expect(pad.profile.photo != nil)

    pad.profile.removePhoto()
    try await pad.syncNow()
    try await phone.syncNow()
    #expect(phone.profile.photo == nil)
    #expect(service.data(of: key, for: Fixture.email) == nil)
  }
}
