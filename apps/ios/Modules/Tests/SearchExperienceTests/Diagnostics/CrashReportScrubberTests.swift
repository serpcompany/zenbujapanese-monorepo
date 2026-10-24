import Foundation
import Sentry
import Testing

@testable import SearchExperience

@Suite("Crash report scrubber")
struct CrashReportScrubberTests {
  private let scrub = CrashReportScrubber.scrub as (String) -> String
  private let appBinary =
    "/private/var/containers/Bundle/Application/5C1F2A9E-3B7D-4E0A-9F6B-1D2C3E4F5A6B/Zenbu Japanese.app/Zenbu Japanese"

  @Test("paths on an iPhone, in the Simulator, and on a Mac are removed")
  func pathsAreRemoved() {
    #expect(
      scrub("can't open /var/mobile/Containers/Data/Application/AB12/Documents/Q3 plan.txt")
        == "can't open <path>")
    #expect(scrub("wrote /private/var/mobile/Library/Caches/draft.txt") == "wrote <path>")
    #expect(
      scrub("at /Users/pat/Library/Developer/CoreSimulator/Devices/X/data/a.sqlite")
        == "at <path>")
    #expect(scrub("missing \"/Volumes/Backup/photo.png\" here") == "missing “<name>” here")
    #expect(scrub("saved to ~/Desktop/notes.md") == "saved to <path>")
    #expect(scrub("wrote /tmp/draft.txt") == "wrote <path>")
    #expect(scrub("wrote /private/var/folders/x1/T/draft.txt") == "wrote <path>")
    #expect(scrub("can't open /Users/pat/Documents/Pat's Q3 plan.txt") == "can't open <path>")
  }

  @Test("URLs and email addresses are removed, wherever they start")
  func urlsAndEmailsAreRemoved() {
    #expect(scrub("loading https://example.com/a?q=secret") == "loading <url>")
    #expect(scrub("file:///var/mobile/a.txt") == "<url>")
    #expect(scrub("Error 404https://example.com/x") == "Error 404<url>")
    #expect(scrub("(https://example.com)") == "(<url>")
    #expect(scrub("1.https://example.com") == "1.<url>")
    #expect(scrub("-https://example.org") == "-<url>")
    #expect(scrub("smb://server/share/Pat Q3.txt") == "<url>")
    #expect(scrub("sent by pat.lee@example.com today") == "sent by <email> today")
    #expect(scrub("Write to o'brien@example.com or josé@example.es") == "Write to <email> or <email>")
    #expect(scrub("pat@example.com-jo@example.org") == "<email><email>")
    #expect(scrub("राम@उदाहरण.भारत") == "<email>")
    #expect(scrub("jose\u{0301}@example.es") == "<email>")
  }

  @Test("Japanese text, quoted or not, is removed")
  func japaneseTextIsRemoved() {
    #expect(scrub("「食べる」が見つかりません") == "“<name>”<japanese>")
    #expect(scrub("no entry for 食べる (たべる, タベル)") == "no entry for <japanese> (<japanese>, <japanese>)")
    #expect(scrub("lookup failed: 日本語能力試験ー々") == "lookup failed: <japanese>")
    #expect(scrub("『吾輩は猫である』 failed") == "“<name>” failed")
    #expect(scrub("たなか@example.jp wrote") == "<email> wrote")
    #expect(
      scrub("ファイル“単語リスト.csv”を開けません: /var/mobile/Documents/単語.csv")
        == "<japanese>“<name>”<japanese>: <path>")
  }

  @Test("Cocoa's quoted names are removed in every language's quotes")
  func quotedNamesAreRemoved() {
    #expect(scrub("The file “Q3 plan.txt” couldn’t be opened") == "The file “<name>” couldn’t be opened")
    #expect(scrub("“/Users/pat/Pat’s notes.txt” is locked") == "“<name>” is locked")
    #expect(scrub("Die Datei „Q3 plan.txt“ fehlt") == "Die Datei “<name>” fehlt")
    #expect(scrub("Plik „Q3 plan.txt” jest") == "Plik “<name>” jest")
    #expect(scrub("Filen ”Q3 plan.txt” saknas") == "Filen “<name>” saknas")
    #expect(scrub("Le fichier « Q3 plan.txt » manque") == "Le fichier “<name>” manque")
    #expect(scrub("Datoteka »Q3 plan.txt« manjka") == "Datoteka “<name>” manjka")
    #expect(scrub("檔案「Q3 plan.txt」無法打開") == "<japanese>“<name>”<japanese>")
    #expect(scrub("הקובץ ״Q3 plan.txt״ חסר") == "הקובץ “<name>” חסר")
    #expect(scrub("الملف \"Q3 plan.txt\" مفقود") == "الملف “<name>” مفقود")
  }

  @Test("a bare file name with a data or media extension is removed")
  func bareFileNamesAreRemoved() {
    #expect(scrub("couldn't open notes.txt") == "couldn't open <file>")
    #expect(scrub("Q3_plan.v2.PDF failed to load") == "<file> failed to load")
    #expect(scrub("saved draft-1.json.") == "saved <file>.")
    #expect(scrub("can't decode 単語.csv") == "can't decode <file>")
    #expect(scrub("IMG_0042.HEIC, voice memo.m4a") == "<file>, voice <file>")
    #expect(scrub("LanguageReferenceData.sqlite3 is busy") == "<file> is busy")
    #expect(scrub("backup.zip2 and notes.txtx") == "backup.zip2 and notes.txtx")
  }

  @Test("what diagnoses a crash is kept")
  func diagnosticsAreKept() {
    for text in [
      "Fatal error: Index out of range",
      "/System/Library/Frameworks/SwiftUI.framework/SwiftUI",
      "/usr/lib/system/libsystem_kernel.dylib",
      "*** -[__NSArrayM objectAtIndex:]: index 5 beyond bounds [0 .. 2]",
      "App hanging for at least 2000 ms.",
      "account_sync: account_service_error.refused",
      "Could not cast value of type 'Foundation.URL' to 'Swift.String'",
      "SearchExperience/AccountSyncScheduler.swift:161",
      "nscocoa_error_domain.260 in SwiftUI.framework",
      "version 2.0.1 (8)",
    ] {
      #expect(scrub(text) == text)
    }
  }

  @Test("a binary's path keeps only its name")
  func binaryKeepsItsName() {
    #expect(CrashReportScrubber.scrubImagePath(appBinary) == "<path>/Zenbu Japanese")
    #expect(
      CrashReportScrubber.scrubImagePath("/System/Library/Frameworks/Foundation.framework/Foundation")
        == "/System/Library/Frameworks/Foundation.framework/Foundation")
    #expect(CrashReportScrubber.scrubImagePath(nil) == nil)
  }

  private static let shortLength = 5_000
  private static let longLength = 20_000
  private static let marginOverLinear = 1.1
  private static let partlyCountedTick = 1

  private static let longTexts: [(runs: [String], tail: String)] = [
    (["a"], ""), (["word "], ""), (["漢"], ""), (["a."], ""), (["a"], ".txt"), (["a“b ", "x"], ""),
    (["「a"], ""), (["『a"], ""), (["“a"], ""), (["«a"], ""), (["״a"], ""), (["\"a"], ""),
  ]

  private static func text(_ shape: (runs: [String], tail: String), length: Int) -> String {
    shape.runs.map { String(repeating: $0, count: length / $0.count) }.joined() + shape.tail
  }

  private static func work(of rule: NSRegularExpression, on text: String) -> Int {
    var ticks = 0
    rule.enumerateMatches(
      in: text, options: .reportProgress, range: NSRange(text.startIndex..., in: text)
    ) { _, flags, _ in
      if flags.contains(.progress) { ticks += 1 }
    }
    return ticks
  }

  @Test("every rule is linear: its work on a long text grows no faster than the text")
  func everyRuleIsLinear() async {
    let growth = Double(Self.longLength) / Double(Self.shortLength)
    for rule in CrashReportScrubber.rules {
      for shape in Self.longTexts {
        await Task.yield()
        let short = Self.work(of: rule, on: Self.text(shape, length: Self.shortLength))
        let long = Self.work(of: rule, on: Self.text(shape, length: Self.longLength))
        #expect(
          Double(long) <= growth * Self.marginOverLinear * Double(short + Self.partlyCountedTick),
          "\(rule.pattern) on \(shape.runs) \(shape.tail): \(short) ticks, then \(long)")
      }
    }
  }

  @Test("long text with nothing to remove stays as it is, and a long name becomes one placeholder")
  func longTextScrubs() {
    let length = Self.longLength
    for unchanged in [["a"], ["word "], ["a."]] {
      let text = Self.text((unchanged, ""), length: length)
      #expect(scrub(text) == text)
    }
    #expect(scrub(Self.text((["漢"], ""), length: length)) == "<japanese>")
    #expect(scrub(Self.text((["a"], ".txt"), length: length)) == "<file>")
    for opening in ["「", "『", "“", "«", "״", "\""] {
      #expect(!scrub(Self.text(([opening + "a"], ""), length: length)).isEmpty)
    }
  }

  @Test("a fully populated event keeps only what the policy allows")
  func fullEventKeepsOnlyWhatThePolicyAllows() throws {
    let scrubbed = CrashReportScrubber.scrub(Self.populatedEvent(binary: appBinary))

    #expect(scrubbed.serverName == nil)
    #expect(scrubbed.extra == nil)
    #expect(scrubbed.request == nil)
    #expect(scrubbed.error == nil)
    #expect(scrubbed.user?.userId == "install-id")
    #expect(scrubbed.user?.email == nil)
    #expect(scrubbed.user?.username == nil)
    #expect(scrubbed.message?.formatted == "opening <path>")
    let exception = try #require(scrubbed.exceptions?.first)
    #expect(exception.value == "bad URL <url>")
    #expect(exception.type == "NSInvalidArgumentException")
    #expect(exception.mechanism?.desc == "no entry for <japanese>")
    #expect(exception.mechanism?.data?["crash_info_messages"] as? [String] == ["can't read <path>"])
    let frame = try #require(exception.stacktrace?.frames.first)
    #expect(frame.package == "<path>/Zenbu Japanese")
    #expect(frame.function == "SearchExperience.DictionaryCore.init")
    #expect(frame.fileName == "<path>")
    #expect(frame.contextLine == nil)
    #expect(frame.preContext == nil)
    #expect(frame.postContext == nil)
    #expect(frame.vars == nil)
    let ownFrame = try #require(scrubbed.stacktrace?.frames.first)
    #expect(ownFrame.fileName == "<path>")
    #expect(ownFrame.package == "<path>/Zenbu Japanese")
    #expect(ownFrame.contextLine == nil)
    #expect(ownFrame.preContext == nil)
    #expect(ownFrame.postContext == nil)
    #expect(scrubbed.threads?.first?.stacktrace?.frames.first?.package == "<path>/Zenbu Japanese")
    #expect(scrubbed.debugMeta?.first?.codeFile == "<path>/Zenbu Japanese")
    #expect(scrubbed.breadcrumbs?.map(\.category) == ["zenbu.sync"])
    #expect(scrubbed.breadcrumbs?.first?.message == "sent to <email>")
    #expect(scrubbed.breadcrumbs?.first?.data?["to"] as? String == "<email>")
    #expect(scrubbed.breadcrumbs?.first?.data?["files"] as? [String] == ["<file>", "<path>"])
    #expect(scrubbed.breadcrumbs?.first?.data?["status"] as? Int == 400)
    #expect(Set(scrubbed.context?.keys.map { $0 } ?? []) == ["os", "app", "device", "problem"])
    #expect(scrubbed.context?["app"]?["device_app_hash"] == nil)
    #expect(scrubbed.context?["app"]?["app_version"] as? String == "2.0.1")
    #expect(scrubbed.context?["device"]?["locale"] == nil)
    #expect(scrubbed.context?["device"]?["timezone"] == nil)
    #expect(scrubbed.context?["device"]?["name"] == nil)
    #expect(scrubbed.context?["device"]?["model"] as? String == "iPhone17,2")
    #expect(scrubbed.context?["device"]?["free_memory"] as? Int == 1_073_741_824)
    #expect(scrubbed.context?["app"]?["app_name"] as? String == "<file> on <email>")
    #expect(scrubbed.context?["os"]?["kernel_version"] as? String == "Darwin 25.1.0 <path>")
    #expect(scrubbed.context?["problem"]?["code"] as? String == "bundle_unavailable")
  }

  private static func populatedEvent(binary: String) -> Event {
    let event = Event(level: .fatal)
    event.serverName = "Pat's iPhone"
    event.extra = ["clipboard": "食べる"]
    event.request = SentryRequest()
    event.request?.url = "https://example.com/private"
    event.error = NSError(domain: "zenbu", code: 1, userInfo: [NSLocalizedDescriptionKey: "x"])
    event.user = User(userId: "install-id")
    event.user?.email = "pat@example.com"
    event.user?.username = "pat"
    event.message = SentryMessage(formatted: "opening /var/mobile/Containers/Data/secret.txt")
    let exception = Exception(
      value: "bad URL https://example.com/private", type: "NSInvalidArgumentException")
    exception.mechanism = Mechanism(type: "nsexception")
    exception.mechanism?.desc = "no entry for 食べる"
    exception.mechanism?.data = ["crash_info_messages": ["can't read /var/mobile/notes.txt"]]
    let frame = Frame()
    frame.package = binary
    frame.function = "SearchExperience.DictionaryCore.init"
    frame.fileName = "/Users/pat/Developer/Zenbu/Sources/SearchExperience/DictionaryCore.swift"
    frame.contextLine = "let word = \"食べる\""
    frame.preContext = ["// pat@example.com", "let note = \"Q3 plan\""]
    frame.postContext = ["print(\"食べる\")"]
    frame.vars = ["word": "食べる"]
    exception.stacktrace = SentryStacktrace(frames: [frame], registers: [:])
    event.exceptions = [exception]
    let ownFrame = Frame()
    ownFrame.package = binary
    ownFrame.fileName = "/var/mobile/Containers/Data/Application/AB12/tmp/Generated.swift"
    ownFrame.contextLine = "lookup(\"たべる\")"
    ownFrame.preContext = ["let email = \"pat@example.com\""]
    ownFrame.postContext = ["}"]
    event.stacktrace = SentryStacktrace(frames: [ownFrame], registers: [:])
    let thread = SentryThread(threadId: 0)
    thread.stacktrace = SentryStacktrace(frames: [frame], registers: [:])
    event.threads = [thread]
    let meta = DebugMeta()
    meta.codeFile = binary
    event.debugMeta = [meta]
    let own = Breadcrumb(level: .info, category: "zenbu.sync")
    own.message = "sent to pat@example.com"
    own.data = [
      "to": "pat@example.com", "files": ["Q3_notes.txt", "/var/mobile/Documents/単語.csv"],
      "status": 400,
    ]
    event.breadcrumbs = [Breadcrumb(level: .info, category: "ui.click"), own]
    event.context = [
      "os": [
        "name": "iOS", "version": "26.1",
        "kernel_version": "Darwin 25.1.0 /Users/pat/Library/Developer/xnu",
      ],
      "app": [
        "app_version": "2.0.1", "device_app_hash": "abc123",
        "app_name": "Q3notes.json on pat@example.com",
      ],
      "device": [
        "model": "iPhone17,2", "locale": "ja_JP", "timezone": "Asia/Tokyo", "name": "Pat's iPhone",
        "free_memory": 1_073_741_824,
      ],
      "culture": ["timezone": "Asia/Tokyo", "locale": "ja_JP"],
      "problem": ["code": "bundle_unavailable"],
    ]
    return event
  }
}
