import AVFoundation

final class EchoCancelledPlayback: @unchecked Sendable {
  static let format = AVAudioFormat(standardFormatWithSampleRate: 24_000, channels: 1)!

  let player = AVAudioPlayerNode()
  private let lock = NSLock()
  private var generation = 0
  private var scheduled = 0
  private var played = 0
  private var synthesisFinished = false
  private var converter: AVAudioConverter?
  private var finished: CheckedContinuation<Void, Never>?

  func connect(to engine: AVAudioEngine) {
    guard player.engine !== engine else { return }
    player.engine?.detach(player)
    engine.attach(player)
    engine.connect(player, to: engine.mainMixerNode, format: Self.format)
  }

  func begin(_ continuation: CheckedContinuation<Void, Never>) -> Int {
    let (previous, current) = lock.withLock { () -> (CheckedContinuation<Void, Never>?, Int) in
      let previous = finished
      generation += 1
      finished = continuation
      scheduled = 0
      played = 0
      synthesisFinished = false
      converter = nil
      return (previous, generation)
    }
    previous?.resume()
    guard player.engine?.isRunning == true else {
      finish(current)
      return current
    }
    if !player.isPlaying { player.play() }
    return current
  }

  func stop() {
    player.stop()
    let waiting = lock.withLock { () -> CheckedContinuation<Void, Never>? in
      generation += 1
      defer { finished = nil }
      return finished
    }
    waiting?.resume()
  }

  static func receiver(
    for playback: EchoCancelledPlayback, generation: Int
  ) -> AVSpeechSynthesizer.BufferCallback {
    { buffer in playback.receive(buffer, generation: generation) }
  }

  private func receive(_ buffer: AVAudioBuffer, generation: Int) {
    guard let pcm = buffer as? AVAudioPCMBuffer, pcm.frameLength > 0 else {
      let done = lock.withLock { () -> Bool in
        guard generation == self.generation else { return false }
        synthesisFinished = true
        return played == scheduled
      }
      if done { finish(generation) }
      return
    }
    guard let converted = convert(pcm, generation: generation) else { return }
    player.scheduleBuffer(converted, completionCallbackType: .dataPlayedBack) { [weak self] _ in
      self?.bufferPlayed(generation)
    }
  }

  private func bufferPlayed(_ generation: Int) {
    let done = lock.withLock { () -> Bool in
      guard generation == self.generation else { return false }
      played += 1
      return synthesisFinished && played == scheduled
    }
    if done { finish(generation) }
  }

  private func finish(_ generation: Int) {
    let waiting = lock.withLock { () -> CheckedContinuation<Void, Never>? in
      guard generation == self.generation else { return nil }
      defer { finished = nil }
      return finished
    }
    waiting?.resume()
  }

  private func convert(_ buffer: AVAudioPCMBuffer, generation: Int) -> AVAudioPCMBuffer? {
    lock.withLock {
      guard generation == self.generation else { return nil }
      if converter?.inputFormat != buffer.format {
        converter = AVAudioConverter(from: buffer.format, to: Self.format)
      }
      let ratio = Self.format.sampleRate / buffer.format.sampleRate
      guard let converter,
        let output = AVAudioPCMBuffer(
          pcmFormat: Self.format,
          frameCapacity: AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 64)
      else { return nil }
      var supplied = false
      var error: NSError?
      converter.convert(to: output, error: &error) { _, status in
        if supplied {
          status.pointee = .noDataNow
          return nil
        }
        supplied = true
        status.pointee = .haveData
        return buffer
      }
      guard error == nil, output.frameLength > 0 else { return nil }
      scheduled += 1
      return output
    }
  }
}
