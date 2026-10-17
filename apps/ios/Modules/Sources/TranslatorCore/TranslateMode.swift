public enum TranslateMode: String, Codable, Sendable, CaseIterable, Identifiable, Hashable {
  case conversation
  case listening

  static let savedWhileMuted = "textOnly"

  public init(from decoder: any Decoder) throws {
    let container = try decoder.singleValueContainer()
    let rawValue = try container.decode(String.self)
    guard let mode = rawValue == Self.savedWhileMuted ? .conversation : Self(rawValue: rawValue)
    else {
      throw DecodingError.dataCorruptedError(
        in: container, debugDescription: "Unknown Translate mode \(rawValue)")
    }
    self = mode
  }

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
