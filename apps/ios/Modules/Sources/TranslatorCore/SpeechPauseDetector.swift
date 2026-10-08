import Foundation

public struct SpeechPauseDetector: Sendable {
  public static let minimumPause: TimeInterval = 0.6
  static let speechAboveFloor: Float = 3
  static let quietestSpeech: Float = 0.001
  static let floorFall: Float = 0.5
  static let floorRise: Float = 0.001

  private var noiseFloor: Float?
  private var position: TimeInterval = 0
  private var lastVoiceEnd: TimeInterval?
  private var lastVoice: TimeInterval = 0

  public init() {}

  public var quietFor: TimeInterval { position - lastVoice }

  public mutating func hear(level: Float?, duration: TimeInterval) -> TimeInterval? {
    position += duration
    if let level, isSpeech(level) {
      lastVoiceEnd = position
      lastVoice = position
      return nil
    }
    guard let voiceEnd = lastVoiceEnd, position - voiceEnd >= Self.minimumPause else { return nil }
    lastVoiceEnd = nil
    return voiceEnd
  }

  private mutating func isSpeech(_ level: Float) -> Bool {
    guard let floor = noiseFloor else {
      noiseFloor = level
      return false
    }
    let rate = level < floor ? Self.floorFall : Self.floorRise
    noiseFloor = floor + (level - floor) * rate
    return level > max(floor * Self.speechAboveFloor, Self.quietestSpeech)
  }
}
