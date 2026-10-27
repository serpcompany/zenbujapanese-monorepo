import Foundation

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
  init?(pastedLink text: String) {
    guard text.lowercased().contains("youtu") else { return nil }
    self.init(link: text)
  }

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

struct SubtitleCue: Identifiable, Hashable, Sendable, Codable {
  let id: Int
  let start: TimeInterval
  let end: TimeInterval
  let text: String
  var translation: String?

  func contains(_ time: TimeInterval) -> Bool { time >= start && time < end }
}

struct YouTubeCaptionTrack: Decodable, Hashable, Sendable {
  let url: String
  let isAutomatic: Bool
  let isTranslatable: Bool
}

struct YouTubeVideoAnswer: Decodable, Sendable {
  let playable: Bool
  let title: String?
  let author: String?
  let track: YouTubeCaptionTrack?
}

struct YouTubeVideoCaptions: Sendable {
  let title: String?
  let cues: [SubtitleCue]
  let isAutomatic: Bool
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
  case refused(status: Int)
}

enum YouTubeCaptionReading {
  static func video(_ playerResponse: Data) throws -> YouTubeVideoAnswer {
    try answer("youTubeVideo", playerResponse)
  }

  static func captions(_ timedText: Data) throws -> [SubtitleCue] {
    try answer("youTubeCaptions", timedText)
  }

  static func paired(_ cues: [SubtitleCue], with timedText: Data) throws -> [SubtitleCue] {
    struct Request: Encodable {
      let captions: [SubtitleCue]
      let timedText: String
    }
    let request = Request(captions: cues, timedText: try text(timedText))
    let paired: [SubtitleCue]? = try PresentationCore.shared.answer(
      "youTubeTranslatedCaptions", request)
    guard let paired else { throw YouTubeCaptionError.unreadableCaptions }
    return paired
  }

  private static func answer<Answer: Decodable>(_ method: String, _ data: Data) throws -> Answer {
    let answer: Answer? = try PresentationCore.shared.answer(method, try text(data))
    guard let answer else { throw YouTubeCaptionError.unreadableCaptions }
    return answer
  }

  private static func text(_ data: Data) throws -> String {
    guard let text = String(data: data, encoding: .utf8) else {
      throw YouTubeCaptionError.unreadableCaptions
    }
    return text
  }
}

struct YouTubeCaptionClient: Sendable {
  var captions: @Sendable (YouTubeVideoID) async throws -> YouTubeVideoCaptions

  static let live = YouTubeCaptionClient(fetching: LaunchHarness.youTubeFetch ?? .network)

  init(captions: @escaping @Sendable (YouTubeVideoID) async throws -> YouTubeVideoCaptions) {
    self.captions = captions
  }

  init(
    fetching fetch: YouTubeFetch,
    recording record: @escaping @Sendable (HandledProblem) -> Void = { CrashReporter.record($0) }
  ) {
    captions = { videoID in
      let video = try YouTubeCaptionReading.video(try await fetch.playerResponse(videoID))
      guard video.playable else { throw YouTubeCaptionError.videoUnavailable }
      guard let track = video.track, let url = URL(string: track.url) else {
        throw YouTubeCaptionError.noJapaneseCaptions
      }
      let cues = try YouTubeCaptionReading.captions(try await fetch.timedText(url, nil))
      guard !cues.isEmpty else { throw YouTubeCaptionError.noJapaneseCaptions }
      var paired = cues
      if track.isTranslatable,
        let translated = await YouTubeTranslation.paired(
          cues, from: url, fetching: fetch, recording: record)
      {
        paired = translated
      }
      return YouTubeVideoCaptions(
        title: video.title, cues: paired, isAutomatic: track.isAutomatic, author: video.author)
    }
  }
}

struct YouTubeFetch: Sendable {
  var playerResponse: @Sendable (YouTubeVideoID) async throws -> Data
  var timedText: @Sendable (_ baseURL: URL, _ translatedTo: String?) async throws -> Data

  static let network = YouTubeFetch(
    playerResponse: { try await networkPlayerResponse(for: $0) },
    timedText: { try await networkTimedText($0, translatedTo: $1) })

  private static func networkPlayerResponse(for videoID: YouTubeVideoID) async throws -> Data {
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

  private static func networkTimedText(_ baseURL: URL, translatedTo language: String?)
    async throws -> Data
  {
    guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
      throw YouTubeCaptionError.unreadableCaptions
    }
    var items = (components.queryItems ?? []).filter { $0.name != "fmt" && $0.name != "tlang" }
    if let language { items.append(URLQueryItem(name: "tlang", value: language)) }
    components.queryItems = items
    guard let url = components.url else { throw YouTubeCaptionError.unreadableCaptions }
    let (data, response) = try await URLSession.shared.data(from: url)
    return try timedTextAnswer(data, response)
  }

  static func timedTextAnswer(_ data: Data, _ response: URLResponse) throws -> Data {
    guard let status = (response as? HTTPURLResponse)?.statusCode else {
      throw YouTubeCaptionError.unreadableCaptions
    }
    guard status == 200 else { throw YouTubeCaptionError.refused(status: status) }
    return data
  }
}
