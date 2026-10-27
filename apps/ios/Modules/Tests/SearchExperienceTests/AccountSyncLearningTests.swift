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
    phone.mark(.learning, Fixture.taberu)
    try await phone.signIn()

    let sent = try #require(phone.server.requests(to: "POST /v1/sync").first?.sync.mutations.first)
    #expect("\(sent.entity) \(sent.operation) \(sent.entityId)" == "knownWord set \(Fixture.taberu)")
    #expect(sent.baseVersion == 0)
    #expect(
      sent.fields == [
        "state": .string("learning"), "headword": .string("食べる"), "reading": .string("たべる"),
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
