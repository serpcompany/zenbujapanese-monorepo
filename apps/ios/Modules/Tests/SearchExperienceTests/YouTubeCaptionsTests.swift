import Foundation
import Testing
@testable import SearchExperience

@Suite("YouTube captions")
struct YouTubeCaptionsTests {
  @Test("video links in every common form resolve to the same video")
  func videoLinks() {
    let links = [
      "dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42",
      "youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ?feature=share",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      "  https://youtu.be/dQw4w9WgXcQ\n",
    ]
    for link in links {
      #expect(YouTubeVideoID(link: link)?.rawValue == "dQw4w9WgXcQ", "\(link)")
    }
  }

  @Test("links that aren't a YouTube video are rejected")
  func rejectedLinks() {
    let links = [
      "", "hello", "https://vimeo.com/dQw4w9WgXcQ", "https://www.youtube.com/",
      "https://www.youtube.com/watch?v=short", "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/@channel",
    ]
    for link in links {
      #expect(YouTubeVideoID(link: link) == nil, "\(link)")
    }
  }

  @Test("the search bar treats only YouTube links as videos")
  func pastedLinks() {
    #expect(YouTubeVideoID(pastedLink: "https://youtu.be/AQdI1o2D32I?si=x")?.rawValue == "AQdI1o2D32I")
    #expect(YouTubeVideoID(pastedLink: "programming") == nil)
    #expect(YouTubeVideoID(pastedLink: "AQdI1o2D32I") == nil)
    #expect(YouTubeVideoID(pastedLink: "comprehensible japanese") == nil)
  }

  @Test("videos chosen from search results are recognized, including Google redirects")
  func searchNavigation() throws {
    let watch = try #require(URL(string: "https://m.youtube.com/watch?v=AQdI1o2D32I&pp=abc"))
    #expect(YouTubeVideoID(navigatingTo: watch)?.rawValue == "AQdI1o2D32I")
    let google = try #require(
      URL(string: "https://www.google.com/url?q=https://www.youtube.com/watch%3Fv%3DAQdI1o2D32I&sa=U"))
    #expect(YouTubeVideoID(navigatingTo: google)?.rawValue == "AQdI1o2D32I")
    let results = try #require(URL(string: "https://m.youtube.com/results?search_query=japanese"))
    #expect(YouTubeVideoID(navigatingTo: results) == nil)
    let googleResults = try #require(URL(string: "https://www.google.com/search?q=ci+japanese&tbm=vid"))
    #expect(YouTubeVideoID(navigatingTo: googleResults) == nil)
  }

  @Test("each search provider builds its results page, YouTube's mobile one on every device")
  func searchProviders() {
    #expect(
      VideoSearchProvider.youTube.resultsURL(for: "ci japanese")?.absoluteString
        == "https://m.youtube.com/results?search_query=ci%20japanese&app=m")
    #expect(
      VideoSearchProvider.googleVideos.resultsURL(for: "ci japanese")?.absoluteString
        == "https://www.google.com/search?q=ci%20japanese&tbm=vid")
  }

  @Test("the core's reading of YouTube's answers becomes the Player's captions and errors")
  func reading() async throws {
    let id = try #require(YouTubeVideoID(rawValue: "AQdI1o2D32I"))
    let tracks = """
      {"playabilityStatus":{"status":"OK"},"videoDetails":{"title":"駅"},"captions":{\
      "playerCaptionsTracklistRenderer":{"captionTracks":[\
      {"baseUrl":"https://x.test/t","languageCode":"ja","kind":"asr"}]}}}
      """
    func captions(_ playerResponse: String, japanese: String = "<transcript/>") async throws
      -> YouTubeVideoCaptions
    {
      let fetch = YouTubeFetch(
        playerResponse: { _ in Data(playerResponse.utf8) },
        timedText: { _, language in
          #expect(language == nil)
          return Data(japanese.utf8)
        })
      return try await YouTubeCaptionClient(fetching: fetch, recording: { _ in }).captions(id)
    }
    await #expect(throws: YouTubeCaptionError.videoUnavailable) {
      try await captions(#"{"playabilityStatus":{"status":"ERROR"}}"#)
    }
    await #expect(throws: YouTubeCaptionError.unreadableCaptions) { try await captions("<html>") }
    await #expect(throws: YouTubeCaptionError.unreadableCaptions) {
      try await captions(tracks, japanese: "<html><body>")
    }
    await #expect(throws: YouTubeCaptionError.noJapaneseCaptions) { try await captions(tracks) }
    let automatic = try await captions(
      tracks, japanese: #"<transcript><text start="1" dur="2">[音楽] 三番線です</text></transcript>"#)
    #expect(automatic.title == "駅")
    #expect(automatic.isAutomatic)
    #expect(automatic.cues == [SubtitleCue(id: 0, start: 1, end: 3, text: "三番線です")])
  }

  @Test("timestamps show hours only when needed")
  @MainActor
  func timestamps() {
    #expect(WatchSessionView.timestamp(7.9) == "0:07")
    #expect(WatchSessionView.timestamp(605) == "10:05")
    #expect(WatchSessionView.timestamp(3725) == "1:02:05")
  }
}

@Suite("Word meanings")
struct WordMeaningTests {
  @Test("the Word Meanings preference persists and defaults to off")
  @MainActor
  func preference() throws {
    let defaults = MemoryDefaults()
    #expect(ReadingAidPreferences(defaults: defaults).showsWordMeanings == false)
    ReadingAidPreferences(defaults: defaults).showsWordMeanings = true
    #expect(ReadingAidPreferences(defaults: defaults).showsWordMeanings == true)
  }
}

@Suite("Player reading aids")
struct PlayerReadingAidTests {
  @Test("comprehension counts known words among countable occurrences")
  func comprehension() {
    let a = LanguageReferenceID(rawValue: "a")
    let b = LanguageReferenceID(rawValue: "b")
    let result = Comprehension(words: [a, b, a, a], isKnown: { $0 == a })
    #expect(result.knownCount == 3)
    #expect(result.totalCount == 4)
    #expect(result.fraction == 0.75)
    #expect(Comprehension(words: [], isKnown: { _ in true }).fraction == nil)
  }

  @Test("new reading aid preferences persist with their defaults")
  @MainActor
  func preferences() throws {
    let defaults = MemoryDefaults()
    let fresh = ReadingAidPreferences(defaults: defaults)
    #expect(fresh.showsTranslations)
    #expect(fresh.translationLanguage == .english)
    #expect(fresh.translationSource == .youTube)
    #expect(!fresh.hidesFuriganaOnKnownWords)
    fresh.showsTranslations = false
    fresh.translationSource = .apple
    fresh.hidesFuriganaOnKnownWords = true
    let reloaded = ReadingAidPreferences(defaults: defaults)
    #expect(!reloaded.showsTranslations)
    #expect(reloaded.translationSource == .apple)
    #expect(reloaded.hidesFuriganaOnKnownWords)
  }

  @Test("the menus' Furigana on Known Words is Hide Furigana on Known Words turned around")
  @MainActor
  func furiganaOnKnownWords() {
    let defaults = MemoryDefaults()
    let menu = ReadingAidPreferences(defaults: defaults)
    #expect(menu.showsFuriganaOnKnownWords)
    menu.showsFuriganaOnKnownWords = false
    #expect(menu.hidesFuriganaOnKnownWords)
    #expect(ReadingAidPreferences(defaults: defaults).hidesFuriganaOnKnownWords)
    menu.hidesFuriganaOnKnownWords = false
    #expect(menu.showsFuriganaOnKnownWords)
  }

  @Test("Translate's furigana starts off and is stored apart from the app's reading aids")
  @MainActor
  func translateFurigana() throws {
    let defaults = MemoryDefaults()
    let translate = ReadingAidPreferences(
      defaults: defaults, storageKey: "translate.reading-aids.v1", furiganaByDefault: false)
    #expect(!translate.showsFurigana)
    #expect(ReadingAidPreferences(defaults: defaults).showsFurigana)
    translate.showsFurigana = true
    let reloaded = ReadingAidPreferences(
      defaults: defaults, storageKey: "translate.reading-aids.v1", furiganaByDefault: false)
    #expect(reloaded.showsFurigana)
    #expect(ReadingAidPreferences(defaults: defaults).showsFurigana)
  }
}
