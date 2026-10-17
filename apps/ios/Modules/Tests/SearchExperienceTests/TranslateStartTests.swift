import Testing

@testable import SearchExperience

@Suite("Translate's home options")
struct TranslateStartTests {
  @Test("the home lists Spoken, then Written, each option once")
  func sections() {
    #expect(TranslateStart.spokenRows == [.conversation, .listening])
    #expect(TranslateStart.writtenRows == [.image, .text, .document])
    let listed = TranslateStart.spokenRows + TranslateStart.writtenRows
    #expect(listed.count == TranslateStart.allCases.count)
    #expect(Set(listed) == Set(TranslateStart.allCases))
  }
}
