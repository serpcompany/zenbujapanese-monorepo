import Foundation
import Testing
@testable import SearchExperience

@Suite("Account rules, from the cases the account service and the website share")
struct SharedAccountRulesTests {
  private struct WatchCases: Decodable {
    struct Number: Decodable {
      let covers: String
      let field: String
      let value: Double
      let fits: Bool
    }

    struct Sent: Decodable {
      let covers: String
      let typed: SharedAccountCases.Text
      let sent: SharedAccountCases.Text?
    }

    let texts: [Sent]
    let numbers: [Number]
  }

  private struct RecentOrder: Decodable {
    struct Videos: Decodable {
      let ids: [String]
      let newestFirst: [String]
    }

    struct Searches: Decodable {
      let searchKey: String
      let queries: [String]
      let newestFirst: [String]
    }

    let videos: Videos
    let searches: Searches
  }

  @MainActor
  private func loadedLists() async -> WordLists {
    let lists = WordLists(
      fileURL: FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).json"))
    await lists.flush()
    return lists
  }

  @Test("a name is sent to the account as the shared cases keep it, and not when they refuse it")
  func names() throws {
    let names = try SharedAccountCases.rule("name")
    for name in names.accepted {
      let typed = name.typed.value
      #expect(ProfileFields(name: typed).uploadable == ProfileFields(name: typed), "\(name.covers)")
    }
    for name in names.refused {
      #expect(ProfileFields(name: name.typed.value).uploadable.isEmpty, "\(name.covers)")
    }
  }

  @Test("a username is saved, refused, or removed as the shared cases say")
  func usernames() throws {
    let usernames = try SharedAccountCases.rule("username")
    let blank = Set((usernames.removes ?? []).map(\.typed.value))
    #expect(!blank.isEmpty)
    for username in usernames.accepted {
      #expect(
        UserProfile.usernameEdit(username.typed.value, over: "stored_name")
          == .save(username.kept.value), "\(username.covers)")
    }
    for username in usernames.refused where !blank.contains(username.typed.value) {
      #expect(
        UserProfile.usernameEdit(username.typed.value, over: "stored_name") == .refuse,
        "\(username.covers)")
    }
    for username in usernames.removes ?? [] {
      #expect(
        UserProfile.usernameEdit(username.typed.value, over: "stored_name") == .save(""),
        "\(username.covers)")
    }
  }

  @MainActor
  @Test("a list is made under the name the shared cases keep, and never under one they refuse")
  func listNames() async throws {
    let names = try SharedAccountCases.rule("list-name")
    for name in names.accepted {
      let lists = await loadedLists()
      #expect(lists.createList(named: name.typed.value)?.name == name.kept.value, "\(name.covers)")
    }
    for name in names.refused {
      let lists = await loadedLists()
      #expect(lists.createList(named: name.typed.value) == nil, "\(name.covers)")
    }
  }

  @MainActor
  @Test("a list named only an invisible byte order mark is never made, so a sync can't refuse it and take its words")
  func invisibleListName() async throws {
    let lists = await loadedLists()
    #expect(lists.createList(named: "\u{FEFF}") == nil)
    #expect(lists.createList(named: " \u{FEFF} ") == nil)
    let kept = try #require(lists.createList(named: "Anime"))
    lists.renameList(kept.id, to: "\u{FEFF}")
    #expect(lists.lists.first { $0.id == kept.id }?.name == "Anime")
  }

  @Test("a note is compared as the account keeps it, by the shared cases")
  func notes() throws {
    let notes = try SharedAccountCases.rule("note-text")
    for note in notes.accepted {
      #expect(WordNoteStorage.normalized(note.typed.value) == note.kept.value, "\(note.covers)")
    }
  }

  @Test("a watch sends its title cut as the account cuts it, and only numbers the account takes")
  func watchFields() throws {
    let watch = try SharedAccountCases.load("watch-fields", as: WatchCases.self)
    for text in watch.texts {
      let video = WatchedVideo(videoID: "dQw4w9WgXcQ", title: text.typed.value, watchedAt: Date())
      let fields = SavedItemChange.forTheAccount([.videoWatched(video, previous: nil)])[0]
        .queued(in: AccountSyncState()).fields
      #expect(fields?["title"] == text.sent.map { .string($0.value) }, "\(text.covers)")
    }
    for number in watch.numbers {
      var video = WatchedVideo(videoID: "dQw4w9WgXcQ", watchedAt: Date())
      switch number.field {
      case "duration": video.duration = number.value
      case "position": video.position = number.value
      default: video.comprehension = number.value
      }
      let fields = SavedItemChange.forTheAccount([.videoWatched(video, previous: nil)])[0]
        .queued(in: AccountSyncState()).fields
      let reportedAsAll = number.field == "comprehension" && number.value > 1
      #expect((fields?[number.field] != nil) == (number.fits || reportedAsAll), "\(number.covers)")
    }
  }

  @Test("a batch of watches, as a first upload sends, is held to the rules as each would be alone")
  func watchBatch() throws {
    let watch = try SharedAccountCases.load("watch-fields", as: WatchCases.self)
    let changes = watch.texts.map { text in
      SavedItemChange.videoWatched(
        WatchedVideo(
          videoID: "dQw4w9WgXcQ", title: text.typed.value, author: "Channel", duration: 600,
          watchedAt: Date()),
        previous: nil)
    }
    let known = KnownWordChange(storedID: "kanji:語", headword: "語", reading: "ご", known: true)
    let together = SavedItemChange.forTheAccount([.known(known)] + changes)
    let alone = changes.map { SavedItemChange.forTheAccount([$0])[0] }
    let fields = { (change: SavedItemChange) in change.queued(in: AccountSyncState()).fields }
    #expect(together.count == changes.count + 1)
    #expect(together.dropFirst().map(fields) == alone.map(fields))
  }

  @MainActor
  @Test("videos and searches made at the same time keep the shared order, so the account prunes the one the device drops")
  func recentOrder() async throws {
    let order = try SharedAccountCases.load("recent-order", as: RecentOrder.self)
    let tied = Date(timeIntervalSince1970: 946_684_801)
    let history = WatchHistory(defaults: MemoryDefaults())
    for id in order.videos.ids { history.applySynced(WatchedVideo(videoID: id, watchedAt: tied)) }
    #expect(history.videos.map(\.videoID) == order.videos.newestFirst)

    for queries in [order.searches.queries, order.searches.queries.reversed()] {
      let searches = RecentSearchHistory(defaults: MemoryDefaults())
      await searches.applySynced(
        queries.map { KeptSearch(query: $0, searchedAt: tied) }, removing: [],
        under: order.searches.searchKey)
      #expect(await searches.searches().map(\.query) == order.searches.newestFirst)
    }
  }
}
