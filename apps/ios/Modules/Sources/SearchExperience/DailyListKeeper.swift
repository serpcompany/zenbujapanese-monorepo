import Foundation

@MainActor
final class DailyListKeeper {
  static let shared = DailyListKeeper(log: .shared, lists: .shared)

  private let log: ProgressLog
  private let lists: WordLists
  private let core: PresentationCore
  private let locale: Locale
  private var working: Task<Void, Never>?

  init(
    log: ProgressLog, lists: WordLists, core: PresentationCore = .shared,
    locale: Locale = .autoupdatingCurrent
  ) {
    self.log = log
    self.lists = lists
    self.core = core
    self.locale = locale
  }

  func start() {
    log.changeRecorded = { [weak self] change, day in self?.keep(change, on: day) }
  }

  func settled() async {
    await working?.value
  }

  private func keep(_ change: KnownWordChange, on day: String) {
    guard let listID = AccountRules.shared.dailyListID(day) else { return }
    let asked = ProgressStatsRequest(
      days: log.days.filter { $0.key == day }, goal: log.goal, today: day)
    let core = core
    let earlier = working
    working = Task {
      await earlier?.value
      guard let stats = await ProgressLog.answer(asked, using: core) else { return }
      let added = stats.words.first { $0.day == day }?.addedToLearning ?? []
      if !lists.isLoaded { await lists.flush() }
      place(change, in: listID, day: day, counted: added.contains(change.storedID))
    }
  }

  private func place(_ change: KnownWordChange, in listID: UUID, day: String, counted: Bool) {
    guard counted else { return lists.remove(storedID: change.storedID, from: listID) }
    guard change.status == .learning else { return }
    if !lists.hasList(listID) {
      lists.createList(named: DailyListDays.name(of: day, locale: locale), id: listID)
    }
    lists.addWord(
      LanguageReferenceID(rawValue: change.storedID), headword: change.headword,
      reading: change.reading, to: listID)
  }
}
