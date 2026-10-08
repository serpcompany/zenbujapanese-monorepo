import AVFoundation
import TranslatorCore
import TranslatorOnDevice

final class MicrophoneGate: @unchecked Sendable {
  private let lock = NSLock()
  private var open = true

  var isOpen: Bool { lock.withLock { open } }

  func set(_ isOpen: Bool) {
    lock.withLock { open = isOpen }
  }
}

final class AnalyzerBufferConverter: @unchecked Sendable {
  private let lock = NSLock()
  private let converter: AVAudioConverter
  private let targetFormat: AVAudioFormat
  private let sampleRateRatio: Double

  init?(from inputFormat: AVAudioFormat, to targetFormat: AVAudioFormat) {
    guard let converter = AVAudioConverter(from: inputFormat, to: targetFormat) else { return nil }
    converter.primeMethod = .none
    self.converter = converter
    self.targetFormat = targetFormat
    sampleRateRatio = targetFormat.sampleRate / inputFormat.sampleRate
  }

  func convert(_ buffer: AVAudioPCMBuffer, silenced: Bool) -> AVAudioPCMBuffer? {
    lock.withLock {
      let capacity = AVAudioFrameCount((Double(buffer.frameLength) * sampleRateRatio).rounded(.up))
      guard capacity > 0,
        let output = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: capacity)
      else { return nil }
      if silenced {
        output.frameLength = capacity
        for channel in UnsafeMutableAudioBufferListPointer(output.mutableAudioBufferList) {
          if let data = channel.mData { memset(data, 0, Int(channel.mDataByteSize)) }
        }
        return output
      }
      return converter.convertedBuffer(from: buffer, into: output)
    }
  }
}

enum AnalyzerAudioPipeline {
  static func tap(
    converter: AnalyzerBufferConverter, gate: MicrophoneGate, feed: RecognizerFeed
  ) -> AVAudioNodeTapBlock {
    { buffer, _ in
      let isOpen = gate.isOpen
      guard let converted = converter.convert(buffer, silenced: !isOpen) else { return }
      feed.hear(converted, level: isOpen ? RecognizerFeed.level(of: buffer) : nil)
    }
  }

  static func configureSession(for capture: CaptureProfile) throws {
    let session = AVAudioSession.sharedInstance()
    switch capture {
    case .nearbyVoices:
      try session.setCategory(
        .playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
    case .distantSound:
      try session.setCategory(
        .playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
    }
    try session.setActive(true)
  }

  static func releaseSession() {
    let session = AVAudioSession.sharedInstance()
    try? session.setActive(false, options: .notifyOthersOnDeactivation)
    try? session.setCategory(.soloAmbient, mode: .default)
  }

  static func observeInterruptions(
    interrupted: @escaping @Sendable () -> Void,
    mediaServicesReset: @escaping @Sendable () -> Void
  ) -> [any NSObjectProtocol] {
    let center = NotificationCenter.default
    let interruption = center.addObserver(
      forName: AVAudioSession.interruptionNotification, object: nil, queue: nil
    ) { note in
      let type = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt)
        .flatMap(AVAudioSession.InterruptionType.init(rawValue:))
      if type == .began { interrupted() }
    }
    let reset = center.addObserver(
      forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: nil
    ) { _ in mediaServicesReset() }
    return [interruption, reset]
  }

  static func observeConfigurationChanges(
    of engine: AVAudioEngine, _ handle: @escaping @Sendable () -> Void
  ) -> any NSObjectProtocol {
    NotificationCenter.default.addObserver(
      forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
    ) { _ in handle() }
  }
}
