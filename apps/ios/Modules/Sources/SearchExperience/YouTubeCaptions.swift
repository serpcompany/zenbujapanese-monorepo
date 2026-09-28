import Foundation

/// An 11-character YouTube video identifier.
struct YouTubeVideoID: Hashable, Sendable {
  let rawValue: String

  init?(rawValue: String) {
    let allowed = CharacterSet(
      charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
    guard rawValue.count == 11,
      rawValue.unicodeScalars.allSatisfy(allowed.contains)
    else { return nil }
    self.rawValue = rawValue
  }

  /// Reads a video from a pasted link or a bare identifier.
  ///
  /// Accepts `watch?v=`, `youtu.be/`, `shorts/`, `embed/`, `live/`, and `v/` links on any
  /// YouTube host, with or without a scheme.
  init?(link: String) {
    let trimmed = link.trimmingCharacters(in: .whitespacesAndNewlines)
    if let id = YouTubeVideoID(rawValue: trimmed) {
      self = id
      return
    }
    let withScheme = trimmed.contains("://") ? trimmed : "https://\(trimmed)"
    guard let components = URLComponents(string: withScheme),
      let host = components.host?.lowercased()
    else { return nil }
    let pathParts = components.path.split(separator: "/").map(String.init)
    let candidate: String?
    if host == "youtu.be" {
      candidate = pathParts.first
    } else if host == "youtube.com" || host.hasSuffix(".youtube.com")
      || host == "youtube-nocookie.com" || host.hasSuffix(".youtube-nocookie.com")
    {
      if pathParts.first == "watch" {
        candidate = components.queryItems?.first { $0.name == "v" }?.value
      } else if let first = pathParts.first, ["shorts", "embed", "live", "v"].contains(first),
        pathParts.count > 1
      {
        candidate = pathParts[1]
      } else {
        candidate = nil
      }
    } else {
      candidate = nil
    }
    guard let candidate, let id = YouTubeVideoID(rawValue: candidate) else { return nil }
    self = id
  }
}

extension YouTubeVideoID {
  /// Reads a video from text typed or pasted into a search bar. Unlike `init(link:)`, a bare
  /// 11-character word such as "programming" is a search, not a video ID.
  init?(pastedLink text: String) {
    guard text.lowercased().contains("youtu") else { return nil }
    self.init(link: text)
  }

  /// Reads a video from a page a search engine navigates to, including redirect links such as
  /// Google's `/url?q=https://www.youtube.com/watch?v=…`.
  init?(navigatingTo url: URL) {
    if let id = YouTubeVideoID(pastedLink: url.absoluteString) {
      self = id
      return
    }
    let redirect = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?
      .first { ["q", "url", "u"].contains($0.name) }?.value
    guard let redirect, let id = YouTubeVideoID(pastedLink: redirect) else { return nil }
    self = id
  }
}

/// One timed Japanese subtitle line with its English translation, when one exists.
struct SubtitleCue: Identifiable, Hashable, Sendable {
  let id: Int
  let start: TimeInterval
  let end: TimeInterval
  let text: String
  var translation: String?

  func contains(_ time: TimeInterval) -> Bool { time >= start && time < end }
}

struct YouTubeCaptionTrack: Hashable, Sendable {
  let baseURL: URL
  let languageCode: String
  let isAutomatic: Bool
  let isTranslatable: Bool
}

struct YouTubeVideoCaptions: Sendable {
  let title: String?
  let cues: [SubtitleCue]
  let isAutomatic: Bool
  /// The channel that published the video.
  var author: String? = nil
}

extension YouTubeVideoCaptions {
  var withoutTranslations: YouTubeVideoCaptions {
    YouTubeVideoCaptions(
      title: title,
      cues: cues.map { cue in
        var cue = cue
        cue.translation = nil
        return cue
      },
      isAutomatic: isAutomatic,
      author: author
    )
  }
}

enum YouTubeCaptionError: Error, Equatable {
  case videoUnavailable
  case noJapaneseCaptions
  case unreadableCaptions
}

enum YouTubeCaptionParsing {
  /// Chooses creator-made Japanese captions over automatic ones.
  static func japaneseTrack(in tracks: [YouTubeCaptionTrack]) -> YouTubeCaptionTrack? {
    let japanese = tracks.filter {
      $0.languageCode == "ja" || $0.languageCode.hasPrefix("ja-")
    }
    return japanese.first { !$0.isAutomatic } ?? japanese.first
  }

  /// Reads caption tracks from a YouTube player response.
  static func tracks(fromPlayerResponse data: Data) throws -> (
    title: String?, author: String?, tracks: [YouTubeCaptionTrack]
  ) {
    let response = try JSONDecoder().decode(PlayerResponse.self, from: data)
    guard response.playabilityStatus?.status == "OK" else {
      throw YouTubeCaptionError.videoUnavailable
    }
    let tracks = (response.captions?.playerCaptionsTracklistRenderer.captionTracks ?? [])
      .compactMap { track -> YouTubeCaptionTrack? in
        guard let url = URL(string: track.baseUrl) else { return nil }
        return YouTubeCaptionTrack(
          baseURL: url,
          languageCode: track.languageCode,
          isAutomatic: track.kind == "asr",
          isTranslatable: track.isTranslatable ?? false
        )
      }
    return (response.videoDetails?.title, response.videoDetails?.author, tracks)
  }

  /// Parses YouTube's timed-text XML (`<transcript><text start dur>`), dropping empty lines.
  static func cues(fromTimedText data: Data, joiner: String) throws -> [SubtitleCue] {
    let delegate = TimedTextParserDelegate()
    let parser = XMLParser(data: data)
    parser.delegate = delegate
    guard parser.parse() else { throw YouTubeCaptionError.unreadableCaptions }
    var cues: [SubtitleCue] = []
    for (index, line) in delegate.lines.enumerated() {
      let text = line.text
        .components(separatedBy: .newlines)
        .map { $0.trimmingCharacters(in: .whitespaces) }
        .filter { !$0.isEmpty }
        .joined(separator: joiner)
        .removingSoundTags
      guard !text.isEmpty else { continue }
      // Automatic captions overlap; end each line when the next begins.
      let next = delegate.lines.dropFirst(index + 1).first?.start
      let end = min(line.start + line.duration, next ?? .infinity)
      cues.append(
        SubtitleCue(id: cues.count, start: line.start, end: max(end, line.start), text: text))
    }
    return cues
  }

  /// Reads YouTube's translated timed text as whole sentences. YouTube keeps the Japanese
  /// track's time slots, leaves them empty while a sentence continues, and puts the sentence in
  /// its last slot, so each sentence spans from the first empty slot before it.
  static func translationSentences(fromTimedText data: Data) throws -> [SubtitleCue] {
    let delegate = TimedTextParserDelegate()
    let parser = XMLParser(data: data)
    parser.delegate = delegate
    guard parser.parse() else { throw YouTubeCaptionError.unreadableCaptions }
    var sentences: [SubtitleCue] = []
    var sentenceStart: TimeInterval?
    for line in delegate.lines {
      let text = line.text
        .components(separatedBy: .newlines)
        .map { $0.trimmingCharacters(in: .whitespaces) }
        .filter { !$0.isEmpty }
        .joined(separator: " ")
        .removingSoundTags
      guard !text.isEmpty else {
        sentenceStart = sentenceStart ?? line.start
        continue
      }
      var sentence = SubtitleCue(
        id: sentences.count,
        start: sentenceStart ?? line.start,
        end: line.start + line.duration,
        text: text
      )
      sentenceStart = nil
      // A word split across slots, such as "Do" and "n't", joins the sentence it finishes.
      if text.hasPrefix("n't") || text.hasPrefix("'"), let previous = sentences.popLast() {
        sentence = SubtitleCue(
          id: previous.id, start: sentence.start, end: sentence.end, text: previous.text + text)
      }
      sentences.append(sentence)
    }
    return sentences
  }

  /// The most caption lines one card may merge, so every card fits on screen.
  static let maximumLinesPerCard = 2
  /// The most Japanese characters one merged card may hold.
  static let maximumCharactersPerCard = 40

  /// Pairs Japanese lines with translated lines by time. YouTube often translates automatic
  /// captions a whole sentence at a time. A sentence spanning a few short lines merges them into
  /// one card; a longer one leaves its lines as separate cards and puts the sentence on its last
  /// line, where YouTube shows it, so no card grows past what fits on screen.
  static func pairing(_ cues: [SubtitleCue], with translations: [SubtitleCue]) -> [SubtitleCue] {
    guard !cues.isEmpty, !translations.isEmpty else { return cues }
    // The Japanese lines each translated line meaningfully overlaps.
    let spans: [(translation: SubtitleCue, lines: ClosedRange<Int>)] = translations.compactMap {
      translation in
      let lines = cues.indices.filter { overlaps(cues[$0], translation) }
      guard let first = lines.first, let last = lines.last else { return nil }
      return (translation, first...last)
    }
    func fits(_ lines: ClosedRange<Int>) -> Bool {
      lines.count <= maximumLinesPerCard
        && cues[lines].map(\.text.count).reduce(0, +) <= maximumCharactersPerCard
    }
    // Lines a translation spans merge into one card when they fit; lines outside any merge
    // stay one card each.
    var groups: [ClosedRange<Int>] = []
    for span in spans.map(\.lines).sorted(by: { $0.lowerBound < $1.lowerBound }) {
      guard fits(span) else { continue }
      if let last = groups.last, span.lowerBound <= last.upperBound {
        let merged = last.lowerBound...max(last.upperBound, span.upperBound)
        if fits(merged) {
          groups[groups.count - 1] = merged
        } else if span.upperBound > last.upperBound, fits(last.upperBound + 1...span.upperBound) {
          groups.append(last.upperBound + 1...span.upperBound)
        }
      } else {
        groups.append(span)
      }
    }
    var paired: [SubtitleCue] = []
    var index = 0
    while index < cues.count {
      let group = groups.first { $0.contains(index) } ?? index...index
      let lines = cues[group]
      // A translation belongs to the card holding the last line it spans.
      let text = spans
        .filter { group.contains($0.lines.upperBound) }
        .map(\.translation.text)
        .reduce("") { joined, next in joinTranslation(joined, next) }
      paired.append(
        SubtitleCue(
          id: paired.count,
          start: lines.first!.start,
          end: lines.last!.end,
          text: lines.map(\.text).joined(),
          translation: text.isEmpty ? nil : text
        ))
      index = group.upperBound + 1
    }
    return paired
  }

  /// Whether a translated line covers enough of a Japanese line to belong to it, so small
  /// timing differences at the edges don't join neighboring lines.
  private static func overlaps(_ line: SubtitleCue, _ translation: SubtitleCue) -> Bool {
    let overlap = min(line.end, translation.end) - max(line.start, translation.start)
    let lineLength = line.end - line.start
    return overlap > 0 && (overlap >= 0.5 || overlap >= lineLength / 2)
  }

  /// Joins translated pieces, keeping a word split across pieces, such as "Do" and "n't", whole.
  private static func joinTranslation(_ joined: String, _ next: String) -> String {
    guard !joined.isEmpty else { return next }
    let attaches = next.hasPrefix("n't") || next.hasPrefix("'") || next.first?.isPunctuation == true
    return joined + (attaches ? "" : " ") + next
  }

  private struct PlayerResponse: Decodable {
    struct Status: Decodable { let status: String? }
    struct Details: Decodable {
      let title: String?
      let author: String?
    }
    struct Captions: Decodable {
      struct Renderer: Decodable {
        struct Track: Decodable {
          let baseUrl: String
          let languageCode: String
          let kind: String?
          let isTranslatable: Bool?
        }
        let captionTracks: [Track]?
      }
      let playerCaptionsTracklistRenderer: Renderer
    }
    let playabilityStatus: Status?
    let videoDetails: Details?
    let captions: Captions?
  }
}

private final class TimedTextParserDelegate: NSObject, XMLParserDelegate {
  struct Line {
    let start: TimeInterval
    let duration: TimeInterval
    var text: String
  }

  var lines: [Line] = []
  private var current: Line?

  func parser(
    _ parser: XMLParser,
    didStartElement elementName: String,
    namespaceURI: String?,
    qualifiedName: String?,
    attributes: [String: String] = [:]
  ) {
    guard elementName == "text" else { return }
    current = Line(
      start: TimeInterval(attributes["start"] ?? "") ?? 0,
      duration: TimeInterval(attributes["dur"] ?? "") ?? 0,
      text: ""
    )
  }

  func parser(_ parser: XMLParser, foundCharacters string: String) {
    current?.text += string
  }

  func parser(
    _ parser: XMLParser,
    didEndElement elementName: String,
    namespaceURI: String?,
    qualifiedName: String?
  ) {
    guard elementName == "text", var line = current else { return }
    // Timed text escapes HTML entities a second time, such as `&amp;#39;`.
    line.text = line.text.decodingHTMLEntities
    lines.append(line)
    current = nil
  }
}

extension String {
  /// Drops bracketed sound descriptions, such as [音楽] or [Music], which automatic captions
  /// add between lyrics.
  fileprivate var removingSoundTags: String {
    replacing(/\s*[\[［][^\]］]*[\]］]\s*/, with: " ")
      .trimmingCharacters(in: .whitespaces)
  }

  fileprivate var decodingHTMLEntities: String {
    guard contains("&") else { return self }
    let named = ["&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&apos;": "'"]
    var result = self
    for (entity, value) in named where entity != "&amp;" {
      result = result.replacingOccurrences(of: entity, with: value)
    }
    let pattern = /&#(x?)([0-9A-Fa-f]+);/
    result = result.replacing(pattern) { match in
      let radix = match.1.isEmpty ? 10 : 16
      guard let value = UInt32(match.2, radix: radix), let scalar = Unicode.Scalar(value)
      else { return String(match.0) }
      return String(Character(scalar))
    }
    return result.replacingOccurrences(of: "&amp;", with: "&")
  }
}

/// Loads a YouTube video's Japanese captions and their English translation.
struct YouTubeCaptionClient: Sendable {
  var captions: @Sendable (YouTubeVideoID) async throws -> YouTubeVideoCaptions

  static let live = YouTubeCaptionClient { videoID in
    let (title, author, tracks) = try await YouTubeCaptionParsing.tracks(
      fromPlayerResponse: playerResponse(for: videoID))
    guard let track = YouTubeCaptionParsing.japaneseTrack(in: tracks) else {
      throw YouTubeCaptionError.noJapaneseCaptions
    }
    let cues = try YouTubeCaptionParsing.cues(
      fromTimedText: try await timedText(track.baseURL), joiner: "")
    guard !cues.isEmpty else { throw YouTubeCaptionError.noJapaneseCaptions }
    var paired = cues
    if track.isTranslatable,
      let data = try? await timedText(track.baseURL, translatedTo: "en"),
      let translations = try? YouTubeCaptionParsing.translationSentences(fromTimedText: data)
    {
      paired = YouTubeCaptionParsing.pairing(cues, with: translations)
    }
    return YouTubeVideoCaptions(
      title: title, cues: paired, isAutomatic: track.isAutomatic, author: author)
  }

  private static func playerResponse(for videoID: YouTubeVideoID) async throws -> Data {
    var request = URLRequest(url: URL(string: "https://www.youtube.com/youtubei/v1/player")!)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "context": ["client": ["clientName": "ANDROID", "clientVersion": "20.10.38", "hl": "en"]],
      "videoId": videoID.rawValue,
    ])
    let (data, response) = try await URLSession.shared.data(for: request)
    guard (response as? HTTPURLResponse)?.statusCode == 200 else {
      throw YouTubeCaptionError.videoUnavailable
    }
    return data
  }

  private static func timedText(_ baseURL: URL, translatedTo language: String? = nil)
    async throws -> Data
  {
    guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
      throw YouTubeCaptionError.unreadableCaptions
    }
    // The default format is the `<transcript><text>` XML this client parses.
    var items = (components.queryItems ?? []).filter { $0.name != "fmt" && $0.name != "tlang" }
    if let language { items.append(URLQueryItem(name: "tlang", value: language)) }
    components.queryItems = items
    guard let url = components.url else { throw YouTubeCaptionError.unreadableCaptions }
    let (data, response) = try await URLSession.shared.data(from: url)
    guard (response as? HTTPURLResponse)?.statusCode == 200, !data.isEmpty else {
      throw YouTubeCaptionError.unreadableCaptions
    }
    return data
  }
}
