import Foundation
import Testing
import TranslatorCore

@testable import SearchExperience

@MainActor
@Suite("Account sync: Translate bookmarks")
struct AccountSyncBookmarkTests {
  private typealias Fixture = AccountFixture
  private let privateWords = "誰にも言わないでね。"

  private func conversation(in fixture: Fixture) -> Conversation {
    let conversation = Conversation(
      startedAt: fixture.now, mode: .conversation,
      turns: [
        ConversationTurn(
          language: .japanese, startedAt: fixture.now,
          sentences: [TranslatedSentence(text: "駅はどこですか？", translation: "Where's the station?")]
        ),
        ConversationTurn(
          language: .english, startedAt: fixture.now,
          sentences: [TranslatedSentence(text: privateWords, translation: "Don't tell anyone.")]),
      ])
    fixture.translations.save(conversation)
    return conversation
  }

  private func bookmarkFirst(of conversation: Conversation, in fixture: Fixture) -> UUID {
    let id = conversation.turns[0].sentences[0].id
    fixture.translations.setBookmarked(true, sentence: id, in: conversation.id)
    return id
  }

  private func key(_ id: UUID) -> String { "bookmarkedSentence:\(id.uuidString.lowercased())" }

  private func pullBookmark(_ id: UUID, into fixture: Fixture) async throws {
    fixture.serve { request in
      StubSync.answer(
        results: StubSync.applied(request),
        changes: [StubSync.bookmark(id, text: "向こうの文。", version: 1)], cursor: "c2")
    }
    try await fixture.syncNow()
  }

  @Test("the first sync uploads each bookmarked sentence, and nothing else said")
  func firstSyncUploadsBookmarksOnly() async throws {
    let fixture = Fixture()
    fixture.serve()
    await fixture.launch()
    let saved = conversation(in: fixture)
    let id = bookmarkFirst(of: saved, in: fixture)

    try await fixture.signIn()

    let request = try #require(fixture.server.requests(to: "POST /v1/sync").first)
    let bookmarks = request.sync.mutations.filter { $0.entity == "bookmarkedSentence" }
    #expect(bookmarks.map(\.entityId) == [id.uuidString.lowercased()])
    #expect(bookmarks.first?.operation == "add")
    #expect(bookmarks.first?.baseVersion == 0)
    #expect(
      bookmarks.first?.fields == [
        "text": .string("駅はどこですか？"), "translation": .string("Where's the station?"),
        "language": .string("ja"),
        "bookmarkedAt": .string(
          Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(fixture.now)),
      ])
    let body = String(decoding: request.body, as: UTF8.self)
    #expect(!body.contains(privateWords))
    #expect(!body.contains(saved.id.uuidString.lowercased()))
  }

  @Test("bookmarking queues an add, and un-bookmarking a remove at its version")
  func queuesChanges() async throws {
    let fixture = try await Fixture.afterSignIn()
    let saved = conversation(in: fixture)
    let id = bookmarkFirst(of: saved, in: fixture)
    try await fixture.syncNow()
    #expect(fixture.sync.state.versions[key(id)] == 1)

    fixture.server.respond { _ in .offline }
    fixture.translations.setBookmarked(false, sentence: id, in: saved.id)
    #expect(fixture.queuedOperations == ["bookmarkedSentence remove \(id.uuidString.lowercased())"])
    #expect(fixture.sync.state.queue.first?.baseVersion == 1)
  }

  @Test("a bookmark from another device shows alone in Bookmarked, until it's removed there")
  func bookmarkFromElsewhere() async throws {
    let fixture = try await Fixture.afterSignIn()
    let elsewhere = UUID()
    try await pullBookmark(elsewhere, into: fixture)
    let listed = try #require(fixture.translations.bookmarks.first)
    #expect(listed.conversationID == nil)
    #expect(listed.sentence.text == "向こうの文。")
    #expect(listed.sentence.translation == "Said elsewhere.")

    fixture.serve { _ in
      StubSync.answer(
        changes: [StubSync.gone("bookmarkedSentence", elsewhere.uuidString.lowercased(), version: 2)],
        cursor: "c3")
    }
    try await fixture.syncNow()
    #expect(fixture.translations.bookmarks.isEmpty)
  }

  @Test("un-bookmarking one from another device here removes it from the account")
  func removeOneFromElsewhere() async throws {
    let fixture = try await Fixture.afterSignIn()
    let elsewhere = UUID()
    try await pullBookmark(elsewhere, into: fixture)
    fixture.server.respond { _ in .offline }
    fixture.translations.setBookmarked(false, sentence: elsewhere, in: nil)
    #expect(fixture.translations.bookmarks.isEmpty)
    #expect(fixture.queuedOperations == ["bookmarkedSentence remove \(elsewhere.uuidString.lowercased())"])
  }

  @Test("an un-bookmark that lost to a newer bookmark elsewhere bookmarks the sentence again")
  func removeLosesToANewerAdd() async throws {
    let fixture = try await Fixture.afterSignIn()
    let saved = conversation(in: fixture)
    let id = bookmarkFirst(of: saved, in: fixture)
    try await fixture.syncNow()
    fixture.translations.setBookmarked(false, sentence: id, in: saved.id)
    fixture.serve { request in
      StubSync.answer(
        results: request.mutations.map {
          StubSync.conflict($0.id, StubSync.bookmark(id, text: "駅はどこですか？", version: 3))
        }, cursor: "c2")
    }
    try await fixture.syncNow()
    #expect(fixture.translations.bookmarks.map(\.conversationID) == [saved.id])
  }

  @Test("a bookmark the account refuses is taken back off the sentence")
  func rejectedBookmark() async throws {
    let fixture = try await Fixture.afterSignIn()
    let saved = conversation(in: fixture)
    _ = bookmarkFirst(of: saved, in: fixture)
    fixture.serve { request in
      StubSync.answer(
        results: request.mutations.map { StubSync.rejected($0.id, "too_many_bookmarks") },
        cursor: "c2")
    }
    try await fixture.syncNow()
    #expect(fixture.translations.bookmarks.isEmpty)
  }

  @Test("deleting a conversation removes its bookmarks from the account")
  func deletingAConversation() async throws {
    let fixture = try await Fixture.afterSignIn()
    let saved = conversation(in: fixture)
    let id = bookmarkFirst(of: saved, in: fixture)
    try await fixture.syncNow()
    fixture.server.respond { _ in .offline }
    fixture.translations.delete(saved.id)
    #expect(fixture.queuedOperations == ["bookmarkedSentence remove \(id.uuidString.lowercased())"])
  }

  @Test("a synced bookmarks file this version can't read stops sync, rather than losing bookmarks")
  func unreadableBookmarksStopSync() async throws {
    let fixture = try await Fixture.afterSignIn()
    #expect(fixture.sync.canSync)
    let folder = fixture.directory.appending(path: "Translate Conversations/Synced Bookmarks")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    try Data(#"{"version":2,"bookmarks":[]}"#.utf8).write(to: folder.appending(path: "bookmarks.json"))
    await fixture.launch()
    #expect(fixture.translations.bookmarksAreReadOnly)
    #expect(!fixture.sync.canSync)
  }

  @Test("a phone that synced before bookmarks did uploads them once, from no cursor")
  func catchesUpOnBookmarks() async throws {
    let (_, caughtUp) = try await Fixture.caughtUp(
      from: SyncEntity.firstSynced + [SyncEntity.watchedVideo]
    ) { fixture in _ = bookmarkFirst(of: conversation(in: fixture), in: fixture) }
    #expect(caughtUp.cursor == nil)
    #expect(caughtUp.mutations.map(\.entity) == ["bookmarkedSentence"])
  }

  @Test("a bookmark on one phone shows on the other, and un-bookmarking it there clears it here")
  func twoPhones() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    let saved = conversation(in: phone)
    let id = bookmarkFirst(of: saved, in: phone)
    try await phone.signIn()
    try await pad.signIn()
    #expect(pad.translations.bookmarks.map(\.sentence.text) == ["駅はどこですか？"])
    #expect(pad.translations.conversations.isEmpty)

    pad.translations.setBookmarked(false, sentence: id, in: nil)
    try await pad.syncNow()
    try await phone.syncNow()

    #expect(phone.translations.bookmarks.isEmpty)
    #expect(phone.translations.conversation(saved.id)?.sentences.count == 2)
    #expect(service.liveKeys(for: Fixture.email, entity: "bookmarkedSentence").isEmpty)
  }
}
