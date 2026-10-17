import XCTest

enum TextSize: String {
  case standard = "the default text size"
  case largest = "the largest text size"

  var arguments: [String] { self == .largest ? TestDevice.largestTextArguments : [] }
}

enum Appearance: String {
  case light
  case dark
}

struct AuditPass {
  let size: TextSize
  let appearance: Appearance

  static let standard = AuditPass(size: .standard, appearance: .light)
  static let largest = AuditPass(size: .largest, appearance: .light)
  static let dark = AuditPass(size: .standard, appearance: .dark)

  var name: String { "\(size.rawValue), \(appearance.rawValue)" }
  var environment: [String: String] { ["ZENBU_APPEARANCE": appearance.rawValue] }
}

enum AuditKind: String {
  case contrast = "contrast"
  case elementDetection = "element detection"
  case hitRegion = "hit region"
  case elementDescription = "element description"
  case dynamicType = "Dynamic Type"
  case textClipped = "text clipped"
  case trait = "trait"
  case action = "action"
  case parentChild = "parent and child"
}

struct AuditFinding: CustomStringConvertible {
  let screen: String
  let kind: AuditKind
  let identifier: String
  let label: String
  let elementType: XCUIElement.ElementType?
  let frame: CGRect
  let detail: String
  let explanation: String

  var description: String {
    let element =
      elementType.map { "type \($0.rawValue) \"\(identifier)\" labeled \"\(label)\" at \(frame)" }
      ?? "no element"
    return "\(screen): [\(kind.rawValue)] \(element): \(detail)"
  }
}

class AccessibilityAuditCase: ZenbuUITestCase {
  static let keepsEveryScreen =
    ProcessInfo.processInfo.environment["ZENBU_AUDIT_SCREENSHOTS"] == "1"
  private(set) var pass = AuditPass.standard
  private var unexcused: [AuditFinding] = []
  private var excused: [AuditFinding] = []
  private var reported: [AuditFinding] = []
  private var audited: [String] = []
  private var matched: [String: Int] = [:]

  func launch(_ pass: AuditPass, _ environment: [String: String] = [:]) -> XCUIApplication {
    self.pass = pass
    return launch(pass.environment.merging(environment) { $1 }, arguments: pass.size.arguments)
  }

  func skipWithoutTextSizes() throws {
    try XCTSkipIf(
      TestDevice.largestTextArguments.isEmpty,
      "the \(device.name) has no Dynamic Type: its text sizes don't follow a setting")
  }

  func openFixtureImage(_ pass: AuditPass) throws -> XCUIApplication {
    self.pass = pass
    return try openFixtureImage(pass.environment, arguments: pass.size.arguments)
  }

  func audit(_ screen: String, in app: XCUIApplication) {
    let found = unexcused.count + excused.count + reported.count
    let continues = continueAfterFailure
    continueAfterFailure = true
    defer { continueAfterFailure = continues }
    for audit in audits {
      do {
        try app.performAccessibilityAudit(for: audit.type) { issue in
          let finding = Self.finding(issue, on: screen)
          return self.sort(finding) || finding.elementType != nil
        }
      } catch {
        XCTFail("the \(audit.kind.rawValue) audit of \(screen) couldn't run: \(error)")
      }
    }
    audited.append(screen)
    if unexcused.count + excused.count + reported.count > found || Self.keepsEveryScreen {
      let picture = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      picture.name = "\(screen), \(pass.name)"
      picture.lifetime = .keepAlways
      add(picture)
    }
  }

  func auditAtTheLargestSize(_ screen: String, showing element: XCUIElement, in app: XCUIApplication) {
    guard pass.size == .largest else { return }
    reveal(element, in: app)
    audit(screen, in: app)
  }

  private var audits: [(type: XCUIAccessibilityAuditType, kind: AuditKind)] {
    TestDevice.audits.filter { AllowedFinding.notRun[$0.kind]?.devices.contains(device) != true }
  }

  private func sort(_ finding: AuditFinding) -> Bool {
    if AllowedFinding.reportedOnly[finding.kind]?.devices.contains(device) == true {
      reported.append(finding)
      return true
    }
    let allowed = AllowedFinding.list.indices.first { index in
      let entry = AllowedFinding.list[index]
      return entry.excuses(finding, on: device, in: pass)
        && matched["\(index) \(finding.screen)", default: 0] < entry.element.limit ?? .max
    }
    guard let allowed else {
      unexcused.append(finding)
      return false
    }
    excused.append(finding)
    matched["\(allowed) \(finding.screen)", default: 0] += 1
    return true
  }

  private var unneeded: [String] {
    AllowedFinding.list.enumerated().flatMap { index, allowed in
      Set(audited).sorted().compactMap { screen in
        let count = matched["\(index) \(screen)", default: 0]
        guard allowed.applies(to: screen, on: device, in: pass), count < allowed.element.limit ?? 1,
          audits.contains(where: { $0.kind == allowed.kind })
        else { return nil }
        return "\(screen): the allowed [\(allowed.kind.rawValue)] \(allowed.element) matched \(count)"
      }
    }
  }

  override func tearDownWithError() throws {
    MainActor.assumeIsolated { reportFindings() }
  }

  private func reportFindings() {
    let unneeded = unneeded
    defer {
      unexcused = []
      excused = []
      reported = []
      audited = []
      matched = [:]
    }
    let report = XCTAttachment(string: report(unneeded: unneeded))
    report.name = "Accessibility findings"
    report.lifetime = .keepAlways
    add(report)
    XCTAssertTrue(
      unexcused.isEmpty,
      "\(unexcused.count) accessibility findings on the \(device.name) at \(pass.name):\n"
        + unexcused.map(\.description).joined(separator: "\n"))
  }

  private func report(unneeded: [String]) -> String {
    let meanings = Set(
      (unexcused + excused + reported).map { "[\($0.kind.rawValue)] \($0.detail): \($0.explanation)" })
    let sections = [
      ("Not allowed", unexcused.map(\.description)), ("Allowed", excused.map(\.description)),
      ("Reported, not failed", reported.map(\.description)), ("Allowed but unneeded", unneeded),
      ("What each finding means", meanings.sorted()),
    ]
    let body = sections.map { "\($0.0) (\($0.1.count)):\n" + $0.1.joined(separator: "\n") }
    return "\(device.name), \(pass.name)\nAudited: \(audited.joined(separator: "; "))\n\n"
      + body.joined(separator: "\n\n")
  }

  private static func finding(_ issue: XCUIAccessibilityAuditIssue, on screen: String) -> AuditFinding {
    let kind = TestDevice.audits.first { issue.auditType.contains($0.type) }?.kind ?? .elementDetection
    let element = try? issue.element?.snapshot()
    let unresolved = element != nil ? "" : issue.element == nil ? " (no element)" : " (element gone)"
    return AuditFinding(
      screen: screen, kind: kind, identifier: element?.identifier ?? "",
      label: element?.label ?? "", elementType: element?.elementType, frame: element?.frame ?? .zero,
      detail: issue.compactDescription + unresolved, explanation: issue.detailedDescription)
  }
}
