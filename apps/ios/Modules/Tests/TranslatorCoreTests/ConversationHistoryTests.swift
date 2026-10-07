import Foundation
import Testing

@testable import TranslatorCore

@MainActor
@Suite("Conversation history")
final class ConversationHistoryTests {
  private let directory = FileManager.default.temporaryDirectory
    .appending(path: "translate-history-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
  private let defaults: UserDefaults
  private let suiteName = "translate-history-tests-\(UUID().uuidString)"
  private let today = Date(timeIntervalSince1970: 1_800_000_000)

  init() {
    defaults = UserDefaults(suiteName: suiteName)!
  }

  deinit {
    try? FileManager.default.removeItem(at: directory)
    UserDefaults().removePersistentDomain(forName: suiteName)
  }

  private func loadedHistory() async -> ConversationHistory {
    let history = ConversationHistory(directory: directory, defaults: defaults) { [today] in today }
    await history.flush()
    return history
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

  @Test("Keep History removes conversations older than the chosen period, now and at launch")
  func retention() async {
    let history = await loadedHistory()
    let recent = conversation(daysAgo: 3)
    let lastMonth = conversation(daysAgo: 45)
    let lastYear = conversation(daysAgo: 400)
    for conversation in [recent, lastMonth, lastYear] { history.save(conversation) }
    #expect(history.expiredCount(under: .thirtyDays) == 2)
    #expect(history.expiredCount(under: .oneYear) == 1)
    #expect(history.expiredCount(under: .forever) == 0)

    history.retention = .oneYear
    await history.flush()
    #expect(history.conversations.map(\.id) == [recent.id, lastMonth.id])

    defaults.set(HistoryRetention.thirtyDays.rawValue, forKey: ConversationHistory.retentionKey)
    let relaunched = await loadedHistory()
    #expect(relaunched.retention == .thirtyDays)
    #expect(relaunched.conversations.map(\.id) == [recent.id])
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
}
