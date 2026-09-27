import Testing
@testable import SearchExperience

@Suite("Conjugation example matching")
struct ConjugationExampleMatchingTests {
  private func matches(_ surface: String, _ sentence: String) -> Bool {
    ConjugatedFormView.containsCompleteForm(surface, in: sentence)
  }

  @Test("a form counts only when it stands complete")
  func completeForms() {
    #expect(matches("見た", "映画を見た。"))
    #expect(matches("見た", "もう見たよ。"))
    #expect(!matches("見た", "見たら教えて。"))
    #expect(!matches("見た", "花見たのしい。"))
    #expect(matches("見られる", "よく見られる症状です。"))
    #expect(!matches("たべた", "またべたべたする。"))
  }
}
