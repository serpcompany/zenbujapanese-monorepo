import AVFoundation
import Speech
import TranslatorCore

struct HeardAudio: Sendable {
  var level: Float?
  var duration: TimeInterval
}

public struct RecognizerFeed: @unchecked Sendable {
  public let format: AVAudioFormat
  let inputs: [AsyncStream<AnalyzerInput>.Continuation]
  let heard: AsyncStream<HeardAudio>.Continuation

  public func hear(_ buffer: AVAudioPCMBuffer, level: Float?) {
    #if DEBUG
      TranslateDiagnostics.shared.record(buffer)
    #endif
    for (index, input) in inputs.enumerated() {
      guard let own = index == 0 ? buffer : Self.copy(of: buffer) else { continue }
      input.yield(AnalyzerInput(buffer: own))
    }
    heard.yield(
      HeardAudio(level: level, duration: Double(buffer.frameLength) / buffer.format.sampleRate))
  }

  public static func level(of buffer: AVAudioPCMBuffer) -> Float? {
    let count = Int(buffer.frameLength)
    guard count > 0 else { return nil }
    var sum: Float = 0
    if let samples = buffer.floatChannelData?[0] {
      for index in 0..<count { sum += samples[index] * samples[index] }
    } else if let samples = buffer.int16ChannelData?[0] {
      for index in 0..<count {
        let sample = Float(samples[index]) / Float(Int16.max)
        sum += sample * sample
      }
    } else {
      return nil
    }
    return (sum / Float(count)).squareRoot()
  }

  static func copy(of buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    guard let copy = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: buffer.frameLength)
    else { return nil }
    copy.frameLength = buffer.frameLength
    let source = UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList)
    let target = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
    for (from, to) in zip(source, target) {
      guard let data = from.mData, let destination = to.mData else { continue }
      memcpy(destination, data, Int(min(from.mDataByteSize, to.mDataByteSize)))
    }
    return copy
  }
}

public struct RecognizerSession: Sendable {
  public let events: AsyncThrowingStream<TranscriptionEvent, any Error>
  public let feed: RecognizerFeed
}
