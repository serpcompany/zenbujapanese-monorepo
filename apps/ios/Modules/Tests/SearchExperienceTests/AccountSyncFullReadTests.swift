import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account sync: reading everything again")
struct AccountSyncFullReadTests {
  private typealias Fixture = AccountFixture
  private let taberu = SavedItemID(rawValue: AccountFixture.taberu)
  private let ramen = "ramenVideo1"
  private let watched = "2026-10-19T09:00:00.000Z"

  nonisolated private static func note(_ id: String, _ text: String) -> [String: Any] {
    StubSync.put(
      SyncEntity.wordNote, id, 1,
      [
        "id": id, "itemId": AccountFixture.taberu, "text": text, "headword": NSNull(),
        "reading": NSNull(),
      ])
  }

  private func forgetANoteDeletion(by fixture: Fixture, in service: FakeAccountService) async throws {
    let deleted = UUID().uuidString.lowercased()
    await fixture.notes.save(LearnerWordNote(id: deleted, text: "朝"), for: taberu)
    try await fixture.syncNow()
    await fixture.notes.save(LearnerWordNote(id: deleted, text: ""), for: taberu)
    try await fixture.syncNow()
    service.forget("wordNote:\(deleted)", for: Fixture.email)
  }

  @Test("a device signing in reads every page of an account that forgot a removal past its first page, with no 410")
  func fullReadPastAForgottenRemoval() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    service.setPageSize(2)
    try await phone.signIn()
    for text in ["一", "二", "三"] { await phone.notes.save(LearnerWordNote(text: text), for: taberu) }
    try await forgetANoteDeletion(by: phone, in: service)

    try await pad.signIn()

    #expect(service.invalidCursors == 0)
    #expect(Set(await pad.notes.load(taberu).map(\.text)) == ["一", "二", "三"])
    #expect(pad.sync.state.rereadSeen == nil)
  }

  @Test("a device away past what the account forgot gets one 410, reads every page again, and drops what's gone, keeping what it wrote meanwhile")
  func rereadDropsWhatTheAccountForgot() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    service.setPageSize(2)
    let deleted = UUID().uuidString.lowercased()
    try await phone.signIn()
    await phone.notes.save(LearnerWordNote(id: deleted, text: "朝"), for: taberu)
    for text in ["夜", "晩"] { await phone.notes.save(LearnerWordNote(text: text), for: taberu) }
    try await phone.syncNow()
    try await pad.signIn()
    await phone.notes.save(LearnerWordNote(id: deleted, text: ""), for: taberu)
    try await phone.syncNow()
    service.forget("wordNote:\(deleted)", for: Fixture.email)
    await pad.notes.save(LearnerWordNote(text: "昼"), for: taberu)

    try await pad.syncNow()

    #expect(service.invalidCursors == 1)
    #expect(Set(await pad.notes.load(taberu).map(\.text)) == ["夜", "晩", "昼"])
    #expect(pad.sync.state.versions["wordNote:\(deleted)"] == nil)
    #expect(pad.sync.state.rereadSeen == nil)
    try await phone.syncNow()
    #expect(Set(await phone.notes.load(taberu).map(\.text)) == ["夜", "晩", "昼"])
  }

  @Test("a catch-up read from no cursor drops what the account forgot since, with no 410")
  func catchUpReadDropsWhatTheAccountForgot() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    let deleted = UUID().uuidString.lowercased()
    try await phone.signIn()
    await phone.notes.save(LearnerWordNote(id: deleted, text: "朝"), for: taberu)
    try await phone.syncNow()
    try await pad.signIn()
    await phone.notes.save(LearnerWordNote(id: deleted, text: ""), for: taberu)
    try await phone.syncNow()
    service.forget("wordNote:\(deleted)", for: Fixture.email)
    try await pad.storeSyncedEntities(SyncEntity.uploaded.filter { $0 != SyncEntity.setting })
    await pad.launch()

    try await pad.syncNow()

    #expect(service.invalidCursors == 0)
    #expect(await pad.notes.load(taberu).isEmpty)
    #expect(pad.sync.state.versions["wordNote:\(deleted)"] == nil)
  }

  @Test("a read after a 410 that stops partway drops nothing until it reaches its end, across a relaunch, and drops only notes, photos, and photo words")
  func rereadCutOff() async throws {
    let fixture = Fixture()
    let (gone, kept) = (UUID().uuidString.lowercased(), UUID().uuidString.lowercased())
    fixture.serve { [ramen, watched] request in
      StubSync.answer(
        results: StubSync.applied(request),
        changes: [
          StubSync.knownWord(Fixture.taberu, known: true, version: 1),
          StubSync.watchedVideo(ramen, at: watched, version: 1), Self.note(gone, "朝"),
          Self.note(kept, "夜"),
        ], cursor: "cursor-1")
    }
    await fixture.launch()
    try await fixture.signIn()
    let calls = CallCount()
    fixture.serve { request in
      switch request.cursor {
      case "cursor-1": .error(410, "invalid_cursor")
      case nil:
        StubSync.answer(
          results: StubSync.applied(request), changes: [Self.note(kept, "夜")], cursor: "page-1",
          hasMore: true)
      default: calls.next() == 1 ? .offline : StubSync.answer(cursor: "page-2")
      }
    }

    await #expect(throws: (any Error).self) { try await fixture.syncNow() }
    #expect(fixture.sync.state.cursor == "page-1")
    #expect(Set(await fixture.notes.load(taberu).map(\.text)) == ["朝", "夜"])
    fixture.account.scheduler.stop()
    await fixture.launch()
    try await fixture.syncNow()

    #expect(await fixture.notes.load(taberu).map(\.text) == ["夜"])
    #expect(fixture.sync.state.versions["wordNote:\(gone)"] == nil)
    #expect(fixture.wordKnowledge.isKnown(storedID: Fixture.taberu))
    #expect(fixture.watchHistory.videos.map(\.videoID) == [ramen])
    #expect(fixture.sync.state.rereadSeen == nil)
  }

  @Test("a 410 during a read from no cursor stops the sync, says so, and waits to start again rather than looping")
  func invalidCursorDuringAFullRead() async throws {
    let fixture = try await Fixture.afterSignIn()
    let refusals = CallCount()
    fixture.serve { request in
      switch request.cursor {
      case nil: StubSync.answer(results: StubSync.applied(request), cursor: "page-1", hasMore: true)
      case "page-1" where refusals.next() > 3: StubSync.answer(cursor: "page-2")
      default: .error(410, "invalid_cursor")
      }
    }
    let sent = fixture.server.requests(to: "POST /v1/sync").count

    var failure: Error?
    do { try await fixture.syncNow() } catch { failure = error }

    let cursors = fixture.server.requests(to: "POST /v1/sync").dropFirst(sent).map(\.sync.cursor)
    #expect(cursors == ["cursor-1", nil, "page-1"])
    #expect(fixture.sync.lastFailure?.isInvalidCursor == true)
    #expect(
      AccountMessage.text(for: try #require(failure))
        == "Sync is reading everything in your account again, and tries again on its own soon.")
    let delay = SyncRetry.delay(after: try #require(failure), failures: 0) { $0.upperBound }
    #expect(delay == SyncRetry.firstDelay)
    #expect(fixture.sync.state.cursor == nil)
    #expect(fixture.sync.state.rereadSeen == [])
  }

  @Test("a photo the account refused stays on the device through a read after a 410, whether the account forgot it or still names it deleted")
  func refusedPhotosSurviveAFullRead() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    let word = EncounterWordReference(id: taberu, headword: "食べる", reading: "たべる")
    let photos = [Data("一枚目".utf8), Data("二枚目".utf8)]
    let save = {
      for (number, data) in photos.enumerated() {
        await phone.media.save(EncounterMediaAttachment(name: "\(number).jpg", data: data), for: word)
      }
    }
    await save()
    try await phone.signIn()
    for data in photos { await phone.media.deleteMedia(data.sha256) }
    try await phone.syncNow()
    service.refuseFiles(.error(409, AccountSync.tooManyPhotos))
    await save()
    try await phone.syncNow()
    service.refuseFiles(nil)
    service.forget("photo:\(photos[0].sha256)", for: Fixture.email)
    try await pad.signIn()
    try await forgetANoteDeletion(by: pad, in: service)

    try await phone.syncNow()

    #expect(service.invalidCursors == 1)
    #expect(await phone.media.library().count == 2)
    #expect(Set(phone.sync.state.refusedPhotos.keys) == Set(photos.map(\.sha256)))
  }
}
