import Foundation

final class AccountRules: @unchecked Sendable {
  static let shared = AccountRules()

  private let lock = NSLock()
  private var core: Result<DictionaryCore, Error>?

  func name(_ typed: String) -> String? { text("accountName", typed) }

  func username(_ typed: String) -> String? { text("accountUsername", typed) }

  func removesTheUsername(_ typed: String) -> Bool { flag("removesTheUsername", typed) }

  func signInCode(_ typed: String) -> String? { text("signInCode", typed) }

  func listName(_ typed: String) -> String? { text("listName", typed) }

  func keptNoteText(_ typed: String) -> String { text("keptNoteText", typed) ?? typed }

  func noteFitsTheAccount(_ typed: String) -> Bool { text("noteText", typed) != nil }

  func watchText(_ typed: String) -> String? { text("watchText", typed) }

  func fitsTheWatch(_ field: String, _ value: Double) -> Bool {
    value.isFinite && flag("fitsTheWatch", "[\"\(field)\",\(value)]")
  }

  private func text(_ rule: String, _ argument: String) -> String? {
    lock.withLock { try? prepared().text(rule, argument) }
  }

  private func flag(_ rule: String, _ argument: String) -> Bool {
    lock.withLock { (try? prepared().flag(rule, argument)) ?? false }
  }

  private func prepared() throws -> DictionaryCore {
    if let core { return try core.get() }
    let made = Result { try DictionaryCore(script: .accountRules) }
    core = made
    return try made.get()
  }
}
