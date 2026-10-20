import Foundation
import Sentry

struct ProblemReport: Equatable, Sendable {
  static let tagKey = "report"
  static let tagValue = "problem"

  let description: String
  let email: String
  let details: ProblemReportDetails

  private static let wholeEmail: NSRegularExpression = {
    guard let regex = try? NSRegularExpression(pattern: "^" + CrashReportingPolicy.emailPattern + "$")
    else { preconditionFailure("The email pattern doesn't compile") }
    return regex
  }()

  static func isEmail(_ value: String) -> Bool {
    wholeEmail.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)) != nil
  }

  static func contact(from email: String) -> String? {
    let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
    return isEmail(trimmed) ? trimmed : nil
  }

  static func isProblemReport(_ event: Event) -> Bool {
    event.tags?[tagKey] == tagValue
  }

  static func isProblemReport(envelope: Data) -> Bool {
    envelope.split(separator: UInt8(ascii: "\n")).contains { line in
      let item = try? JSONSerialization.jsonObject(with: Data(line)) as? [String: Any]
      let tags = item?["tags"] as? [String: Any]
      return tags?[tagKey] as? String == tagValue
    }
  }

  var contact: String? { Self.contact(from: email) }

  func event() -> Event {
    let event = Event(level: .info)
    event.message = SentryMessage(
      formatted: description.trimmingCharacters(in: .whitespacesAndNewlines))
    event.tags = [Self.tagKey: Self.tagValue]
    event.fingerprint = ["problem-report", event.eventId.sentryIdString]
    var report: [String: Any] = [
      "crash_reports": details.sendsCrashReports ? "on" : "off",
      "details": details.lines.map(\.sent),
    ]
    if let contact { report["contact"] = contact }
    event.context = ["report": report, "permissions": details.permissions]
    return event
  }
}
