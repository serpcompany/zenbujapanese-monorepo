import AVFoundation
import TranslatorOnDevice

enum ReplayFailure: Error, CustomStringConvertible {
  case unexpectedFormat(AVAudioFormat, expected: AVAudioFormat)
  case childFailed(String)

  var description: String {
    switch self {
    case .unexpectedFormat(let format, let expected):
      "heard.wav is \(format), but the recognizers take \(expected)"
    case .childFailed(let recording): "the replay of \(recording) didn't finish"
    }
  }
}

struct RecordedAudio: Sendable {
  static let chunkFrames: AVAudioFrameCount = 1600

  let url: URL

  func play(into feed: RecognizerFeed) async throws {
    let file = try AVAudioFile(forReading: url, commonFormat: .pcmFormatInt16, interleaved: true)
    let format = file.processingFormat
    guard format.sampleRate == feed.format.sampleRate,
      format.channelCount == feed.format.channelCount,
      format.commonFormat == feed.format.commonFormat
    else { throw ReplayFailure.unexpectedFormat(format, expected: feed.format) }
    let clock = ContinuousClock()
    let start = clock.now
    var fed: AVAudioFramePosition = 0
    while fed < file.length {
      guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: Self.chunkFrames)
      else { return }
      try file.read(into: buffer, frameCount: Self.chunkFrames)
      guard buffer.frameLength > 0 else { return }
      feed.hear(buffer, level: Self.level(of: buffer))
      fed += AVAudioFramePosition(buffer.frameLength)
      try await clock.sleep(until: start + .seconds(Double(fed) / format.sampleRate))
    }
  }

  static func level(of buffer: AVAudioPCMBuffer) -> Float? {
    guard let samples = buffer.int16ChannelData?[0], buffer.frameLength > 0 else { return nil }
    var sum: Float = 0
    var muted = true
    for index in 0..<Int(buffer.frameLength) {
      let sample = Float(samples[index]) / Float(Int16.max)
      sum += sample * sample
      if samples[index] != 0 { muted = false }
    }
    return muted ? nil : (sum / Float(buffer.frameLength)).squareRoot()
  }
}
