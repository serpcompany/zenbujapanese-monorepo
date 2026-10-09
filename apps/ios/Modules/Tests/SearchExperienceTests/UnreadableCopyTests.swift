import Foundation
import Testing

@testable import SearchExperience

extension UserDefaults {
  func keptCopies(of key: String) -> [Data] {
    dictionaryRepresentation()
      .filter { $0.key.hasPrefix("\(key).unreadable-") }
      .compactMap { $0.value as? Data }
  }
}

final class TemporaryDefaults {
  let suite = "tests-\(UUID().uuidString)"
  let defaults: UserDefaults

  init() throws {
    defaults = try #require(UserDefaults(suiteName: suite))
  }

  deinit {
    UserDefaults().removePersistentDomain(forName: suite)
  }
}

@Suite("Unreadable copies")
struct UnreadableCopyTests {
  @Test("a value is moved aside under its own key, and at most three copies are kept")
  func keepsDefaultsValues() throws {
    let temporary = try TemporaryDefaults()
    let defaults = temporary.defaults
    for number in 1...4 {
      defaults.set(Data("damaged \(number)".utf8), forKey: "store")
      UnreadableCopy.keep("store", in: defaults)
      #expect(defaults.object(forKey: "store") == nil)
    }
    let copies = defaults.keptCopies(of: "store")
    #expect(copies.count == 3)
    #expect(Set(copies).isSubset(of: (1...4).map { Data("damaged \($0)".utf8) }))
  }

  @Test("the copy just made stays, beside the two newest earlier ones, whatever the clock says")
  func keepsTheNewestCopy() throws {
    let temporary = try TemporaryDefaults()
    let defaults = temporary.defaults
    let later = "9999999999999"
    for suffix in ["a", "b", "c"] {
      defaults.set(Data("earlier \(suffix)".utf8), forKey: "store.unreadable-\(later)-\(suffix)")
    }
    defaults.set(Data("damaged".utf8), forKey: "store")
    UnreadableCopy.keep("store", in: defaults)
    #expect(
      Set(defaults.keptCopies(of: "store"))
        == [Data("damaged".utf8), Data("earlier b".utf8), Data("earlier c".utf8)])

    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let file = directory.appending(path: "index.json")
    for suffix in ["a", "b", "c"] {
      try Data().write(to: directory.appending(path: "index.unreadable-\(later)-\(suffix).json"))
    }
    try Data("damaged".utf8).write(to: file)
    let copy = try UnreadableCopy.keep(file: file)
    #expect(try Data(contentsOf: copy) == Data("damaged".utf8))
    #expect(Set(UnreadableCopy.copies(of: file).map(\.lastPathComponent)).count == 3)
  }

  @Test("the same bytes again make no second copy, whether a value or a file")
  func keepsEachDamageOnce() throws {
    let temporary = try TemporaryDefaults()
    let defaults = temporary.defaults
    for _ in 1...2 {
      defaults.set(Data("damaged".utf8), forKey: "store")
      UnreadableCopy.keep("store", in: defaults)
      #expect(defaults.object(forKey: "store") == nil)
    }
    #expect(defaults.keptCopies(of: "store") == [Data("damaged".utf8)])

    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let file = directory.appending(path: "index.json")
    try Data("damaged".utf8).write(to: file)
    let first = try UnreadableCopy.keep(file: file)
    #expect(try UnreadableCopy.keep(file: file) == first)
    #expect(UnreadableCopy.copies(of: file).count == 1)
  }

  private func temporaryDirectory() throws -> URL {
    let directory = FileManager.default.temporaryDirectory
      .appending(path: "unreadable-copy-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }

  @Test("a file is copied beside itself, and at most three copies are kept")
  func keepsFiles() throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let file = directory.appending(path: "index.json")
    for number in 1...4 {
      try Data("damaged \(number)".utf8).write(to: file)
      let copy = try UnreadableCopy.keep(file: file)
      #expect(copy.lastPathComponent.hasPrefix("index.unreadable-"))
      #expect(copy.pathExtension == "json")
    }
    let copies = try FileManager.default.contentsOfDirectory(atPath: directory.path)
      .filter { $0.hasPrefix("index.unreadable-") }
    #expect(copies.count == 3)
    #expect(try Data(contentsOf: file) == Data("damaged 4".utf8))
  }
}
