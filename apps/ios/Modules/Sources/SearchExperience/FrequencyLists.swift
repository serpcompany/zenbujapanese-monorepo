import Foundation
import Observation

struct EnabledFrequencyList: Sendable {
  enum File: Sendable {
    case verified(URL)
    case unavailable(String)
  }

  let dictionary: FrequencyPackDisclosure
  let file: File
}

final class FrequencyLists: Observable, @unchecked Sendable {
  private struct Snapshot {
    var version = 0
    var lists: [EnabledFrequencyList] = []
    var described: [UInt8]?
    var files: [String: SQLiteJSONRows] = [:]
    var waiting: [CheckedContinuation<Void, Never>] = []
  }

  private struct Described: Encodable {
    struct Dictionary: Encodable {
      let id: String
      let kind: FrequencyPackKind
      let name: String
      let domain: String
      let description: String
      let version: String
      let source: String
      let coveredSourceRows: Int

      init(_ pack: FrequencyPackDisclosure) {
        id = pack.id.rawValue
        kind = pack.kind
        name = pack.displayName
        domain = pack.domain
        description = pack.domainDescription
        version = pack.version
        source = pack.attribution
        coveredSourceRows = pack.coveredSourceRows
      }
    }

    struct List: Encodable {
      let dictionary: Dictionary
      let unavailable: String?
    }

    let lists: [List]
  }

  private struct Unreadable: Encodable {
    let unavailable: String
  }

  static let unopenedFile = "Pack unavailable"

  private let lock = NSLock()
  private let registrar = ObservationRegistrar()
  private let open: (@Sendable () async -> Void)?
  private var snapshot = Snapshot()

  init(opening open: (@Sendable () async -> Void)? = nil) {
    self.open = open
  }

  var version: Int {
    registrar.access(self, keyPath: \.version)
    return lock.withLock { snapshot.version }
  }

  func ready() async {
    guard lock.withLock({ snapshot.version }) == 0 else { return }
    await open?()
    await withCheckedContinuation { continuation in
      let isReady = lock.withLock {
        if snapshot.version > 0 { return true }
        snapshot.waiting.append(continuation)
        return false
      }
      if isReady { continuation.resume() }
    }
  }

  func publish(_ lists: [EnabledFrequencyList]) {
    publish(lists, afterClosing: {})
  }

  func publish(
    _ lists: [EnabledFrequencyList], afterClosing changeFiles: () throws -> Void
  ) rethrows {
    let waiting = try lock.withLock {
      snapshot.files = [:]
      do {
        try changeFiles()
      } catch {
        snapshot.files = Self.opened(snapshot.lists).files
        throw error
      }
      let opened = Self.opened(lists)
      snapshot.lists = lists
      snapshot.files = opened.files
      return published(Self.json(Described(lists: opened.described)))
    }
    tell(waiting)
  }

  func publish(unavailable reason: String) {
    tell(
      lock.withLock {
        snapshot.lists = []
        snapshot.files = [:]
        return published(Self.json(Unreadable(unavailable: reason)))
      })
  }

  var reading: FrequencyListReading {
    FrequencyListReading(
      lists: { self.described() },
      rows: { self.rows(of: $0, $1, parametersJSON: $2) })
  }

  func described() -> [UInt8]? {
    registrar.access(self, keyPath: \.version)
    return lock.withLock { snapshot.described }
  }

  func rows(of list: String, _ sql: String, parametersJSON: String) -> JSONBytes {
    lock.withLock {
      guard let file = snapshot.files[list] else {
        var unread = JSONBytes()
        unread.append("{\"error\":\"The list is not open\"}")
        return unread
      }
      return file.answer(sql, parametersJSON: parametersJSON)
    }
  }

  private static func opened(
    _ lists: [EnabledFrequencyList]
  ) -> (described: [Described.List], files: [String: SQLiteJSONRows]) {
    var files: [String: SQLiteJSONRows] = [:]
    let described = lists.map { list in
      var unavailable: String?
      switch list.file {
      case .unavailable(let reason):
        unavailable = reason
      case .verified(let url):
        if let statements = try? SQLiteStatements(reading: url) {
          files[list.dictionary.id.rawValue] = SQLiteJSONRows(
            statements: statements, stoppingWhenCancelled: false)
        } else {
          unavailable = unopenedFile
        }
      }
      return Described.List(
        dictionary: Described.Dictionary(list.dictionary), unavailable: unavailable)
    }
    return (described, files)
  }

  private static func json(_ described: some Encodable) -> [UInt8]? {
    (try? JSONEncoder().encode(described)).map { Array($0) + [0] }
  }

  private func published(_ described: [UInt8]?) -> [CheckedContinuation<Void, Never>] {
    defer { snapshot.waiting = [] }
    snapshot.described = described
    snapshot.version += 1
    return snapshot.waiting
  }

  private func tell(_ waiting: [CheckedContinuation<Void, Never>]) {
    for continuation in waiting { continuation.resume() }
    Task { @MainActor in
      registrar.willSet(self, keyPath: \.version)
      registrar.didSet(self, keyPath: \.version)
    }
  }
}
