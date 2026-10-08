import Foundation
import Testing

@testable import TranslatorCore

@Suite("Speech pause detector")
struct SpeechPauseDetectorTests {
  private let step: TimeInterval = 0.1

  private func hear(
    _ detector: inout SpeechPauseDetector, _ level: Float?, for seconds: TimeInterval
  ) -> [TimeInterval] {
    var pauses: [TimeInterval] = []
    for _ in 0..<Int((seconds / step).rounded()) {
      if let end = detector.hear(level: level, duration: step) { pauses.append(end) }
    }
    return pauses
  }

  @Test("a pause after speech reports when the voice stopped")
  func reportsPause() {
    var detector = SpeechPauseDetector()
    #expect(hear(&detector, 0.002, for: 1).isEmpty)
    #expect(hear(&detector, 0.05, for: 2).isEmpty)
    let pauses = hear(&detector, 0.002, for: 1)
    #expect(pauses.count == 1)
    #expect(abs(pauses[0] - 3) < 0.01)
  }

  @Test("a breath shorter than the pause doesn't end the speech")
  func breathIsNotAPause() {
    var detector = SpeechPauseDetector()
    _ = hear(&detector, 0.002, for: 1)
    _ = hear(&detector, 0.05, for: 1)
    #expect(hear(&detector, 0.002, for: 0.4).isEmpty)
    #expect(hear(&detector, 0.05, for: 1).isEmpty)
  }

  @Test("long speech doesn't raise the noise floor into the voice")
  func longSpeech() {
    var detector = SpeechPauseDetector()
    _ = hear(&detector, 0.002, for: 1)
    #expect(hear(&detector, 0.05, for: 30).isEmpty)
    #expect(hear(&detector, 0.002, for: 1).count == 1)
  }

  @Test("muted audio during playback counts as silence and keeps the room's noise floor")
  func mutedAudio() {
    var detector = SpeechPauseDetector()
    _ = hear(&detector, 0.002, for: 1)
    _ = hear(&detector, 0.05, for: 1)
    #expect(hear(&detector, nil, for: 1).count == 1)
    #expect(hear(&detector, 0.002, for: 2).isEmpty)
    _ = hear(&detector, 0.05, for: 1)
    #expect(hear(&detector, 0.002, for: 1).count == 1)
  }

  @Test("it knows how long the room has been quiet, through a pause and after it")
  func quietFor() {
    var detector = SpeechPauseDetector()
    _ = hear(&detector, 0.002, for: 1)
    _ = hear(&detector, 0.05, for: 1)
    #expect(detector.quietFor < 0.01)
    _ = hear(&detector, 0.002, for: 1.5)
    #expect(abs(detector.quietFor - 1.5) < 0.01)
  }

  @Test("a stalled sentence is finished after 2 s once the room is quiet, and after 5 s while someone talks")
  func stalledSentence() {
    var detector = SpeechPauseDetector()
    _ = hear(&detector, 0.002, for: 1)
    _ = hear(&detector, 0.05, for: 1)
    #expect(!detector.finishesStalledSentence(unchangedFor: 3))
    #expect(detector.finishesStalledSentence(unchangedFor: 5))
    _ = hear(&detector, 0.002, for: 0.7)
    #expect(!detector.finishesStalledSentence(unchangedFor: 1.9))
    #expect(detector.finishesStalledSentence(unchangedFor: 2))
  }
}
