import Foundation

public struct TranscriberResult: Sendable, Equatable {
  public var language: SpokenLanguage
  public var text: String
  public var confidence: Double?
  public var isFinal: Bool
  public var end: TimeInterval

  public init(
    language: SpokenLanguage,
    text: String,
    confidence: Double?,
    isFinal: Bool,
    end: TimeInterval
  ) {
    self.language = language
    self.text = text
    self.confidence = confidence
    self.isFinal = isFinal
    self.end = end
  }
}

public struct TranscriptCandidate: Sendable, Equatable {
  public var language: SpokenLanguage
  public var text: String
  public var confidence: Double?

  public init(language: SpokenLanguage, text: String, confidence: Double?) {
    self.language = language
    self.text = text
    self.confidence = confidence
  }
}

public enum LanguageArbiter {
  static let unknownConfidence = 0.35

  public static func best(_ candidates: [TranscriptCandidate]) -> TranscriptCandidate? {
    candidates
      .filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
      .max { score($0) < score($1) }
  }

  public static func score(_ candidate: TranscriptCandidate) -> Double {
    let confidence = candidate.confidence ?? unknownConfidence
    return confidence * 100 + scriptAffinity(of: candidate.text, for: candidate.language) * 100
  }

  static func scriptAffinity(of text: String, for language: SpokenLanguage) -> Double {
    var letters = 0.0
    var matching = 0.0
    for scalar in text.unicodeScalars {
      if scalar.isHiragana || scalar.isKanji {
        letters += 1
        if language == .japanese { matching += 1 }
      } else if scalar.isKatakana {
        letters += 1
        if language == .japanese { matching += 0.5 }
      } else if scalar.isASCIILetter {
        letters += 1
        if language == .english { matching += 1 }
      }
    }
    return letters == 0 ? 0 : matching / letters
  }
}

public struct BilingualTranscriptMerger: Sendable {
  public static let pairingWindow: TimeInterval = 0.4
  static let endTolerance: TimeInterval = 0.3

  public let languages: [SpokenLanguage]
  private var volatile: [SpokenLanguage: TranscriberResult] = [:]
  private var finals: [SpokenLanguage: [TranscriberResult]] = [:]
  private var firstFinalAt: Date?
  private var emittedThrough: TimeInterval = -.infinity

  public init(languages: [SpokenLanguage]) {
    self.languages = languages
  }

  public var isWaitingForCounterpart: Bool { firstFinalAt != nil }

  public mutating func receive(_ result: TranscriberResult, at now: Date) -> [TranscriptionEvent] {
    guard languages.contains(result.language) else { return [] }
    guard languages.count > 1 else {
      return [
        result.isFinal
          ? .final(result.language, result.text) : .volatile(result.language, result.text)
      ]
    }
    guard result.end > emittedThrough + Self.endTolerance else { return [] }
    guard result.isFinal else {
      volatile[result.language] = result
      return bestVolatile()
    }
    volatile[result.language] = nil
    finals[result.language, default: []].append(result)
    if firstFinalAt == nil { firstFinalAt = now }
    return finalsReachTheSameEnd ? emitFinal() : []
  }

  public mutating func flush(at now: Date) -> [TranscriptionEvent] {
    guard let firstFinalAt, now.timeIntervalSince(firstFinalAt) >= Self.pairingWindow else {
      return []
    }
    return emitFinal()
  }

  public mutating func reset() {
    volatile = [:]
    finals = [:]
    firstFinalAt = nil
  }

  private var finalsReachTheSameEnd: Bool {
    let ends = languages.compactMap { finals[$0]?.last?.end }
    guard ends.count == languages.count, let latest = ends.max() else { return false }
    return ends.allSatisfy { $0 >= latest - Self.endTolerance }
  }

  private mutating func emitFinal() -> [TranscriptionEvent] {
    let candidates = languages.compactMap { language -> TranscriptCandidate? in
      guard let results = finals[language], !results.isEmpty else { return nil }
      let confidences = results.compactMap(\.confidence)
      return TranscriptCandidate(
        language: language,
        text: language.joined(results.map(\.text)),
        confidence: confidences.isEmpty
          ? nil : confidences.reduce(0, +) / Double(confidences.count)
      )
    }
    emittedThrough = finals.values.flatMap { $0.map(\.end) }.max() ?? emittedThrough
    finals = [:]
    firstFinalAt = nil
    volatile = volatile.filter { $0.value.end > emittedThrough + Self.endTolerance }
    guard let winner = LanguageArbiter.best(candidates) else { return [.final(languages[0], "")] }
    return [.final(winner.language, winner.text)]
  }

  private func bestVolatile() -> [TranscriptionEvent] {
    let candidates = languages.compactMap { language in
      volatile[language].map {
        TranscriptCandidate(language: language, text: $0.text, confidence: $0.confidence)
      }
    }
    guard let best = LanguageArbiter.best(candidates) else { return [.volatile(languages[0], "")] }
    return [.volatile(best.language, best.text)]
  }
}
