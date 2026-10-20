import Foundation
import Sentry
import Testing

@testable import SearchExperience

enum ProblemReportFixtures {
  static let details = ProblemReportDetails(
    version: "2.0.1", build: "8", systemName: "iOS", systemVersion: "26.1", device: "iPhone17,1",
    isSignedIn: true, sendsCrashReports: false,
    dictionaries: ["Japanese Wikipedia", "TUBELEX YouTube Japanese"],
    microphone: .allowed, camera: .notAsked)
}

@Suite("Problem report")
struct ProblemReportTests {
  private static let written = """
    The “Language” menu shows 食べる twice.
    It happens after I open /var/mobile/Containers/Data/Application/ABC/Documents/notes.txt
    Mail pat@example.com if you need more.
    """

  private static func report(_ description: String = written, email: String = "")
    -> ProblemReport
  {
    ProblemReport(description: description, email: email, details: ProblemReportFixtures.details)
  }

  @Test("the details are the lines the form shows")
  func detailsAreTheShownLines() {
    let lines = ProblemReportFixtures.details.lines.map(\.sent)
    #expect(
      lines == [
        "Version: 2.0.1 (8)", "iOS: 26.1", "Device: iPhone17,1", "Account: Signed in",
        "Crash Reports: Off", "Dictionaries: Japanese Wikipedia, TUBELEX YouTube Japanese",
        "Permissions: Microphone allowed, Camera not asked",
      ])
    var none = ProblemReportFixtures.details
    none.dictionaries = []
    none.isSignedIn = false
    #expect(none.lines.map(\.sent).contains("Dictionaries: None"))
    #expect(none.lines.map(\.sent).contains("Account: Signed out"))
  }

  @Test("the contact is only an email address, and only the whole value")
  func contactIsOnlyAnEmail() {
    #expect(ProblemReport.contact(from: " pat@example.com ") == "pat@example.com")
    #expect(ProblemReport.contact(from: "josé.o'brien@example.co.jp") == "josé.o'brien@example.co.jp")
    #expect(ProblemReport.contact(from: "") == nil)
    #expect(ProblemReport.contact(from: "pat") == nil)
    #expect(ProblemReport.contact(from: "pat@example") == nil)
    #expect(ProblemReport.contact(from: "pat@example.com /var/mobile/notes.txt") == nil)
    #expect(ProblemReport.contact(from: "reach me at pat@example.com") == nil)
  }

  @Test("a report is an info event, tagged, with its own fingerprint and the report's contexts")
  func eventShape() throws {
    let event = Self.report("  Search froze \n", email: "pat@example.com").event()
    #expect(event.level == .info)
    #expect(event.tags == ["report": "problem"])
    #expect(event.fingerprint == ["problem-report", event.eventId.sentryIdString])
    #expect(event.message?.formatted == "Search froze")
    let report = try #require(event.context?["report"])
    #expect(report["crash_reports"] as? String == "off")
    #expect(report["contact"] as? String == "pat@example.com")
    #expect(report["details"] as? [String] == ProblemReportFixtures.details.lines.map(\.sent))
    #expect(
      event.context?["permissions"] as? [String: String] == [
        "microphone": "allowed", "camera": "not asked",
      ])
    #expect(Self.report().event().context?["report"]?["contact"] == nil)
  }

  @Test("what the person writes loses paths, links, and emails, and keeps quoted words and Japanese")
  func writtenTextIsScrubbed() {
    let scrubbed = CrashReportScrubber.scrub(Self.report().event())
    #expect(
      scrubbed.message?.formatted == """
        The “Language” menu shows 食べる twice.
        It happens after I open <path>
        Mail <email> if you need more.
        """)
    let full = CrashReportScrubber.scrub(Self.report().event().with(tags: [:]))
    #expect(full.message?.formatted.contains("“<name>”") == true)
  }

  @Test("a link ends at a space, so the words after it stay, and the next lines stay")
  func linkEndsAtASpace() {
    let event = Self.report("Tap https://example.com/a?b=c then Back\nIt froze").event()
    #expect(CrashReportScrubber.scrub(event).message?.formatted == "Tap <url> then Back\nIt froze")
  }

  @Test("a path takes the rest of its line with it, since a path can hold spaces, and the next lines stay")
  func pathTakesTheRestOfItsLine() {
    let event = Self.report("Open ~/My Words/list.csv then Back\nIt froze").event()
    #expect(CrashReportScrubber.scrub(event).message?.formatted == "Open <path>\nIt froze")
  }

  @Test("the report's contexts are kept for a report, and dropped from any other event")
  func contextsKeptOnlyForReports() throws {
    let scrubbed = CrashReportScrubber.scrub(Self.report(email: "pat@example.com").event())
    let report = try #require(scrubbed.context?["report"])
    #expect(report["contact"] as? String == "pat@example.com")
    #expect(report["details"] as? [String] == ProblemReportFixtures.details.lines.map(\.sent))
    #expect(scrubbed.context?["permissions"] != nil)

    let other = CrashReportScrubber.scrub(Self.report(email: "pat@example.com").event().with(tags: [:]))
    #expect(other.context?["report"] == nil)
    #expect(other.context?["permissions"] == nil)
  }

  @Test("a contact that isn't wholly an email address never leaves the device")
  func contactThatIsNotAnEmailIsDropped() throws {
    let event = Self.report().event()
    event.context?["report"]?["contact"] = "pat@example.com at /var/mobile/notes.txt"
    let report = try #require(CrashReportScrubber.scrub(event).context?["report"])
    #expect(report["contact"] == nil)
  }

  @Test("scrubbing a long pasted description stays fast")
  func longDescriptionScrubsQuickly() {
    let pasted = String(repeating: "a“b ", count: 20_000) + String(repeating: "x", count: 50_000)
    let clock = ContinuousClock()
    let elapsed = clock.measure { _ = CrashReportScrubber.scrub(Self.report(pasted).event()) }
    #expect(elapsed < .seconds(1))
  }

  @Test("a report waiting on the device is told from a crash report by its tag, over many lines")
  func waitingEnvelopeIsAProblemReportByItsTag() throws {
    let report = CrashReportScrubber.scrub(Self.report().event())
    let failure = HandledProblem(area: .accountSync, code: "refused_400").event()
    #expect(ProblemReport.isProblemReport(envelope: try StandInCrashReportingSDK.envelope(of: report)))
    #expect(!ProblemReport.isProblemReport(envelope: try StandInCrashReportingSDK.envelope(of: failure)))
    #expect(!ProblemReport.isProblemReport(envelope: Data("{}\n\u{0}\u{1}".utf8)))
  }
}

extension Event {
  fileprivate func with(tags: [String: String]) -> Event {
    self.tags = tags
    return self
  }
}
