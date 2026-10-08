import AVFoundation
import TranslatorCore
import TranslatorOnDevice

enum ReplayFailure: Error, CustomStringConvertible {
  case unexpectedFormat(AVAudioFormat, expected: AVAudioFormat)
  case conversationFailed(TranslatorFailure)
  case audioFailed(String)
  case childFailed(String)
  case invalidScript(String)
  case invalidArguments(String)

  var description: String {
    switch self {
    case .unexpectedFormat(let format, let expected):
      "heard.wav is \(format), but the recognizers take \(expected)"
    case .conversationFailed(let failure): "the conversation failed: \(failure)"
    case .audioFailed(let reason): "the recording couldn't be played: \(reason)"
    case .childFailed(let recording): "the replay of \(recording) didn't finish"
    case .invalidScript(let reason): "the script \(reason)"
    case .invalidArguments(let reason): reason
    }
  }
}

struct RecordedAudio: Sendable {
  static let chunkFrames: AVAudioFrameCount = 1600
  static let roomNoise: Int16 = 3

  let url: URL

  func play(into feed: RecognizerFeed, thenQuietFor tail: Duration) async throws {
    let file = try AVAudioFile(forReading: url, commonFormat: .pcmFormatInt16, interleaved: true)
    let format = file.processingFormat
    guard format.sampleRate == feed.format.sampleRate,
      format.channelCount == feed.format.channelCount,
      format.commonFormat == feed.format.commonFormat
    else { throw ReplayFailure.unexpectedFormat(format, expected: feed.format) }
    let clock = ContinuousClock()
    let start = clock.now
    let tailFrames = AVAudioFramePosition(format.sampleRate * Double(tail.components.seconds))
    var fed: AVAudioFramePosition = 0
    while fed < file.length + tailFrames {
      guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: Self.chunkFrames)
      else { return }
      if fed < file.length {
        try file.read(into: buffer, frameCount: Self.chunkFrames)
      } else {
        Self.fillWithRoomNoise(buffer)
      }
      guard buffer.frameLength > 0 else { return }
      let level = RecognizerFeed.level(of: buffer)
      feed.hear(buffer, level: level == 0 ? nil : level)
      fed += AVAudioFramePosition(buffer.frameLength)
      try await clock.sleep(until: start + .seconds(Double(fed) / format.sampleRate))
    }
  }

  private static func fillWithRoomNoise(_ buffer: AVAudioPCMBuffer) {
    buffer.frameLength = buffer.frameCapacity
    guard let samples = buffer.int16ChannelData?[0] else { return }
    for index in 0..<Int(buffer.frameLength) {
      samples[index] = Int16.random(in: -roomNoise...roomNoise)
    }
  }
}
