import Foundation
import Testing

@testable import TranslatorCore

@MainActor
@Suite("Conversation history")
final class ConversationHistoryTests {
  private let directory = FileManager.default.temporaryDirectory
    .appending(path: "translate-history-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
  private let today = Date(timeIntervalSince1970: 1_800_000_000)

  deinit {
    try? FileManager.default.removeItem(at: directory)
  }

  private func loadedHistory(at now: Date? = nil) async -> ConversationHistory {
    let today = today
    let history = ConversationHistory(directory: directory, now: { now ?? today })
    await history.flush()
    return history
  }

  private func shared(_ text: String, minutesAgo: Double) -> SharedBookmark {
    SharedBookmark(
      id: UUID(), text: text, translation: "Elsewhere.", language: .japanese,
      bookmarkedAt: today.addingTimeInterval(-minutesAgo * 60))
  }

  private func conversation(daysAgo: Int, saying text: String = "今日は東京駅に行きます。")
    -> Conversation
  {
    let startedAt = today.addingTimeInterval(-Double(daysAgo) * 86_400)
    var conversation = Conversation(
      startedAt: startedAt,
      mode: .conversation,
      turns: [
        ConversationTurn(
          language: .japanese, startedAt: startedAt,
          sentences: [TranslatedSentence(text: text, translation: "I'm going to Tokyo Station today.")]),
        ConversationTurn(
          language: .english, startedAt: startedAt,
          sentences: [TranslatedSentence(text: "Great.", translation: "いいですね。")]),
      ])
    conversation.updatedAt = startedAt
    return conversation
  }

  @Test("a bookmarked sentence survives a relaunch and is listed with its language")
  func bookmarks() async {
    let history = await loadedHistory()
    let saved = conversation(daysAgo: 0)
    history.save(saved)
    let sentence = saved.turns[1].sentences[0]
    history.setBookmarked(true, sentence: sentence.id, in: saved.id)
    await history.flush()

    let reloaded = await loadedHistory()
    #expect(reloaded.bookmarks.map(\.sentence.text) == ["Great."])
    #expect(reloaded.bookmarks.first?.language == .english)
    reloaded.setBookmarked(false, sentence: sentence.id, in: saved.id)
    #expect(reloaded.bookmarks.isEmpty)
  }

  @Test("the live conversation is left out of saved, search, bookmarks, and Delete All")
  func leavesOutLiveConversation() async {
    let history = await loadedHistory()
    let finished = conversation(daysAgo: 1)
    let live = conversation(daysAgo: 0)
    for conversation in [finished, live] { history.save(conversation) }
    history.setBookmarked(true, sentence: live.turns[1].sentences[0].id, in: live.id)
    history.liveConversationID = live.id

    #expect(history.saved.map(\.id) == [finished.id])
    #expect(history.search("東京駅").map(\.id) == [finished.id])
    #expect(history.bookmarks.isEmpty)
    history.deleteAll()
    #expect(history.conversations.map(\.id) == [live.id])

    history.liveConversationID = nil
    #expect(history.saved.map(\.id) == [live.id])
    #expect(history.bookmarks.map(\.conversationID) == [live.id])
  }

  @Test("a sentence saved before bookmarks existed reads as not bookmarked")
  func sentenceWithoutBookmarkField() throws {
    let json = #"{"id":"6F9619FF-8B86-D011-B42D-00CF4FC964FF","text":"はい。","translation":"Yes."}"#
    let sentence = try JSONDecoder().decode(TranslatedSentence.self, from: Data(json.utf8))
    #expect(!sentence.isBookmarked)
    #expect(sentence.translation == "Yes.")
  }

  @Test("saved conversations survive a relaunch, newest first")
  func persists() async {
    let history = await loadedHistory()
    let older = conversation(daysAgo: 2)
    let newer = conversation(daysAgo: 0)
    history.save(older)
    history.save(newer)
    await history.flush()

    let reloaded = await loadedHistory()
    #expect(reloaded.conversations == [newer, older])
  }

  @Test("saving again replaces the conversation rather than adding one")
  func upserts() async {
    let history = await loadedHistory()
    var draft = conversation(daysAgo: 0)
    history.save(draft)
    draft.turns[0].sentences.append(TranslatedSentence(text: "はい。", translation: "Yes."))
    history.save(draft)
    await history.flush()

    let reloaded = await loadedHistory()
    #expect(reloaded.conversations.count == 1)
    #expect(reloaded.conversations.first?.sentences.count == 3)
  }

  @Test("deleting one or all conversations removes their files")
  func deletes() async {
    let history = await loadedHistory()
    let first = conversation(daysAgo: 0)
    let second = conversation(daysAgo: 1)
    let third = conversation(daysAgo: 3)
    for conversation in [first, second, third] { history.save(conversation) }
    history.delete(second.id)
    await history.flush()
    #expect(await loadedHistory().conversations.map(\.id) == [first.id, third.id])

    history.deleteAll()
    await history.flush()
    #expect(history.conversations.isEmpty)
    #expect(await loadedHistory().conversations.isEmpty)
  }

  @Test("files this version can't read are skipped and left in place")
  func skipsUnreadableFiles() async throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let damaged = directory.appending(path: "\(UUID().uuidString).json")
    try Data("{\"version\":".utf8).write(to: damaged)
    var newer = conversation(daysAgo: 0)
    newer.version = Conversation.currentVersion + 1
    let newerFile = directory.appending(path: "\(newer.id.uuidString).json")
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .millisecondsSince1970
    try encoder.encode(newer).write(to: newerFile)

    let history = await loadedHistory()

    #expect(history.conversations.isEmpty)
    #expect(FileManager.default.fileExists(atPath: damaged.path))
    #expect(FileManager.default.fileExists(atPath: newerFile.path))
  }

  @Test("search matches the source or the translation, and the transcript pairs them")
  func searchAndTranscript() async {
    let history = await loadedHistory()
    let station = conversation(daysAgo: 0)
    let pharmacy = conversation(daysAgo: 1, saying: "この近くに薬局はありますか？")
    history.save(station)
    history.save(pharmacy)

    #expect(history.search("薬局").map(\.id) == [pharmacy.id])
    #expect(history.search("tokyo station").count == 2)
    #expect(history.search("  ").count == 2)
    #expect(
      station.transcript
        == "今日は東京駅に行きます。\nI'm going to Tokyo Station today.\n\nGreat.\nいいですね。")
  }

  @Test("bookmarking reports the sentence and when, and un-bookmarking reports it removed")
  func reportsBookmarks() async {
    let history = await loadedHistory()
    var changes: [BookmarkChange] = []
    history.bookmarkObserver = { changes.append($0) }
    let saved = conversation(daysAgo: 1)
    history.save(saved)
    let sentence = saved.turns[0].sentences[0]

    history.setBookmarked(true, sentence: sentence.id, in: saved.id)
    history.setBookmarked(true, sentence: sentence.id, in: saved.id)
    history.setBookmarked(false, sentence: sentence.id, in: saved.id)

    let bookmark = SharedBookmark(
      id: sentence.id, text: sentence.text, translation: sentence.translation,
      language: .japanese, bookmarkedAt: today)
    #expect(changes == [.added(bookmark), .removed(bookmark)])
    #expect(history.conversation(saved.id)?.sentences.first?.bookmarkedAt == nil)
  }

  @Test("a bookmark from another device is listed alone, survives a relaunch, and can be removed")
  func bookmarkWithoutItsConversation() async {
    let history = await loadedHistory()
    let elsewhere = shared("向こうで言ったこと。", minutesAgo: 5)
    history.applySynced(elsewhere)
    await history.flush()

    let reloaded = await loadedHistory()
    var changes: [BookmarkChange] = []
    reloaded.bookmarkObserver = { changes.append($0) }
    #expect(reloaded.bookmarks.map(\.conversationID) == [nil])
    #expect(reloaded.bookmarks.map(\.shared) == [elsewhere])
    #expect(reloaded.bookmarks.first?.sentence.isBookmarked == true)

    reloaded.setBookmarked(false, sentence: elsewhere.id, in: nil)
    #expect(reloaded.bookmarks.isEmpty)
    #expect(changes == [.removed(elsewhere)])
    await reloaded.flush()
    #expect(await loadedHistory().bookmarks.isEmpty)
  }

  @Test("a bookmark from another device for a sentence here marks it, and a removal clears it")
  func bookmarkForASentenceHere() async {
    let history = await loadedHistory()
    var changes: [BookmarkChange] = []
    history.bookmarkObserver = { changes.append($0) }
    let saved = conversation(daysAgo: 0)
    history.save(saved)
    let sentence = saved.turns[1].sentences[0]
    let bookmark = SharedBookmark(
      id: sentence.id, text: sentence.text, translation: sentence.translation,
      language: .english, bookmarkedAt: today)

    history.applySynced(bookmark)
    #expect(history.bookmarks.map(\.conversationID) == [saved.id])
    #expect(history.sharedOnly.isEmpty)
    history.applySyncedRemoval(ofBookmark: sentence.id)
    #expect(history.bookmarks.isEmpty)
    #expect(changes.isEmpty)
  }

  @Test("deleting a conversation reports each of its bookmarks removed")
  func deletingRemovesBookmarks() async {
    let history = await loadedHistory()
    let saved = conversation(daysAgo: 0)
    history.save(saved)
    for turn in saved.turns {
      history.setBookmarked(true, sentence: turn.sentences[0].id, in: saved.id)
    }
    var removed: [UUID] = []
    history.bookmarkObserver = { change in
      if case .removed(let bookmark) = change { removed.append(bookmark.id) }
    }
    history.delete(saved.id)
    #expect(Set(removed) == Set(saved.turns.map(\.sentences[0].id)))
  }

  @Test("bookmarks are listed newest first, from conversations and alone")
  func bookmarkOrder() async {
    let history = await loadedHistory(at: today.addingTimeInterval(-10 * 60))
    let saved = conversation(daysAgo: 0)
    history.save(saved)
    history.setBookmarked(true, sentence: saved.turns[0].sentences[0].id, in: saved.id)
    history.applySynced(shared("新しい", minutesAgo: 1))
    history.applySynced(shared("古い", minutesAgo: 60))
    #expect(history.bookmarks.map(\.sentence.text) == ["新しい", "今日は東京駅に行きます。", "古い"])
  }

  @Test("a synced bookmarks file this version can't read is left in place")
  func keepsUnreadableBookmarks() async throws {
    let folder = directory.appending(path: "Synced Bookmarks", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let file = folder.appending(path: "bookmarks.json")
    let newer = Data(#"{"version":2,"bookmarks":[]}"#.utf8)
    try newer.write(to: file)

    let history = await loadedHistory()
    history.applySynced(shared("上書きしない", minutesAgo: 0))
    await history.flush()

    #expect(try Data(contentsOf: file) == newer)
    #expect(await loadedHistory().conversations.isEmpty)
  }
}
