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
    for _ in 0..<8 {
      if title.exists, row.exists, info.exists {
        if let visibleTop, title.frame.minY < visibleTop {
          list.swipeDown(velocity: .slow)
          continue
        }
        if let visibleBottom, row.frame.maxY > visibleBottom {
          list.swipeUp(velocity: .slow)
          continue
        }
        return SectionElements(title: title, row: row, info: info)
      }
      list.swipeUp(velocity: .slow)
    }
    return SectionElements(title: title, row: row, info: info)
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
    let firstRow = app.descendants(matching: .any)["conjugations.row.\(firstRowID)"]
    let modePicker = app.descendants(matching: .any)["conjugations.mode"]
    for _ in 0..<8
    where !firstRow.exists || (requiresModePicker && !modePicker.isHittable) {
      list.swipeDown(velocity: .slow)
    }
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
    XCTAssertTrue(section.title.exists, file: file, line: line)
    XCTAssertTrue(section.row.exists, file: file, line: line)
    XCTAssertTrue(section.info.exists, file: file, line: line)
    XCTAssertLessThanOrEqual(
      section.title.frame.maxY,
      section.row.frame.minY,
      file: file,
      line: line
    )
    XCTAssertLessThanOrEqual(
      sectionGap(title: section.title.frame, row: section.row.frame),
      24,
      file: file,
      line: line
    )
    XCTAssertGreaterThanOrEqual(section.row.frame.height, 35, file: file, line: line)
    XCTAssertTrue(section.info.isHittable, file: file, line: line)
    XCTAssertGreaterThanOrEqual(section.info.frame.width, 43.5, file: file, line: line)
    XCTAssertGreaterThanOrEqual(section.info.frame.height, 43.5, file: file, line: line)
    XCTAssertTrue(
      section.row.label.hasSuffix(", \(section.title.label)"),
      file: file,
      line: line
    )
  }

  static func sectionGap(title: CGRect, row: CGRect) -> CGFloat {
    max(row.minY - title.maxY, 0)
  }
}
