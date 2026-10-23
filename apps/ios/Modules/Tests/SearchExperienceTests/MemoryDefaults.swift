import Foundation

class MemoryDefaults: UserDefaults {
  final class Values: @unchecked Sendable {
    private let lock = NSLock()
    private var kept: [String: Any] = [:]

    subscript(key: String) -> Any? {
      get { lock.withLock { kept[key] } }
      set { lock.withLock { kept[key] = newValue } }
    }

    var all: [String: Any] { lock.withLock { kept } }
  }

  private let values: Values

  init(_ values: Values = Values()) {
    self.values = values
    super.init(suiteName: nil)!
  }

  func opened() -> sending MemoryDefaults {
    MemoryDefaults(values)
  }

  override func object(forKey defaultName: String) -> Any? {
    values[defaultName]
  }

  override func set(_ value: Any?, forKey defaultName: String) {
    keep(value, forKey: defaultName)
  }

  override func removeObject(forKey defaultName: String) {
    keep(nil, forKey: defaultName)
  }

  override func dictionaryRepresentation() -> [String: Any] {
    values.all
  }

  private func keep(_ value: Any?, forKey key: String) {
    values[key] = value
    NotificationCenter.default.post(name: UserDefaults.didChangeNotification, object: self)
  }
}
