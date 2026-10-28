import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Account sync: Learning", .timeLimit(.minutes(1)))
struct AccountSyncLearningTests {
  private typealias Fixture = AccountFixture

  private func known(_ itemID: String, in service: FakeAccountService) -> String? {
    service.data(of: "knownWord:\(itemID)", for: Fixture.email)
      .map { FakeAccountService.state(of: $0) }
  }

  @Test("a word being learned syncs as set with its state, and another device shows it Learning")
  func learningSyncs() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    phone.wordKnowledge.now = { Fixture.start }
    phone.mark(.learning, Fixture.taberu)
    try await phone.signIn()

    let sent = try #require(phone.server.requests(to: "POST /v1/sync").first?.sync.mutations.first)
    #expect("\(sent.entity) \(sent.operation) \(sent.entityId)" == "knownWord set \(Fixture.taberu)")
    #expect(sent.baseVersion == 0)
    #expect(
      sent.fields == [
        "state": .string("learning"), "headword": .string("食べる"), "reading": .string("たべる"),
        "stateChangedAt": .string("2026-10-03T04:00:00.000Z"),
      ])
    #expect(known(Fixture.taberu, in: service) == "learning")

    try await pad.signIn()
    #expect(pad.wordKnowledge.status(storedID: Fixture.taberu) == .learning)
    #expect(pad.wordKnowledge.marked(.learning).map(\.entryID) == [Fixture.taberu])

    pad.mark(.known, Fixture.taberu)
    try await pad.syncNow()
    try await phone.syncNow()
    #expect(phone.wordKnowledge.status(storedID: Fixture.taberu) == .known)
    #expect(phone.wordKnowledge.marked(.learning).isEmpty)
  }

  @Test("a refused change to Learning puts the state it left back")
  func refusedLearningIsUndone() async throws {
    let fixture = Fixture()
    fixture.serve { request in
      StubSync.answer(
        results: request.mutations.map { StubSync.rejected($0.id, "invalid_fields") },
        cursor: "c")
    }
    await fixture.launch()
    try await fixture.signIn()
    fixture.mark(.known, Fixture.taberu)
    fixture.mark(.learning, Fixture.taberu)
    try await fixture.syncNow()
    #expect(fixture.wordKnowledge.status(storedID: Fixture.taberu) == .known)
  }

  @Test("an account that can't take set keeps the device's states: Known goes as mark, Learning again next launch")
  func accountWithoutSet() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    service.refuseSet(true)
    phone.mark(.known, Fixture.taberu)
    phone.mark(.learning, Fixture.miru)
    try await phone.signIn()
    try await phone.syncNow()

    #expect(known(Fixture.taberu, in: service) == "known")
    #expect(known(Fixture.miru, in: service) == nil)
    #expect(phone.wordKnowledge.status(storedID: Fixture.taberu) == .known)
    #expect(phone.wordKnowledge.status(storedID: Fixture.miru) == .learning)
    #expect(phone.sync.state.retryNextLaunch.map(\.key.entityID) == [Fixture.miru])
    #expect(phone.sync.state.queue.isEmpty)
    let operations = phone.server.requests(to: "POST /v1/sync").flatMap(\.sync.mutations)
      .filter { $0.entityId == Fixture.taberu }.map(\.operation)
    #expect(operations == ["set", "mark"])

    service.refuseSet(false)
    await phone.launch()
    try await phone.syncNow()
    #expect(known(Fixture.miru, in: service) == "learning")
    #expect(phone.sync.state.retryNextLaunch.isEmpty)
  }

  @Test("an account that can't take set gets set, set, then a bare clear for Known then Unknown")
  func olderResendSkippedBehindANewerChange() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    service.refuseSet(true)
    try await phone.signIn()
    phone.mark(.known, Fixture.taberu)
    phone.mark(.unknown, Fixture.taberu)
    try await phone.syncNow()

    let sent = phone.server.requests(to: "POST /v1/sync").flatMap(\.sync.mutations)
      .filter { $0.entityId == Fixture.taberu }
    #expect(sent.map(\.operation) == ["set", "set", "clear"])
    #expect(sent.last?.fields == nil)
    #expect(known(Fixture.taberu, in: service) == nil)
    #expect(phone.wordKnowledge.status(storedID: Fixture.taberu) == .unknown)
    #expect(phone.sync.state.queue.isEmpty)
  }

  @Test("a refused set to Learning isn't undone by the held copy of the device's own resent mark")
  func refusedLearningOutlastsItsOwnEcho() async throws {
    let fixture = try await Fixture.afterSignIn()
    let marks = CallCount()
    let sets = CallCount()
    fixture.serve { request in
      guard let mutation = request.mutations.first else { return StubSync.answer(cursor: "c") }
      switch mutation.operation {
      case "set" where sets.next() < 3:
        return StubSync.answer(
          results: [StubSync.rejected(mutation.id, "unknown_operation")], cursor: "c")
      case "mark" where marks.next() == 1:
        return .offline
      case "mark":
        return StubSync.answer(
          results: StubSync.applied(request),
          changes: [StubSync.knownWord(Fixture.taberu, known: true, version: 1)], cursor: "c")
      default:
        return StubSync.answer(results: StubSync.applied(request, version: 2), cursor: "c")
      }
    }
    fixture.mark(.known, Fixture.taberu)
    await #expect(throws: AccountServiceError.unreachable) { try await fixture.syncNow() }
    fixture.mark(.learning, Fixture.taberu)
    try await fixture.syncNow()

    #expect(fixture.wordKnowledge.status(storedID: Fixture.taberu) == .learning)
    #expect(fixture.sync.state.retryNextLaunch.map(\.key.entityID) == [Fixture.taberu])

    await fixture.launch()
    try await fixture.syncNow()
    let learning = fixture.server.requests(to: "POST /v1/sync").flatMap(\.sync.mutations)
      .filter { $0.operation == "set" && $0.fields?["state"] == .string("learning") }
    #expect(learning.count == 2)
    #expect(fixture.wordKnowledge.status(storedID: Fixture.taberu) == .learning)
    #expect(fixture.sync.state.retryNextLaunch.isEmpty)
  }

  @Test("a Learning change waiting for the next launch isn't sent once the word has moved on")
  func retrySkippedOnceTheWordChanged() async throws {
    let (service, phone, _) = await Fixture.twoPhones()
    service.refuseSet(true)
    phone.mark(.learning, Fixture.miru)
    try await phone.signIn()
    #expect(phone.sync.state.retryNextLaunch.count == 1)

    phone.wordKnowledge.setStatus(
      .unknown, id: LanguageReferenceID(rawValue: Fixture.miru), headword: "食べる",
      reading: "たべる")
    service.refuseSet(false)
    await phone.launch()
    try await phone.syncNow()
    let learning = phone.server.requests(to: "POST /v1/sync").flatMap(\.sync.mutations)
      .filter { $0.fields?["state"] == .string("learning") }
    #expect(learning.count == 1)
    #expect(known(Fixture.miru, in: service) == nil)
  }
}

extension AccountFixture {
  fileprivate func mark(_ status: WordKnowledgeStatus, _ id: String) {
    wordKnowledge.setStatus(
      status, id: LanguageReferenceID(rawValue: id), headword: "食べる", reading: "たべる")
  }
}
