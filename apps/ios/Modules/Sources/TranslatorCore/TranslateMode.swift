public enum TranslateMode: String, Codable, Sendable, CaseIterable, Identifiable, Hashable {
  case conversation
  case listening

  public var id: Self { self }

  public var playback: TranslationPlayback {
    self == .listening ? .asTranslated : .afterEachTurn
  }

  public var capture: CaptureProfile {
    self == .listening ? .distantSound : .nearbyVoices
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
