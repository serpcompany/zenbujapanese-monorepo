import Foundation
import notify

actor HeldAnswers {
  static let letGoNotice = "com.zenbujapanese.dictionary.uitests.let-linking-go"

  private var waiting: [(id: UUID, since: Date, answer: CheckedContinuation<Void, Never>)] = []

  var held: Int { waiting.count }

  func wait(since: Date = .now) async throws {
    let id = UUID()
    await withTaskCancellationHandler {
      await withCheckedContinuation { waiting.append((id, since, $0)) }
    } onCancel: {
      Task { await self.giveUp(id) }
    }
    try Task.checkCancellation()
  }

  private func giveUp(_ id: UUID) {
    guard let index = waiting.firstIndex(where: { $0.id == id }) else { return }
    waiting.remove(at: index).answer.resume()
  }

  @discardableResult
  func letGo(heldBefore cut: Date) -> Int {
    let going = waiting.filter { $0.since < cut }
    waiting.removeAll { $0.since < cut }
    for one in going { one.answer.resume() }
    return going.count
  }

  nonisolated func letGoOnNotice() {
    var registration: Int32 = 0
    notify_register_dispatch(Self.letGoNotice, &registration, .global()) { registration in
      var microseconds: UInt64 = 0
      notify_get_state(registration, &microseconds)
      let cut = Date(timeIntervalSince1970: TimeInterval(microseconds) / 1_000_000)
      Task { await self.letGo(heldBefore: cut) }
    }
  }
}
