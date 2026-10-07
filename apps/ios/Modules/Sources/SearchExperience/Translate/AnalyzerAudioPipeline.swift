import AVFoundation
import Speech
import TranslatorCore

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

struct HeardAudio: Sendable {
  var level: Float?
  var duration: TimeInterval
}

enum AnalyzerAudioPipeline {
  static func tap(
    converter: AnalyzerBufferConverter,
    gate: MicrophoneGate,
    inputs: [AsyncStream<AnalyzerInput>.Continuation],
    heard: AsyncStream<HeardAudio>.Continuation
  ) -> AVAudioNodeTapBlock {
    { buffer, _ in
      let isOpen = gate.isOpen
      guard let converted = converter.convert(buffer, silenced: !isOpen) else { return }
      #if DEBUG
        TranslateDiagnostics.shared.record(converted)
      #endif
      for (index, input) in inputs.enumerated() {
        guard let own = index == 0 ? converted : copy(of: converted) else { continue }
        input.yield(AnalyzerInput(buffer: own))
      }
      heard.yield(
        HeardAudio(
          level: isOpen ? level(of: buffer) : nil,
          duration: Double(converted.frameLength) / converted.format.sampleRate))
    }
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

  static func level(of buffer: AVAudioPCMBuffer) -> Float? {
    guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return nil }
    var sum: Float = 0
    for index in 0..<Int(buffer.frameLength) { sum += samples[index] * samples[index] }
    return (sum / Float(buffer.frameLength)).squareRoot()
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
