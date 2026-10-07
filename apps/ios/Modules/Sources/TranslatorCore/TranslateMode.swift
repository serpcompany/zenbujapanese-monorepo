public enum TranslateMode: String, Codable, Sendable, CaseIterable, Identifiable, Hashable {
  case conversation
  case listening
  case textOnly

  public var id: Self { self }

  public var playback: TranslationPlayback {
    switch self {
    case .conversation: .afterEachTurn
    case .listening: .asTranslated
    case .textOnly: .never
    }
  }

  public var capture: CaptureProfile {
    self == .listening ? .distantSound : .nearbyVoices
  }

  public func canSwitchWithinSession(to other: TranslateMode) -> Bool {
    capture == other.capture
  }
}

public enum TranslationPlayback: Sendable, Equatable {
  case afterEachTurn
  case asTranslated
  case never
}

public enum CaptureProfile: Sendable, Equatable {
  case nearbyVoices
  case distantSound
}
