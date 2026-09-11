import XCTest

enum ConjugationUITestSupport {
  enum Mode {
    case plain
    case polite
  }

  struct ExpectedVerbRow {
    let id: String
    let plainReading: String
    let politeReading: String
  }

  struct ExpectedReading {
    let id: String
    let value: String
  }

  struct SectionElements {
    let title: XCUIElement
    let row: XCUIElement
    let info: XCUIElement
    let snapshot: SectionSnapshot?
  }

  struct SectionSnapshot {
    let title: XCUIElementSnapshot
    let row: XCUIElementSnapshot
    let info: XCUIElementSnapshot
    let mode: XCUIElementSnapshot?
    let appFrame: CGRect
    let visibleTop: CGFloat
    let visibleBottom: CGFloat
  }

  static let tsubusuEntryIdentifier = "word-detail.entry.bd93a73462d262782863f14e5c461706"
  static let tsubusuPartOfSpeech = "Godan Verb · Transitive Verb"
  static let tsubusuResultPrefix = "潰す, つぶす, to smash, to crush, to flatten"
  static let tsubusuRows = [
    ExpectedVerbRow(id: "present-future", plainReading: "つぶす", politeReading: "つぶします"),
    ExpectedVerbRow(id: "past", plainReading: "つぶした", politeReading: "つぶしました"),
    ExpectedVerbRow(id: "negative", plainReading: "つぶさない", politeReading: "つぶしません"),
    ExpectedVerbRow(
      id: "past-negative",
      plainReading: "つぶさなかった",
      politeReading: "つぶしませんでした"
    ),
    ExpectedVerbRow(id: "te-form", plainReading: "つぶして", politeReading: "つぶして"),
    ExpectedVerbRow(id: "potential", plainReading: "つぶせる", politeReading: "つぶせます"),
    ExpectedVerbRow(id: "passive", plainReading: "つぶされる", politeReading: "つぶされます"),
    ExpectedVerbRow(id: "causative", plainReading: "つぶさせる", politeReading: "つぶさせます"),
    ExpectedVerbRow(id: "conditional", plainReading: "つぶせば", politeReading: "つぶせば"),
    ExpectedVerbRow(id: "volitional", plainReading: "つぶそう", politeReading: "つぶしましょう"),
    ExpectedVerbRow(id: "imperative", plainReading: "つぶせ", politeReading: "つぶしなさい"),
  ]

  static var verbRowIDs: [String] { tsubusuRows.map(\.id) }

  static func tsubusuReadings(for mode: Mode) -> [ExpectedReading] {
    tsubusuRows.map { row in
      ExpectedReading(
        id: row.id,
        value: mode == .plain ? row.plainReading : row.politeReading
      )
    }
  }

  @MainActor
  static func reachSection(
    _ id: String,
    in app: XCUIApplication,
    list: XCUIElement,
    visibleTop: CGFloat? = nil,
    visibleBottom: CGFloat? = nil
  ) -> SectionElements {
    let title = app.staticTexts["conjugations.title.\(id)"]
    let row = app.descendants(matching: .any)["conjugations.row.\(id)"]
    let info = app.buttons["conjugations.info.\(id)"]
    var geometry: SectionSnapshot?
    for _ in 0..<8 {
      do {
        geometry = try sectionSnapshot(id, in: app)
      } catch {
        XCTFail("Could not capture conjugation section \(id): \(error)")
        return SectionElements(title: title, row: row, info: info, snapshot: nil)
      }
      if let geometry {
        let top = visibleTop ?? geometry.visibleTop
        let bottom = visibleBottom ?? geometry.visibleBottom
        if geometry.title.frame.minY < top
          || geometry.row.frame.minY < geometry.title.frame.maxY
        {
          // Plain Lists pin section headers. A hittable row can still be
          // partially covered by its header after a large swipe.
          let correction =
            max(
              top - geometry.title.frame.minY,
              geometry.title.frame.maxY - geometry.row.frame.minY
            ) + 12
          dragContent(correction, in: app, geometry: geometry)
          continue
        }
        if geometry.row.frame.maxY > bottom {
          dragContent(bottom - geometry.row.frame.maxY - 12, in: app, geometry: geometry)
          continue
        }
        if info.isHittable {
          return SectionElements(title: title, row: row, info: info, snapshot: geometry)
        }
      }
      list.swipeUp(velocity: .slow)
    }
    XCTFail("Could not fully expose conjugation section \(id) within eight gestures")
    return SectionElements(title: title, row: row, info: info, snapshot: geometry)
  }

  @MainActor
  private static func sectionSnapshot(_ id: String, in app: XCUIApplication) throws
    -> SectionSnapshot?
  {
    let root = try app.snapshot()
    guard let title = find("conjugations.title.\(id)", in: root),
      let row = find("conjugations.row.\(id)", in: root),
      let info = find("conjugations.info.\(id)", in: root),
      let list = find("conjugations.screen", in: root),
      let navigation = first(.navigationBar, in: root),
      let tabs = first(.tabBar, in: root)
    else { return nil }
    return SectionSnapshot(
      title: title, row: row, info: info, mode: find("conjugations.mode", in: root),
      appFrame: root.frame,
      visibleTop: max(navigation.frame.maxY, list.frame.minY),
      visibleBottom: tabs.frame.minY
    )
  }

  @MainActor
  private static func find(_ identifier: String, in root: XCUIElementSnapshot)
    -> XCUIElementSnapshot?
  {
    if root.identifier == identifier { return root }
    for child in root.children {
      if let match = find(identifier, in: child) { return match }
    }
    return nil
  }

  @MainActor
  private static func first(_ type: XCUIElement.ElementType, in root: XCUIElementSnapshot)
    -> XCUIElementSnapshot?
  {
    if root.elementType == type { return root }
    for child in root.children {
      if let match = first(type, in: child) { return match }
    }
    return nil
  }

  @MainActor
  private static func dragContent(
    _ correction: CGFloat, in app: XCUIApplication, geometry: SectionSnapshot
  ) {
    let height = geometry.visibleBottom - geometry.visibleTop
    let distance = min(max(abs(correction), 44), height * 0.35)
    let y = geometry.visibleTop + height * (correction > 0 ? 0.3 : 0.7)
    let origin = app.coordinate(withNormalizedOffset: .zero)
    let start = origin.withOffset(
      CGVector(dx: geometry.appFrame.midX - geometry.appFrame.minX, dy: y - geometry.appFrame.minY))
    let end = origin.withOffset(
      CGVector(
        dx: geometry.appFrame.midX - geometry.appFrame.minX,
        dy: y - geometry.appFrame.minY + (correction > 0 ? distance : -distance)))
    start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.1)
  }

  @MainActor
  static func reachRow(
    _ id: String,
    in app: XCUIApplication,
    list: XCUIElement
  ) -> XCUIElement {
    reachSection(id, in: app, list: list).row
  }

  @MainActor
  static func restoreTop(
    firstRowID: String = "present-future",
    requiresModePicker: Bool = true,
    in app: XCUIApplication,
    list: XCUIElement
  ) {
    let modePicker = app.descendants(matching: .any)["conjugations.mode"]
    for _ in 0..<8 {
      if let geometry = try? sectionSnapshot(firstRowID, in: app),
        geometry.title.frame.minY >= geometry.visibleTop,
        geometry.title.frame.maxY <= geometry.row.frame.minY,
        geometry.row.frame.maxY <= geometry.visibleBottom
      {
        if !requiresModePicker { return }
        if let mode = geometry.mode,
          mode.frame.minY >= geometry.visibleTop,
          mode.frame.maxY <= geometry.visibleBottom,
          modePicker.isHittable
        {
          return
        }
      }
      list.swipeDown(velocity: .slow)
    }
    XCTFail("Could not restore the complete conjugation controls within eight gestures")
  }

  @MainActor
  static func assertTsubusuEntry(
    in app: XCUIApplication,
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    XCTAssertTrue(
      app.collectionViews["word-detail.screen"].waitForExistence(timeout: 3),
      file: file,
      line: line
    )
    XCTAssertTrue(
      app.descendants(matching: .any)[tsubusuEntryIdentifier].waitForExistence(timeout: 3),
      file: file,
      line: line
    )
    XCTAssertTrue(
      app.staticTexts[tsubusuPartOfSpeech].waitForExistence(timeout: 3),
      file: file,
      line: line
    )
  }

  @MainActor
  static func assertSectionChrome(
    _ section: SectionElements,
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    guard let geometry = section.snapshot else {
      XCTFail("Missing coherent conjugation section geometry", file: file, line: line)
      return
    }
    XCTAssertLessThanOrEqual(
      geometry.title.frame.maxY,
      geometry.row.frame.minY,
      file: file,
      line: line
    )
    XCTAssertLessThanOrEqual(
      sectionGap(title: geometry.title.frame, row: geometry.row.frame),
      24,
      file: file,
      line: line
    )
    XCTAssertGreaterThanOrEqual(geometry.row.frame.height, 35, file: file, line: line)
    XCTAssertTrue(section.info.isHittable, file: file, line: line)
    XCTAssertGreaterThanOrEqual(geometry.info.frame.width, 43.5, file: file, line: line)
    XCTAssertGreaterThanOrEqual(geometry.info.frame.height, 43.5, file: file, line: line)
    XCTAssertTrue(
      geometry.row.label.hasSuffix(", \(geometry.title.label)"),
      file: file,
      line: line
    )
  }

  static func sectionGap(title: CGRect, row: CGRect) -> CGFloat {
    max(row.minY - title.maxY, 0)
  }
}
