import Foundation

@testable import SearchExperience

extension FakeAccountService {
  func refuseSet(_ refuses: Bool) {
    lock.withLock { refusesSet = refuses }
  }

  static func state(of data: [String: Any]?) -> String {
    data?["state"] as? String ?? ((data?["known"] as? Bool ?? false) ? "known" : "unknown")
  }

  func applyKnownWord(_ mutation: StubSyncRequest.Mutation, for user: String) -> [String: Any] {
    let key = "\(mutation.entity):\(mutation.entityId)"
    let current = accounts[user]?[key]
    let version = current?.version ?? 0
    let (applied, conflict) = outcomes(of: mutation, key: key, current: current)
    let held = Self.state(of: current?.data)
    let field = { (name: String) -> String? in
      if case .string(let value) = mutation.fields?[name] { return value }
      return nil
    }
    let state: String
    switch mutation.operation {
    case "set" where !refusesSet: state = field("state") ?? "unknown"
    case "mark": state = "known"
    case "clear": state = held == "learning" ? "learning" : "unknown"
    default: return StubSync.rejected(mutation.id, "unknown_operation")
    }
    if held == state { return applied(version) }
    guard (mutation.baseVersion ?? 0) == version else { return conflict() }
    let text = { (name: String) -> String in
      (state == "unknown" ? nil : field(name)) ?? current?.data?[name] as? String ?? ""
    }
    return save(
      user, key,
      [
        "itemId": mutation.entityId, "headword": text("headword"), "reading": text("reading"),
        "known": state == "known", "state": state,
      ], version + 1, applied)
  }
}
