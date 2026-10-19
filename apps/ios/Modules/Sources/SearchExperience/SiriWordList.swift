import Foundation
import Observation

@MainActor
public final class SiriWordList {
  public static let shared = SiriWordList(sources: .live, defaults: .standard)
  static let defaultLimit = 100
  private static let settling = Duration.seconds(2)
  private static let storageKey = "siri.words.v1"

  struct Sources {
    var learnerWords: @MainActor () async -> [LearnerWord]?
    var siriWords: @Sendable ([LearnerWord], Int) async throws -> [SiriWord]
    var watchLearnerWords: @MainActor (@escaping @MainActor () -> Void) -> Void
  }

  public private(set) var words: [SiriWord]
  public var changed: (@MainActor () -> Void)?
  let limit: Int
  private let sources: Sources
  private let defaults: UserDefaults
  private var pendingRefresh: Task<Void, Never>?

  init(sources: Sources, defaults: UserDefaults) {
    self.sources = sources
    self.defaults = defaults
    limit =
      LaunchHarness.siriWordLimit(ProcessInfo.processInfo.environment, keptIn: defaults)
      ?? Self.defaultLimit
    words =
      defaults.data(forKey: Self.storageKey)
      .flatMap { try? JSONDecoder().decode([SiriWord].self, from: $0) } ?? []
  }

  public func start() {
    sources.watchLearnerWords { [weak self] in self?.setNeedsRefresh() }
    setNeedsRefresh()
  }

  nonisolated static func learnerWordsChanged() {
    Task { @MainActor in shared.setNeedsRefresh() }
  }

  func setNeedsRefresh() {
    pendingRefresh?.cancel()
    pendingRefresh = Task { [weak self] in
      try? await Task.sleep(for: Self.settling)
      guard !Task.isCancelled else { return }
      await self?.refresh()
    }
  }

  func refresh() async {
    guard let learner = await sources.learnerWords(),
      let fresh = try? await sources.siriWords(learner, limit), fresh != words
    else { return }
    words = fresh
    defaults.set(try? JSONEncoder().encode(fresh), forKey: Self.storageKey)
    changed?()
  }
}

extension SiriWordList.Sources {
  static let live = SiriWordList.Sources(
    learnerWords: {
      let (lists, knowledge) = (WordLists.shared, WordKnowledge.shared)
      guard lists.isLoaded, knowledge.isLoaded else { return nil }
      return LearnerWord.gathered(
        recentSearches: await RecentSearchStore.live.load(),
        lists: lists.lists.map { lists.words(in: $0.id) },
        known: knowledge.knownRecords)
    },
    siriWords: { try await SiriWordData.shared.words(for: $0, limit: $1) },
    watchLearnerWords: watchSavedWords
  )

  @MainActor
  private static func watchSavedWords(_ changed: @escaping @MainActor () -> Void) {
    withObservationTracking {
      _ = (WordLists.shared.isLoaded, WordLists.shared.membershipsByList)
      _ = (WordKnowledge.shared.isLoaded, WordKnowledge.shared.knownRecords)
    } onChange: {
      Task { @MainActor in
        changed()
        watchSavedWords(changed)
      }
    }
  }
}
