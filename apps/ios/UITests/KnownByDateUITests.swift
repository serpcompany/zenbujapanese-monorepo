import XCTest

final class KnownByDateUITests: ZenbuUITestCase {
  func testItOpensFromProgressAndListsTheWordsMarkedKnownUnderTheirDays() throws {
    let app = launch(progressSeed)
    openKnownByDate(in: app)
    waitUntil(find("known-by-date.total", in: app), "label == %@", "16 marked Known")
    waitUntil(find("known-by-date.change", in: app), "label == %@", "+7 vs the week before")
    let marked = try markedKnownInTheSeed()
    let today = find("known-by-date.day.\(Self.dayID(back: 0))", in: app)
    let yesterday = find("known-by-date.day.\(Self.dayID(back: 1))", in: app)
    waitUntil(today, "label == %@", "Today, 1 word")
    waitUntil(reveal(yesterday, in: app), "label == %@", "Yesterday, 3 words")
    let todays = reveal(find("result.\(marked[marked.count - 1])", in: app), in: app)
    XCTAssertGreaterThanOrEqual(todays.frame.minY, today.frame.maxY)
    XCTAssertLessThanOrEqual(todays.frame.maxY, yesterday.frame.minY)
    for id in marked[(marked.count - 4)..<(marked.count - 1)] {
      XCTAssertGreaterThanOrEqual(reveal(find("result.\(id)", in: app), in: app).frame.minY, yesterday.frame.maxY)
    }
    let first = Calendar.current.date(byAdding: .day, value: -34, to: .now) ?? .now
    waitUntil(
      reveal(find("known-by-date.footer", in: app), in: app), "label == %@",
      "Dates start \(first.formatted(.dateTime.month(.abbreviated).day().year())), when Zenbu began keeping them.")
  }

  func testEarlierWeeksStopAtTheWeekHoldingTheLogsFirstDay() {
    let app = launch(progressSeed)
    openKnownByDate(in: app)
    let total = find("known-by-date.total", in: app)
    let earlier = find("known-by-date.earlier", in: app)
    let later = find("known-by-date.later", in: app)
    waitUntil(total, "label == %@", "16 marked Known")
    XCTAssertFalse(later.isEnabled)
    for shown in ["9 marked Known", "4 marked Known", "13 marked Known", "12 marked Known"] {
      tap(earlier)
      waitUntil(total, "label == %@", shown)
    }
    waitUntil(earlier, "isEnabled == false")
    XCTAssertFalse(find("known-by-date.change", in: app).exists)
    tap(later)
    waitUntil(find("known-by-date.change", in: app), "label == %@", "+1 vs the week before")
  }

  func testTappingABarShowsThatDaysLineAndARowOpensItsPage() throws {
    let app = launch(progressSeed)
    openKnownByDate(in: app)
    let line = find("known-by-date.day", in: app)
    waitUntil(line, "label == %@", Self.dayName(back: 0) + " · 1 marked Known")
    let yesterday = Self.dayName(back: 1) + " · 3 marked Known"
    tap(find("known-by-date.chart", in: app).descendants(matching: .any)
      .matching(NSPredicate(format: "label == %@", yesterday)).firstMatch)
    waitUntil(line, "label == %@", yesterday)
    let marked = try markedKnownInTheSeed()
    tap(reveal(find("result.\(marked[marked.count - 1])", in: app), in: app))
    waitForTag("Known", on: "word-detail.status", in: app)
  }

  private func openKnownByDate(in app: XCUIApplication) {
    open(.account, in: app)
    tap(reveal(find("account.progress.see", in: app), in: app), toShow: find("progress.today", in: app))
    tap(reveal(find("progress.known-by-date", in: app), in: app), toShow: find("known-by-date.total", in: app))
  }

  private func markedKnownInTheSeed() throws -> [String] {
    struct Seed: Decodable {
      struct Day: Decodable { let known: Int }
      struct Word: Decodable { let id: String }
      let knownBefore: Int
      let days: [Day]
      let words: [Word]
    }
    let seed = try JSONDecoder().decode(Seed.self, from: Data(contentsOf: progressFixture))
    let marked = seed.days.reduce(0) { $0 + $1.known }
    return seed.words[seed.knownBefore..<(seed.knownBefore + marked)].map(\.id)
  }
}
