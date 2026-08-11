import Foundation
import SQLite3

struct KanjiStrokePoint: Hashable, Sendable {
  let x: Double
  let y: Double
}

enum KanjiStrokePathCommand: Hashable, Sendable {
  case move(to: KanjiStrokePoint)
  case cubic(
    control1: KanjiStrokePoint,
    control2: KanjiStrokePoint,
    end: KanjiStrokePoint
  )
}

struct KanjiStroke: Hashable, Sendable {
  let commands: [KanjiStrokePathCommand]
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

  #if DEBUG
  static func clientFromProcessArguments() -> KanjiStrokeOrderClient? {
    guard ProcessInfo.processInfo.arguments.contains("-InjectStrokeOrderFailureOnce") else {
      return nil
    }
    let fixture = KanjiStrokeOrderFailureFixture()
    return KanjiStrokeOrderClient { character in
      if await fixture.consumeFailure() {
        throw KanjiStrokeOrderFixtureError.injectedFailure
      }
      return try await KanjiStrokeOrderClient.live.diagram(character)
    }
  }
  #endif
}

#if DEBUG
private actor KanjiStrokeOrderFailureFixture {
  private var hasFailed = false

  func consumeFailure() -> Bool {
    guard !hasFailed else { return false }
    hasFailed = true
    return true
  }
}

private enum KanjiStrokeOrderFixtureError: Error {
  case injectedFailure
}
#endif

private actor KanjiStrokeData {
  static let shared = KanjiStrokeData()
  private var connection: KanjiStrokeSQLiteConnection?

  func diagram(_ character: KanjiCharacter) throws -> KanjiStrokeDiagram? {
    let database = try openDatabase()
    let sql = "SELECT viewport_size, stroke_count, strokes_json FROM stroke_diagrams WHERE character = ?"
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
          let statement else {
      throw KanjiStrokeDataError.sqlite(message: String(cString: sqlite3_errmsg(database)))
    }
    defer { sqlite3_finalize(statement) }
    sqlite3_bind_text(statement, 1, character.rawValue, -1, Self.transientDestructor)
    let stepResult = sqlite3_step(statement)
    if stepResult == SQLITE_DONE { return nil }
    guard stepResult == SQLITE_ROW else {
      throw KanjiStrokeDataError.sqlite(message: String(cString: sqlite3_errmsg(database)))
    }

    let viewportSize = sqlite3_column_double(statement, 0)
    let expectedStrokeCount = Int(sqlite3_column_int(statement, 1))
    guard let text = sqlite3_column_text(statement, 2) else {
      throw KanjiStrokeDataError.invalidArtifact("missing stroke geometry")
    }
    let compactStrokes = try JSONDecoder().decode(
      [[Double]].self,
      from: Data(String(cString: text).utf8)
    )
    let strokes = try compactStrokes.map(Self.decodeStroke)
    guard strokes.count == expectedStrokeCount, !strokes.isEmpty else {
      throw KanjiStrokeDataError.invalidArtifact("stroke-count mismatch")
    }
    return KanjiStrokeDiagram(
      character: character,
      viewportSize: viewportSize,
      strokes: strokes
    )
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
    let connection = KanjiStrokeSQLiteConnection(pointer: opened)
    self.connection = connection
    return connection.pointer
  }

  private static func decodeStroke(_ encoded: [Double]) throws -> KanjiStroke {
    var commands: [KanjiStrokePathCommand] = []
    var index = 0
    while index < encoded.count {
      let opcode = Int(encoded[index])
      index += 1
      switch opcode {
      case 0:
        guard index + 1 < encoded.count else {
          throw KanjiStrokeDataError.invalidArtifact("incomplete move command")
        }
        commands.append(.move(to: KanjiStrokePoint(x: encoded[index], y: encoded[index + 1])))
        index += 2
      case 1:
        guard index + 5 < encoded.count else {
          throw KanjiStrokeDataError.invalidArtifact("incomplete cubic command")
        }
        commands.append(
          .cubic(
            control1: KanjiStrokePoint(x: encoded[index], y: encoded[index + 1]),
            control2: KanjiStrokePoint(x: encoded[index + 2], y: encoded[index + 3]),
            end: KanjiStrokePoint(x: encoded[index + 4], y: encoded[index + 5])
          )
        )
        index += 6
      default:
        throw KanjiStrokeDataError.invalidArtifact("unknown path opcode")
      }
    }
    guard let first = commands.first, case .move = first else {
      throw KanjiStrokeDataError.invalidArtifact("stroke does not begin with a move")
    }
    return KanjiStroke(commands: commands)
  }

  private static let transientDestructor = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
}

private final class KanjiStrokeSQLiteConnection: @unchecked Sendable {
  let pointer: OpaquePointer

  init(pointer: OpaquePointer) {
    self.pointer = pointer
  }

  deinit {
    sqlite3_close(pointer)
  }
}

private enum KanjiStrokeDataError: Error {
  case missingBundledData
  case invalidArtifact(String)
  case sqlite(message: String)
}
