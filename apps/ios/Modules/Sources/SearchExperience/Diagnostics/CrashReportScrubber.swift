import Foundation
import Sentry

enum CrashReportScrubber {
  private static let end = #"\n"“”<>"#

  private static let quotedNameRules: [(NSRegularExpression, String)] = compile([
    (#"[“„”«‹»]\s?[^“”„«»‹›\n]*\s?[”“»›«]"#, "“<name>”"),
    (#"「[^「」\n]*」"#, "“<name>”"),
    (#"『[^『』\n]*』"#, "“<name>”"),
    (#"״[^״\n]*״"#, "“<name>”"),
    (#""[^"\n]*""#, "“<name>”"),
  ])

  private static func linkRule(endingAt end: String) -> (String, String) {
    (#"(?<![A-Za-z0-9+.\-])([0-9+.\-]*+)[A-Za-z][A-Za-z0-9+.\-]*+://[^"# + end + "]*", "$1<url>")
  }

  private static let emailAndPathRules: [(String, String)] = [
    (CrashReportingPolicy.emailPattern, "<email>"),
    (#"(?:/Users|/Volumes|/private|/tmp|/var)/[^"# + end + "]*", "<path>"),
    (#"~/[^"# + end + "]*", "<path>"),
  ]

  private static let pathRules = compile([linkRule(endingAt: end)] + emailAndPathRules)

  private static let writtenRules = compile([linkRule(endingAt: #"\s"# + end)] + emailAndPathRules)

  static let fileExtensions = [
    "sqlite3", "sqlite", "db", "json", "plist", "txt", "csv", "pdf", "png", "jpeg", "jpg", "heic",
    "gif", "mp3", "m4a", "wav", "mp4", "mov", "zip",
  ]

  private static let fileNameRules: [(NSRegularExpression, String)] = compile([
    (
      #"(?<![\p{L}\p{M}\p{N}_.\-])[\p{L}\p{M}\p{N}_\-]++(?:\.[\p{L}\p{M}\p{N}_\-]++)*+(?<=(?i:\.(?:"#
        + fileExtensions.joined(separator: "|") + ")))",
      "<file>"
    )
  ])

  private static let japaneseRules: [(NSRegularExpression, String)] = compile([
    (#"[\p{Hiragana}\p{Katakana}\p{Han}ー々〆ヶｰ]++"#, "<japanese>")
  ])

  private static func compile(_ rules: [(String, String)]) -> [(NSRegularExpression, String)] {
    rules.map { pattern, replacement in
      guard let regex = try? NSRegularExpression(pattern: pattern) else {
        preconditionFailure("A crash report rule doesn't compile: \(pattern)")
      }
      return (regex, replacement)
    }
  }

  private static func apply(_ rules: [(NSRegularExpression, String)], to text: String) -> String {
    rules.reduce(text) { text, rule in
      let range = NSRange(text.startIndex..., in: text)
      return rule.0.stringByReplacingMatches(in: text, range: range, withTemplate: rule.1)
    }
  }

  static func scrub(_ text: String) -> String {
    apply(
      japaneseRules,
      to: apply(fileNameRules, to: apply(pathRules, to: apply(quotedNameRules, to: text))))
  }

  static func scrub(_ text: String?) -> String? {
    text.map { scrub($0) }
  }

  static func scrubImagePath(_ path: String?) -> String? {
    guard let path else { return nil }
    guard scrub(path) != path else { return path }
    return "<path>/" + scrub((path as NSString).lastPathComponent)
  }

  static func scrubValue(_ value: Any) -> Any {
    switch value {
    case let text as String: scrub(text)
    case let list as [Any]: list.map(scrubValue)
    case let dictionary as [String: Any]: dictionary.mapValues(scrubValue)
    default: value
    }
  }

  static func scrub(_ breadcrumb: Breadcrumb) -> Breadcrumb? {
    guard CrashReportingPolicy.keepsBreadcrumb(category: breadcrumb.category) else { return nil }
    breadcrumb.message = scrub(breadcrumb.message)
    for (key, value) in breadcrumb.data ?? [:] {
      breadcrumb.setData(value: scrubValue(value), key: key)
    }
    return breadcrumb
  }

  static func scrub(_ event: Event) -> Event {
    event.serverName = nil
    event.request = nil
    event.extra = nil
    event.error = nil
    event.user = event.user?.userId.map { User(userId: $0) }
    let isProblemReport = ProblemReport.isProblemReport(event)
    if let message = event.message {
      event.message = SentryMessage(
        formatted: isProblemReport ? scrubWritten(message.formatted) : scrub(message.formatted))
    }
    event.exceptions?.forEach { exception in
      exception.value = scrub(exception.value)
      if let mechanism = exception.mechanism {
        mechanism.desc = scrub(mechanism.desc)
        mechanism.data = mechanism.data?.mapValues(scrubValue)
      }
      scrubFrames(exception.stacktrace)
    }
    event.threads?.forEach { scrubFrames($0.stacktrace) }
    scrubFrames(event.stacktrace)
    event.debugMeta?.forEach { $0.codeFile = scrubImagePath($0.codeFile) }
    event.breadcrumbs = event.breadcrumbs?.compactMap(scrub)
    event.context = event.context.map { scrubContexts($0, keepsReport: isProblemReport) }
    return event
  }

  static func scrubContexts(
    _ contexts: [String: [String: Any]], keepsReport: Bool = false
  ) -> [String: [String: Any]] {
    contexts.reduce(into: [:]) { kept, entry in
      if keepsReport, CrashReportingPolicy.problemReportContexts.contains(entry.key) {
        kept[entry.key] = scrubReport(entry.value)
        return
      }
      guard CrashReportingPolicy.keptContexts.contains(entry.key) else { return }
      let dropped = CrashReportingPolicy.droppedContextFields[entry.key] ?? []
      kept[entry.key] = entry.value.filter { !dropped.contains($0.key) }.mapValues(scrubValue)
    }
  }

  static func scrubWritten(_ text: String) -> String {
    apply(writtenRules, to: text)
  }

  private static func scrubReport(_ context: [String: Any]) -> [String: Any] {
    context.reduce(into: [:]) { kept, field in
      switch (field.key, field.value) {
      case ("contact", let contact as String):
        if ProblemReport.isEmail(contact) { kept[field.key] = contact }
      case ("contact", _):
        return
      case (_, let lines as [String]):
        kept[field.key] = lines.map(scrubWritten)
      case (_, let text as String):
        kept[field.key] = scrubWritten(text)
      default:
        kept[field.key] = scrubValue(field.value)
      }
    }
  }

  private static func scrubFrames(_ stacktrace: SentryStacktrace?) {
    stacktrace?.frames.forEach { frame in
      frame.package = scrubImagePath(frame.package)
      frame.fileName = scrub(frame.fileName)
      frame.contextLine = nil
      frame.preContext = nil
      frame.postContext = nil
      frame.vars = nil
    }
  }
}
