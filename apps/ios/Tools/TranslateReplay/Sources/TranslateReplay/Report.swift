import Foundation
import TranslatorCore

enum Report {
  static func render(_ result: ReplayResult) -> String {
    let score = result.score
    var lines = ["\(result.recording)  \(score.passes ? "PASS" : "FAIL")", "  Script, and how much of each line was heard:"]
    for line in score.lines {
      let flag = line.wrongLanguage ? "  wrong language" : ""
      lines.append("    \(percent(line.recall)) \(line.language.rawValue)  \(line.expected)\(flag)")
    }
    lines.append("  Turns:")
    for (index, turn) in score.turns.enumerated() {
      for (sentenceIndex, sentence) in turn.enumerated() {
        let number = sentenceIndex == 0 ? String(format: "%3d", index + 1) : "   "
        let flag = sentence.isPhantom ? "  phantom" : ""
        lines.append("    \(number) \(sentence.language.rawValue)  \(sentence.text)\(flag)")
      }
    }
    let delays = result.playbackDelays.map { String(format: "%.1f", $0.afterSpeech) }
    lines.append("  Seconds from the end of speech to playback: \(delays.joined(separator: ", "))")
    lines.append(
      "  Recall \(percent(score.recall)) · lines under \(percent(score.minimumRecall)): "
        + "\(score.missedLines.count) · wrong language: \(score.wrongLanguageLines.count) · "
        + "phantom sentences: \(score.phantoms.count) · turn languages "
        + "\(languages(score.heardLanguages)) "
        + (score.languagesMatch ? "match" : "should be \(languages(score.expectedLanguages))"))
    return lines.joined(separator: "\n")
  }

  static func summary(_ results: [ReplayResult]) -> String {
    let passed = results.filter(\.score.passes).count
    let recalls = results.map { percent($0.score.recall) }.joined(separator: ", ")
    return "\(passed) of \(results.count) recordings pass · recall \(recalls)"
  }

  private static func percent(_ value: Double) -> String {
    String(format: "%3.0f%%", value * 100)
  }

  private static func languages(_ languages: [SpokenLanguage]) -> String {
    languages.map(\.rawValue).joined(separator: " ")
  }
}
