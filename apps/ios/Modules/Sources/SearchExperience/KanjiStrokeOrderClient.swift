import Foundation
import SQLite3

struct KanjiStrokePoint: Decodable, Hashable, Sendable {
  let x: Double
  let y: Double
}

enum KanjiStrokePathCommand: Decodable, Hashable, Sendable {
  case move(to: KanjiStrokePoint)
  case cubic(
    control1: KanjiStrokePoint,
    control2: KanjiStrokePoint,
    end: KanjiStrokePoint
  )

  private enum CodingKeys: String, CodingKey {
    case end
    case controls
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let end = try container.decode(KanjiStrokePoint.self, forKey: .end)
    guard let controls = try container.decode([KanjiStrokePoint]?.self, forKey: .controls) else {
      self = .move(to: end)
      return
    }
    guard controls.count == 2 else {
      throw DecodingError.dataCorruptedError(
        forKey: .controls, in: container, debugDescription: "A curve has two control points")
    }
    self = .cubic(control1: controls[0], control2: controls[1], end: end)
  }
}

struct KanjiStroke: Decodable, Hashable, Sendable {
  let commands: [KanjiStrokePathCommand]

  init(from decoder: Decoder) throws {
    commands = try decoder.singleValueContainer().decode([KanjiStrokePathCommand].self)
  }
}

struct KanjiStrokeDiagram: Identifiable, Hashable, Sendable {
  let character: KanjiCharacter
  let viewportSize: Double
  let strokes: [KanjiStroke]

  var id: KanjiCharacter { character }
}

struct KanjiStrokeOrderClient: Sendable {
  var diagram: @Sendable (KanjiCharacter) async throws -> KanjiStrokeDiagram?

  static let live = KanjiStrokeOrderClient { character in
    try await KanjiStrokeData.shared.diagram(character)
  }
}

private actor KanjiStrokeData {
  static let shared = KanjiStrokeData()
  private var connection: SQLiteConnection?

  func diagram(_ character: KanjiCharacter) throws -> KanjiStrokeDiagram? {
    let database = try openDatabase()
    let sql = "SELECT viewport_size, stroke_count, strokes_json FROM stroke_diagrams WHERE character = ?"
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
          let statement else {
      throw KanjiStrokeDataError.sqlite(message: String(cString: sqlite3_errmsg(database)))
    }
    defer { sqlite3_finalize(statement) }
    sqliteBind(character.rawValue, at: 1, to: statement)
    let stepResult = sqlite3_step(statement)
    if stepResult == SQLITE_DONE { return nil }
    guard stepResult == SQLITE_ROW else {
      throw KanjiStrokeDataError.sqlite(message: String(cString: sqlite3_errmsg(database)))
    }

    guard let text = sqlite3_column_text(statement, 2) else {
      throw KanjiStrokeDataError.invalidArtifact("missing stroke geometry")
    }
    let row =
      "{\"viewportSize\":\(sqlite3_column_double(statement, 0)),"
      + "\"strokeCount\":\(sqlite3_column_int(statement, 1)),"
      + "\"strokes\":\(String(cString: text))}"
    let drawn: Drawn = try PresentationCore.shared.answer("kanjiStrokes", row)
    return KanjiStrokeDiagram(
      character: character,
      viewportSize: drawn.viewportSize,
      strokes: drawn.strokes
    )
  }

  private struct Drawn: Decodable {
    let viewportSize: Double
    let strokes: [KanjiStroke]
  }

  private func openDatabase() throws -> OpaquePointer {
    if let connection { return connection.pointer }
    guard let url = Bundle.module.url(forResource: "KanjiStrokeData", withExtension: "sqlite3") else {
      throw KanjiStrokeDataError.missingBundledData
    }
    var opened: OpaquePointer?
    guard sqlite3_open_v2(
      url.path,
      &opened,
      SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX,
      nil
    ) == SQLITE_OK, let opened else {
      defer { sqlite3_close(opened) }
      throw KanjiStrokeDataError.sqlite(
        message: opened.map { String(cString: sqlite3_errmsg($0)) } ?? "open failed"
      )
    }
    let connection = SQLiteConnection(pointer: opened)
    self.connection = connection
    return connection.pointer
  }
}

private enum KanjiStrokeDataError: Error {
  case missingBundledData
  case invalidArtifact(String)
  case sqlite(message: String)
}
