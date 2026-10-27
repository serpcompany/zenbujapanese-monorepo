import Foundation
import Testing

@Suite("A test's defaults")
struct MemoryDefaultsTests {
  @Test("stay in memory: each way the app writes and reads defaults reaches the test's own values, and none the process's")
  func stayInMemory() {
    let key = "memory-defaults-\(UUID().uuidString)"
    let defaults = MemoryDefaults()
    defaults.set(true, forKey: "\(key).bool")
    defaults.set(1.5, forKey: "\(key).double")
    defaults.set("text", forKey: "\(key).string")
    defaults.set(["a", "b"], forKey: "\(key).strings")
    defaults.set(["k": "v"], forKey: "\(key).dictionary")
    defaults.set(Data("d".utf8), forKey: "\(key).data")

    #expect(defaults.bool(forKey: "\(key).bool"))
    #expect(defaults.double(forKey: "\(key).double") == 1.5)
    #expect(defaults.string(forKey: "\(key).string") == "text")
    #expect(defaults.stringArray(forKey: "\(key).strings") == ["a", "b"])
    #expect(defaults.dictionary(forKey: "\(key).dictionary") as? [String: String] == ["k": "v"])
    #expect(defaults.data(forKey: "\(key).data") == Data("d".utf8))
    #expect(defaults.dictionaryRepresentation().count == 6)
    #expect(!UserDefaults.standard.dictionaryRepresentation().keys.contains { $0.hasPrefix(key) })
  }

  @Test("an object opened on them reads and writes the same values, and tells its own observers of its changes")
  func openedObjectsShareValues() {
    let defaults = MemoryDefaults()
    let opened = defaults.opened()
    let heard = CallCount()
    let observer = NotificationCenter.default.addObserver(
      forName: UserDefaults.didChangeNotification, object: opened, queue: nil
    ) { _ in _ = heard.next() }
    defer { NotificationCenter.default.removeObserver(observer) }

    opened.set("kept", forKey: "key")
    #expect(defaults.string(forKey: "key") == "kept")
    defaults.removeObject(forKey: "key")
    #expect(opened.object(forKey: "key") == nil)
    #expect(heard.current == 1)
  }
}
