import Foundation

struct PlaybackDelay: Codable, Sendable, Equatable {
  var spokenAt: Double
  var afterSpeech: Double
  var text: String
}

enum EventLog {
  static func playbackDelays(in log: String) -> [PlaybackDelay] {
    var audioStart = 0.0
    var voiceEnds: [Double] = []
    var lastSpoken: Double?
    var delays: [PlaybackDelay] = []
    for line in log.split(separator: "\n") {
      let parts = line.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
      guard parts.count == 2, let time = Double(parts[0]) else { continue }
      let event = String(parts[1])
      if event == "audio starts" {
        audioStart = time
      } else if let end = Double(event.dropping(prefix: "pause after voice at ") ?? "") {
        voiceEnds.append(audioStart + end)
      } else if let spoken = event.dropping(prefix: "speak ") {
        defer { lastSpoken = time }
        guard let voiceEnd = voiceEnds.last(where: { $0 < time }),
          voiceEnd > (lastSpoken ?? -.infinity)
        else { continue }
        delays.append(
          PlaybackDelay(spokenAt: time, afterSpeech: time - voiceEnd, text: String(spoken.dropFirst(3))))
      }
    }
    return delays
  }
}

extension String {
  fileprivate func dropping(prefix: String) -> String? {
    hasPrefix(prefix) ? String(dropFirst(prefix.count)) : nil
  }
}
