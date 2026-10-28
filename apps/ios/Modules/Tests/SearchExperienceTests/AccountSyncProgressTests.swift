import Foundation
import Testing

@testable import SearchExperience

private struct AccountWord: Sendable {
  let id: String
  let headword: String
  let reading: String
  let changedAt: String?
}

@MainActor
@Suite("Account sync: the progress log", .timeLimit(.minutes(1)))
final class AccountSyncProgressTests {
  private typealias Fixture = AccountFixture

  private final class Clock {
    var now: Date

    init(_ now: Date) {
      self.now = now
    }
  }

  private final class Heard {
    var events: [WordKnowledgeEvent] = []
  }

  private static let n5 = """
    1bb81646f7b46da5a835e4fc681ad251 石鹸 せっけん
    1c460e92b7f21c8ef3a78f6ba309b4eb 一日 いちにち
    1cc9a84b606c82ec5a77ca0497e28107 その その
    1d7d9093d87117a6611dca25d76bfb2b 一月 ひとつき
    262ea7b4342d41837de1d4302b25b5a2 飲む のむ
    2adf2a5047bdb5b5b9e2e4f2d5c70ea6 子供 こども
    3083e7451bacf5536132597c5db3699b ７日 なのか
    30cde7ae271b09648fb82920896b8f75 朝ごはん あさごはん
    361fcb2dcfd04561b64db00eb3f978d4 作る つくる
    3b521bba5de016cf681d666fc8cea830 出かける でかける
    3d244722c9b350dcc2fb84d168c86d66 百 ひゃく
    40b2d3eab82c751cf943fcc3639cdd49 そこ そこ
    416881b46914b1b2d05104773f380a6f ９日 ここのか
    41a781c0c4db3a684840e46aceeb706a ８日 ようか
    45eefee1383a89cb3c6287032622e6fa 有る ある
    495d2e629fac12d14800676badeda4da さあ さあ
    50dd118eea1c0b3e7cfd367c8ed6b1b8 でも でも
    54422df09b040fcf97ba01ad2c58f0f4 晩御飯 ばんごはん
    57f2ffe3a81d10c6bc8966e6ef8f1cff ２日 ふつか
    63144ce076b6e237281af81667cbb876 ４日 よっか
    6364a87a7f5aae80243479058554ca57 直ぐに すぐに
    66ddbc836cfeb47e96cf66e64fa38411 綺麗 きれい
    6829120dbf52b1f2f9394e6742b38a16 ２０日 はつか
    6a7c344523fa02fd4e64fed3f3fb9aef 開く あく
    6fdbfea9636eb377fed270c2275152b3 零 れい
    70656de9599d910bd3ca7fd1262ec05d 赤 あか
    70e43be36b6edd46c48373ff8681318e 小さな ちいさな
    725ad020311fc37bf9f5f4f67073b842 引く ひく
    7f490a9c9c0da94f4e9474f4efe74be1 見る みる
    818c411c7720a83ee142ddfa37edc898 じゃあ じゃあ
    829ca2f2788401d743818cacfd388893 あの あの
    831b353610f2df4d883cb1d5b992908a 背 せ
    83cc9dfb97aa5b029d6a5b1d200c5153 等 など
    8437a68ce392574a87fc48a74e1d7409 友達 ともだち
    893a5d5ba3f262df6d17726cdc93bbcd ６日 むいか
    8ef86f16ebadeef61751c6cfcbe48838 止まる とまる
    8f606928a4f4a7eca8d14abd866c9ee2 茶碗 ちゃわん
    97e06f08a4e13d5a45b74b6c732490ac ３日 みっか
    9b750b4e7b92d8a10c706ae8d7f95ee3 答える こたえる
    9d8f4ce1d618d84960ded7c47fb23d1f 卵 たまご
    """.split(separator: "\n").map { $0.split(separator: " ").map(String.init) }

  private static let taberu = "042e07f7052f611fed33ddddf37f55fd"
  private static let eki = "d49b2f3c5cbf3002ebf317043cbebdad"
  private static let yesterdayMorning = "2026-10-26T23:00:00.000Z"
  private static let thisMorning = "2026-10-27T23:30:00.000Z"

  private let suite = "account-progress-\(UUID().uuidString)"
  private let defaults: UserDefaults
  private let tokyo = TimeZone(identifier: "Asia/Tokyo") ?? .gmt
  private let today = Date(timeIntervalSince1970: 1_793_145_600)
  private let yesterdayEvening = Date(timeIntervalSince1970: 1_793_098_800)

  init() {
    defaults = UserDefaults(suiteName: suite) ?? .standard
  }

  deinit {
    UserDefaults.standard.removePersistentDomain(forName: suite)
  }

  private static func words(_ count: Int, from start: Int = 0, at time: String?) -> [AccountWord] {
    n5[start..<start + count].map {
      AccountWord(id: $0[0], headword: $0[1], reading: $0[2], changedAt: time)
    }
  }

  private func signedIn(
    to words: [AccountWord], perPage: Int = 20, clock: Clock? = nil,
    before: (Fixture) -> Void = { _ in }
  ) async throws -> (Fixture, ProgressLog, CallCount) {
    let fixture = Fixture()
    fixture.serve(sync: { request in
      let page = Int(request.cursor?.replacingOccurrences(of: "page-", with: "") ?? "") ?? 0
      let shown = words.dropFirst(page * perPage).prefix(perPage).enumerated().map { index, word in
        StubSync.knownWord(
          word.id, known: false, version: page * perPage + index + 1, headword: word.headword,
          reading: word.reading, state: "learning", stateChangedAt: word.changedAt)
      }
      return StubSync.answer(
        results: StubSync.applied(request), changes: shown, cursor: "page-\(page + 1)",
        hasMore: (page + 1) * perPage < words.count)
    })
    await fixture.launch()
    let clock = clock ?? Clock(today)
    fixture.wordKnowledge.now = { clock.now }
    let log = ProgressLog(
      fileURL: fixture.directory.appending(path: "progress-log.json"), defaults: defaults,
      timeZone: tokyo)
    log.now = { clock.now }
    let asked = CallCount()
    let ask = log.askForDays
    log.askForDays = { request in
      _ = asked.next()
      return await ask(request)
    }
    await log.listen(to: fixture.wordKnowledge).value
    before(fixture)
    clock.now = today
    try await fixture.signIn()
    await log.flush()
    return (fixture, log, asked)
  }

  @Test("a first read of many words over two pages asks the core once and fills each day")
  func firstReadFillsEachDay() async throws {
    let words =
      Self.words(20, at: "2026-10-26T01:00:00.000Z")
      + Self.words(20, from: 20, at: "2026-10-27T01:00:00.000Z")
    let (fixture, log, asked) = try await signedIn(to: words)

    #expect(fixture.server.requests(to: "POST /v1/sync").count >= 2)
    #expect(asked.current == 1)
    #expect(log.days["2026-10-26"]?.changes.map(\.id) == words.prefix(20).map(\.id))
    #expect(log.days["2026-10-26"]?.totals == ProgressTotals(known: 0, learning: 20))
    #expect(log.days["2026-10-27"]?.changes.map(\.id) == words.suffix(20).map(\.id))
    #expect(log.days["2026-10-27"]?.totals == ProgressTotals(known: 0, learning: 40))
    #expect(log.days["2026-10-28"]?.changes.isEmpty == true)
    #expect(log.days["2026-10-28"]?.totals == ProgressTotals(known: 0, learning: 40))
    let stats = await log.stats()
    #expect(stats?.streak == 2)
  }

  @Test("a synced change dated today counts toward today's goal, and a word with no time only in the totals")
  func todaysSyncedChangeCounts() async throws {
    let words = Self.words(1, at: Self.thisMorning) + Self.words(1, from: 1, at: nil)
    let (fixture, log, asked) = try await signedIn(to: words)

    #expect(asked.current == 0)
    #expect(log.days["2026-10-28"]?.changes.map(\.id) == [words[0].id])
    #expect(log.days["2026-10-28"]?.totals == ProgressTotals(known: 0, learning: 2))
    let stats = await log.stats()
    #expect(stats?.today.added == 1)
    #expect(fixture.sync.state.queue.isEmpty)
  }

  @Test("a read's synced changes reach the log once, never as the device's own changes")
  func syncedChangesAreNotTheDevicesOwn() async throws {
    let heard = Heard()
    let words = Self.words(3, at: Self.yesterdayMorning) + Self.words(2, from: 3, at: Self.thisMorning)
    let (fixture, _, _) = try await signedIn(to: words, perPage: 2) { fixture in
      let told = fixture.wordKnowledge.progressObserver
      fixture.wordKnowledge.progressObserver = { event in
        heard.events.append(event)
        told?(event)
      }
    }

    #expect(heard.events.count == 1)
    guard case .synced(let changes, let totals)? = heard.events.first else {
      Issue.record("The read wasn't heard as synced")
      return
    }
    #expect(changes.map(\.id) == words.map(\.id))
    #expect(totals == ProgressTotals(known: 0, learning: 5))
    #expect(fixture.sync.state.queue.isEmpty)
  }

  @Test("a past day this device recorded keeps its goal and gains the change made on it elsewhere")
  func recordedDayGainsSyncedChange() async throws {
    let clock = Clock(yesterdayEvening)
    let synced = AccountWord(
      id: Self.taberu, headword: "食べる", reading: "たべる", changedAt: Self.yesterdayMorning)
    let (_, log, asked) = try await signedIn(to: [synced], clock: clock) { fixture in
      DailyGoal.write(5, to: self.defaults)
      fixture.wordKnowledge.setStatus(
        .learning, id: LanguageReferenceID(rawValue: Self.eki), headword: "駅", reading: "えき")
      clock.now = self.today
      DailyGoal.write(10, to: self.defaults)
    }

    #expect(asked.current == 1)
    #expect(log.days["2026-10-27"]?.changes.map(\.id) == [Self.taberu, Self.eki])
    #expect(log.days["2026-10-27"]?.totals == ProgressTotals(known: 0, learning: 2))
    #expect(log.days["2026-10-27"]?.goal == 5)
    #expect(log.days["2026-10-28"]?.goal == 10)
  }

  @Test("a word changed in the share sheet goes to the account with the time it was made")
  func shareSheetChangeSendsItsTime() async throws {
    let (fixture, _, _) = try await signedIn(to: [])
    let made = Date(timeIntervalSince1970: 1_793_098_800)
    let word = KnownWordChange(
      storedID: Self.eki, headword: "駅", reading: "えき", status: .learning)
    let inbox = try SharedChanges.holding(word, madeAt: made, in: fixture.directory)
    await inbox.apply(to: fixture.wordLists, fixture.wordKnowledge)
    try await fixture.syncNow()

    let sent = fixture.server.requests(to: "POST /v1/sync").flatMap(\.sync.mutations).filter {
      $0.entity == "knownWord"
    }
    #expect(sent.map(\.entityId) == [Self.eki])
    #expect(sent.first?.fields?["stateChangedAt"] == .string("2026-10-27T11:00:00.000Z"))
  }
}
