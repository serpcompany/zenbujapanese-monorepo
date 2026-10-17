import AVFoundation
import TranslatorCore

enum ConversationAudioSession {
  static func configure(for capture: CaptureProfile) throws {
    #if os(iOS)
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
    #endif
  }

  static func release() {
    #if os(iOS)
      let session = AVAudioSession.sharedInstance()
      try? session.setActive(false, options: .notifyOthersOnDeactivation)
      try? session.setCategory(.soloAmbient, mode: .default)
    #endif
  }

  static func observeInterruptions(
    interrupted: @escaping @Sendable () -> Void,
    mediaServicesReset: @escaping @Sendable () -> Void
  ) -> [any NSObjectProtocol] {
    #if os(iOS)
      let interruption = NotificationCenter.default.addObserver(
        forName: AVAudioSession.interruptionNotification, object: nil, queue: nil
      ) { note in
        let type = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt)
          .flatMap(AVAudioSession.InterruptionType.init(rawValue:))
        if type == .began { interrupted() }
      }
      return [interruption, observeMediaServicesReset(mediaServicesReset)].compactMap { $0 }
    #else
      return []
    #endif
  }

  static func observeMediaServicesReset(
    _ handle: @escaping @Sendable () -> Void
  ) -> (any NSObjectProtocol)? {
    #if os(iOS)
      NotificationCenter.default.addObserver(
        forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: nil
      ) { _ in handle() }
    #else
      nil
    #endif
  }

  static func outputReachesMicrophone() -> Bool {
    #if os(iOS)
      AVAudioSession.sharedInstance().currentRoute.outputs.contains {
        $0.portType == .builtInSpeaker || $0.portType == .builtInReceiver
      }
    #else
      true
    #endif
  }
}
