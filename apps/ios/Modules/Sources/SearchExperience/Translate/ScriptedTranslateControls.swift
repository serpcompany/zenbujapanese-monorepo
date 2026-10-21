import Foundation

#if DEBUG
  import Synchronization

  final class ScriptedClock: Sendable {
    static let skipCountdownNotice = "com.zenbujapanese.dictionary.uitests.skip-translate-countdown"
    static let holdNotice = "com.zenbujapanese.dictionary.uitests.translate-hold-clock"
    static let heldNotice = "com.zenbujapanese.dictionary.uitests.translate-clock-held"
    static let releaseNotice = "com.zenbujapanese.dictionary.uitests.translate-release-clock"

    private let state = Mutex<(skipped: TimeInterval, heldAt: Date?)>((0, nil))

    var now: Date {
      state.withLock { ($0.heldAt ?? Date.now).addingTimeInterval($0.skipped) }
    }

    func skipAhead(_ seconds: TimeInterval) {
      state.withLock { $0.skipped += seconds }
    }

    func hold() {
      state.withLock { $0.heldAt = $0.heldAt ?? Date.now }
    }

    func release() {
      state.withLock {
        guard let heldAt = $0.heldAt else { return }
        $0.skipped -= Date.now.timeIntervalSince(heldAt)
        $0.heldAt = nil
      }
    }

    func followsNotices(skippingAheadBy seconds: TimeInterval) {
      DarwinNotice.observe(Self.skipCountdownNotice) { _ in self.skipAhead(seconds) }
      DarwinNotice.observe(Self.holdNotice) { _ in
        self.hold()
        DarwinNotice.post(Self.heldNotice)
      }
      DarwinNotice.observe(Self.releaseNotice) { _ in self.release() }
    }
  }

  actor ScriptedHold {
    private var permits = 0
    private var waiting: [(id: UUID, continuation: CheckedContinuation<Void, Never>)] = []
    private var letGo: Set<UUID> = []
    private var cut: Set<UUID> = []

    func wait() async throws {
      try Task.checkCancellation()
      if permits > 0 {
        permits -= 1
        return
      }
      let id = UUID()
      await withTaskCancellationHandler {
        await withCheckedContinuation { continuation in
          if Task.isCancelled {
            continuation.resume()
          } else {
            waiting.append((id, continuation))
          }
        }
      } onCancel: {
        Task { await self.giveUp(id) }
      }
      let wasLetGo = letGo.remove(id) != nil
      if Task.isCancelled {
        if wasLetGo { letOneGo() }
        throw CancellationError()
      }
      if cut.remove(id) != nil { throw CancellationError() }
    }

    func letOneGo() {
      guard !waiting.isEmpty else {
        permits += 1
        return
      }
      let next = waiting.removeFirst()
      letGo.insert(next.id)
      next.continuation.resume()
    }

    func cutShort() {
      for one in waiting { cut.insert(one.id) }
      let stopped = waiting
      waiting.removeAll()
      for one in stopped { one.continuation.resume() }
    }

    private func giveUp(_ id: UUID) {
      guard let index = waiting.firstIndex(where: { $0.id == id }) else { return }
      waiting.remove(at: index).continuation.resume()
    }

    nonisolated func letsOneGoOnNotice(_ name: String) {
      DarwinNotice.observe(name) { _ in Task { await self.letOneGo() } }
    }
  }

  struct ScriptedHolds: Sendable {
    static let environmentKey = "ZENBU_TRANSLATE_HOLD"
    static let hearOnNotice = "com.zenbujapanese.dictionary.uitests.translate-hear-on"
    static let playOnNotice = "com.zenbujapanese.dictionary.uitests.translate-play-on"

    let startsSilent: Bool
    let hearing = ScriptedHold()
    let playing = ScriptedHold()

    static func forThisLaunch(_ environment: [String: String]) -> ScriptedHolds? {
      guard let held = environment[environmentKey], held == "1" || held == "silent" else { return nil }
      let holds = ScriptedHolds(startsSilent: held == "silent")
      holds.hearing.letsOneGoOnNotice(hearOnNotice)
      holds.playing.letsOneGoOnNotice(playOnNotice)
      return holds
    }
  }
#endif
