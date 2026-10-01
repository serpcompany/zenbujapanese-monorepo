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

  @Test("each search provider builds its results page")
  func searchProviders() {
    #expect(
      VideoSearchProvider.youTube.resultsURL(for: "ci japanese")?.absoluteString
        == "https://m.youtube.com/results?search_query=ci%20japanese")
    #expect(
      VideoSearchProvider.googleVideos.resultsURL(for: "ci japanese")?.absoluteString
        == "https://www.google.com/search?q=ci%20japanese&tbm=vid")
  }

  @Test("creator-made Japanese captions are preferred over automatic ones")
  func trackChoice() throws {
    let response = """
      {"playabilityStatus":{"status":"OK"},"videoDetails":{"title":"猫の写真","author":"NIJ"},
       "captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[
        {"baseUrl":"https://www.youtube.com/api/timedtext?v=a&lang=en","languageCode":"en"},
        {"baseUrl":"https://www.youtube.com/api/timedtext?v=a&lang=ja&kind=asr","languageCode":"ja","kind":"asr","isTranslatable":true},
        {"baseUrl":"https://www.youtube.com/api/timedtext?v=a&lang=ja","languageCode":"ja","isTranslatable":true}
       ]}}}
      """
    let (title, author, tracks) = try YouTubeCaptionParsing.tracks(
      fromPlayerResponse: Data(response.utf8))
    #expect(title == "猫の写真")
    #expect(author == "NIJ")
    let track = try #require(YouTubeCaptionParsing.japaneseTrack(in: tracks))
    #expect(!track.isAutomatic)
    #expect(track.isTranslatable)
    #expect(YouTubeCaptionParsing.japaneseTrack(in: tracks.filter { $0.languageCode == "en" }) == nil)
  }

  @Test("automatic Japanese captions are used when they are the only Japanese track")
  func automaticTrack() throws {
    let response = """
      {"playabilityStatus":{"status":"OK"},"captions":{"playerCaptionsTracklistRenderer":{
       "captionTracks":[{"baseUrl":"https://x.test/t","languageCode":"ja","kind":"asr"}]}}}
      """
    let (_, _, tracks) = try YouTubeCaptionParsing.tracks(fromPlayerResponse: Data(response.utf8))
    #expect(YouTubeCaptionParsing.japaneseTrack(in: tracks)?.isAutomatic == true)
  }

  @Test("an unplayable video reports itself as unavailable")
  func unavailableVideo() {
    let response = #"{"playabilityStatus":{"status":"ERROR","reason":"This video is unavailable"}}"#
    #expect(throws: YouTubeCaptionError.videoUnavailable) {
      try YouTubeCaptionParsing.tracks(fromPlayerResponse: Data(response.utf8))
    }
  }

  @Test("timed text becomes cues with decoded text, joined lines, and no overlaps")
  func timedText() throws {
    let xml = """
      <?xml version="1.0" encoding="utf-8" ?><transcript>
      <text start="0.5" dur="4.0">これは猫の写真です。\n写真です。</text>
      <text start="3.0" dur="2.5">色々な猫の写真があります。</text>
      <text start="6" dur="1"> </text>
      <text start="7.25" dur="2">It&amp;#39;s &amp;quot;fine&amp;quot; &amp;amp; ok</text>
      </transcript>
      """
    let cues = try YouTubeCaptionParsing.cues(fromTimedText: Data(xml.utf8), joiner: "")
    #expect(cues.map(\.text) == [
      "これは猫の写真です。写真です。", "色々な猫の写真があります。", #"It's "fine" & ok"#,
    ])
    #expect(cues.map(\.id) == [0, 1, 2])
    #expect(cues[0].start == 0.5)
    #expect(cues[0].end == 3.0)
    #expect(cues[1].end == 5.5)
    #expect(cues[2].end == 9.25)
  }

  @Test("translations attach to the Japanese line they start within")
  func pairing() {
    let japanese = [
      SubtitleCue(id: 0, start: 0, end: 4, text: "これは猫の写真です。"),
      SubtitleCue(id: 1, start: 4, end: 8, text: "色々な猫の写真があります。"),
      SubtitleCue(id: 2, start: 8, end: 9, text: "はい。"),
    ]
    let english = [
      SubtitleCue(id: 0, start: 0, end: 2, text: "This is a picture"),
      SubtitleCue(id: 1, start: 2, end: 4, text: "of a cat."),
      SubtitleCue(id: 2, start: 4.1, end: 8, text: "There are various pictures of cats."),
    ]
    let paired = YouTubeCaptionParsing.pairing(japanese, with: english)
    #expect(paired.map(\.translation) == [
      "This is a picture of a cat.", "There are various pictures of cats.", nil,
    ])
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
  @Test("a word's meaning is the first gloss of its first sense, without 'to' or notes")
  func shortMeaning() {
    #expect(DictionaryEntry.shortMeaning(from: ["husband"]) == "husband")
    #expect(DictionaryEntry.shortMeaning(from: ["to wipe, to dry"]) == "wipe")
    #expect(
      DictionaryEntry.shortMeaning(from: ["brothers and sisters, siblings", "mate, friend"])
        == "brothers and sist…")
    #expect(DictionaryEntry.shortMeaning(from: ["to fold (clothes, etc.), to shut"]) == "fold")
    #expect(DictionaryEntry.shortMeaning(from: ["(the) above, over, up"]) == "above")
    #expect(DictionaryEntry.shortMeaning(from: []) == nil)
  }

  @Test("long meanings are shortened with an ellipsis")
  func longMeaning() {
    let meaning = DictionaryEntry.shortMeaning(from: ["from the standpoint of, on"])
    #expect(meaning == "from the standpoi…")
  }

  @Test("the Word Meanings preference persists and defaults to off")
  @MainActor
  func preference() throws {
    let defaults = try #require(UserDefaults(suiteName: "WordMeaningTests"))
    defaults.removePersistentDomain(forName: "WordMeaningTests")
    #expect(ReadingAidPreferences(defaults: defaults).showsWordMeanings == false)
    ReadingAidPreferences(defaults: defaults).showsWordMeanings = true
    #expect(ReadingAidPreferences(defaults: defaults).showsWordMeanings == true)
  }
}

@Suite("Player reading aids")
struct PlayerReadingAidTests {
  @Test("sound tags in automatic captions are dropped, and tag-only lines disappear")
  func soundTags() throws {
    let xml = """
      <transcript>
      <text start="11" dur="4">[音楽]</text>
      <text start="17" dur="3">[音楽] 私のことを</text>
      <text start="20" dur="3">［拍手］</text>
      <text start="23" dur="2">[Music] Do</text>
      </transcript>
      """
    let cues = try YouTubeCaptionParsing.cues(fromTimedText: Data(xml.utf8), joiner: "")
    #expect(cues.map(\.text) == ["私のことを", "Do"])
  }

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
    let defaults = try #require(UserDefaults(suiteName: "PlayerReadingAidTests"))
    defaults.removePersistentDomain(forName: "PlayerReadingAidTests")
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
}

@Suite("Sentence-length translations")
struct SentenceTranslationPairingTests {
  @Test("a translation spanning too many lines leaves them as separate cards")
  func mergesLines() {
    let japanese = [
      SubtitleCue(id: 0, start: 40, end: 44, text: "突然のキス"),
      SubtitleCue(id: 1, start: 44, end: 49, text: "や熱いまなざしで"),
      SubtitleCue(id: 2, start: 49, end: 53, text: "恋のプログラムを"),
      SubtitleCue(id: 3, start: 53, end: 60, text: "狂わせないでね"),
      SubtitleCue(id: 4, start: 60, end: 64, text: "出会いと別れ"),
    ]
    let english = [
      SubtitleCue(id: 0, start: 40, end: 42, text: "Do"),
      SubtitleCue(id: 1, start: 42, end: 60, text: "n't mess with the program of love."),
      SubtitleCue(id: 2, start: 60, end: 64, text: "Meetings and partings"),
    ]
    let paired = YouTubeCaptionParsing.pairing(japanese, with: english)
    #expect(paired.count == 5)
    #expect(paired[0].translation == "Do")
    #expect(paired[3].translation == "n't mess with the program of love.")
    #expect(paired[4].translation == "Meetings and partings")
    #expect(paired.map(\.id) == [0, 1, 2, 3, 4])
  }

  @Test("a small timing overlap at the edge doesn't join neighboring lines")
  func edgeOverlap() {
    let japanese = [
      SubtitleCue(id: 0, start: 0, end: 4, text: "一"),
      SubtitleCue(id: 1, start: 4, end: 8, text: "二"),
    ]
    let english = [
      SubtitleCue(id: 0, start: 0, end: 4.2, text: "One"),
      SubtitleCue(id: 1, start: 4.2, end: 8, text: "Two"),
    ]
    let paired = YouTubeCaptionParsing.pairing(japanese, with: english)
    #expect(paired.map(\.translation) == ["One", "Two"])
  }
}

@Suite("YouTube translation sentences")
struct TranslationSentenceTests {
  @Test("empty translated slots extend the sentence that follows them back to their start")
  func sentencesSpanEmptySlots() throws {
    let xml = """
      <transcript>
      <text start="17.21" dur="20.68">[Music] Do</text>
      <text start="40.76" dur="8.279"></text>
      <text start="44.399" dur="9.041"></text>
      <text start="53.44" dur="8.759">n&amp;#39;t mess with the program of love</text>
      <text start="60.57" dur="4.19">[Music]</text>
      <text start="64.76" dur="5.2">Put it on top</text>
      </transcript>
      """
    let sentences = try YouTubeCaptionParsing.translationSentences(fromTimedText: Data(xml.utf8))
    #expect(sentences.map(\.text) == ["Don't mess with the program of love", "Put it on top"])
    #expect(sentences[0].start == 40.76)
    #expect(abs(sentences[0].end - 62.199) < 0.001)
    #expect(sentences[1].start == 60.57)

    let japanese = [
      SubtitleCue(id: 0, start: 40.76, end: 44.399, text: "突然のキス"),
      SubtitleCue(id: 1, start: 44.399, end: 49.039, text: "や熱いまなざしで"),
      SubtitleCue(id: 2, start: 49.039, end: 53.44, text: "恋のプログラムを"),
      SubtitleCue(id: 3, start: 53.44, end: 60.57, text: "狂わせないでね"),
      SubtitleCue(id: 4, start: 64.76, end: 69.96, text: "上に置いて"),
    ]
    let paired = YouTubeCaptionParsing.pairing(japanese, with: sentences)
    #expect(paired.map(\.text) == japanese.map(\.text))
    #expect(paired.map(\.translation) == [
      nil, nil, nil, "Don't mess with the program of love", "Put it on top",
    ])
  }
}

@Suite("Caption card size")
struct CaptionCardSizeTests {
  @Test("a translation spanning two short lines merges them into one card")
  func mergesShortLines() {
    let japanese = [
      SubtitleCue(id: 0, start: 0, end: 2, text: "布巾で"),
      SubtitleCue(id: 1, start: 2, end: 4, text: "拭きます。"),
      SubtitleCue(id: 2, start: 4, end: 6, text: "はい。"),
    ]
    let english = [
      SubtitleCue(id: 0, start: 0, end: 4, text: "I'll wipe it with a cloth."),
      SubtitleCue(id: 1, start: 4, end: 6, text: "Yes."),
    ]
    let paired = YouTubeCaptionParsing.pairing(japanese, with: english)
    #expect(paired.map(\.text) == ["布巾で拭きます。", "はい。"])
    #expect(paired.map(\.translation) == ["I'll wipe it with a cloth.", "Yes."])
  }

  @Test("no card ever exceeds the line and character limits, whatever the translations span")
  func cardsStayBounded() {
    let japanese = (0..<12).map {
      SubtitleCue(id: $0, start: Double($0) * 4, end: Double($0 + 1) * 4, text: "愛さないで恋いなんてまた\($0)")
    }
    let spans: [(Int, Int)] = [(0, 12), (0, 3), (1, 2), (2, 9), (5, 6), (7, 8), (8, 12), (11, 12)]
    for (from, to) in spans {
      let english = [SubtitleCue(id: 0, start: Double(from) * 4, end: Double(to) * 4, text: "x")]
      let paired = YouTubeCaptionParsing.pairing(japanese, with: english)
      #expect(paired.map(\.text).joined() == japanese.map(\.text).joined(), "span \(from)–\(to)")
      for card in paired {
        let lines = japanese.filter { $0.start >= card.start && $0.end <= card.end }
        #expect(lines.count <= YouTubeCaptionParsing.maximumLinesPerCard, "span \(from)–\(to)")
        #expect(
          lines.count == 1 || card.text.count <= YouTubeCaptionParsing.maximumCharactersPerCard,
          "span \(from)–\(to)")
      }
    }
  }
}
