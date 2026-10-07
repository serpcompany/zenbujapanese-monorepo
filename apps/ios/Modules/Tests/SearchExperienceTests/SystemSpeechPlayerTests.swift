import Testing

@testable import SearchExperience

@MainActor
@Suite("Spoken translation time limit")
struct SystemSpeechPlayerTests {
  private let sentence = String(repeating: "駅", count: 10)

  @Test("the limit allows for the text's length at the chosen speed")
  func limitFollowsLengthAndSpeed() {
    #expect(seconds(SystemSpeechPlayer.speakingLimit(for: "", speed: 1)) == 5)
    #expect(seconds(SystemSpeechPlayer.speakingLimit(for: sentence, speed: 1)) == 8)
    #expect(seconds(SystemSpeechPlayer.speakingLimit(for: sentence, speed: 2)) == 6.5)
  }

  @Test("a speed below half is treated as half, so slow speech isn't cut off")
  func slowSpeedFloor() {
    #expect(seconds(SystemSpeechPlayer.speakingLimit(for: sentence, speed: 0.1)) == 11)
  }

  private func seconds(_ duration: Duration) -> Double {
    let (whole, fraction) = duration.components
    return ((Double(whole) + Double(fraction) / 1e18) * 1000).rounded() / 1000
  }
}
