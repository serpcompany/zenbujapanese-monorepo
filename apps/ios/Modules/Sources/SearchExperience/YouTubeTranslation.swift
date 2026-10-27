import Foundation

enum YouTubeTranslation {
  enum Step: String, Sendable {
    case request
    case parse
  }

  static let language = "en"

  static func paired(
    _ cues: [SubtitleCue],
    from url: URL,
    fetching fetch: YouTubeFetch,
    recording record: @Sendable (HandledProblem) -> Void
  ) async -> [SubtitleCue]? {
    let data: Data
    do {
      data = try await fetch.timedText(url, language)
    } catch {
      if let problem = problem(error, at: .request) { record(problem) }
      return nil
    }
    do {
      return try YouTubeCaptionReading.paired(cues, with: data)
    } catch {
      if let problem = problem(error, at: .parse) { record(problem) }
      return nil
    }
  }

  static func problem(_ error: Error, at step: Step) -> HandledProblem? {
    var details = ["step": step.rawValue]
    if case .refused(let status)? = error as? YouTubeCaptionError {
      details["status"] = String(status)
    }
    return HandledProblem(error, in: .youTubeTranslation, details: details)
  }
}
