import Foundation

public struct TranscriberResult: Sendable, Equatable {
  public var language: SpokenLanguage
  public var text: String
  public var confidence: Double?
  public var isFinal: Bool
  public var start: TimeInterval
  public var end: TimeInterval

  public init(
    language: SpokenLanguage,
    text: String,
    confidence: Double?,
    isFinal: Bool,
    start: TimeInterval? = nil,
    end: TimeInterval
  ) {
    self.language = language
    self.text = text
    self.confidence = confidence
    self.isFinal = isFinal
    self.start = start ?? end
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
  static let settleLimit: TimeInterval = 2
  static let holdLimit: TimeInterval = 20
  static let minimumConfidence = 0.4
  static let alreadyEmittedShare = 0.5

  public let languages: [SpokenLanguage]
  private var volatile: [SpokenLanguage: TranscriberResult] = [:]
  private var volatileHeardAt: [SpokenLanguage: Date] = [:]
  private var finals: [SpokenLanguage: [TranscriberResult]] = [:]
  private var firstFinalAt: Date?
  private var emittedThrough: TimeInterval = -.infinity

  public init(languages: [SpokenLanguage]) {
    self.languages = languages
  }

  public var isWaitingForCounterpart: Bool { firstFinalAt != nil }

  public mutating func receive(_ result: TranscriberResult, at now: Date) -> [TranscriptionEvent] {
    guard languages.contains(result.language) else { return [] }
    var result = result
    result.text = Self.cleaned(result.text)
    guard languages.count > 1 else { return passThrough(result) }
    let isLate = result.end <= emittedThrough + Self.endTolerance
    if isLate || (result.isFinal && Self.mostlyBefore(emittedThrough, result)) {
      return result.isFinal ? dropLate(result.language) : []
    }
    guard result.isFinal else {
      volatile[result.language] = result
      volatileHeardAt[result.language] = now
      return bestLive()
    }
    volatile[result.language] = nil
    finals[result.language, default: []].append(result)
    if firstFinalAt == nil { firstFinalAt = now }
    return finalsReachTheSameEnd ? emitFinal() : []
  }

  public mutating func flush(at now: Date) -> [TranscriptionEvent] {
    guard let firstFinalAt else { return [] }
    let held = now.timeIntervalSince(firstFinalAt)
    guard held >= Self.pairingWindow, !counterpartIsUnfinished(at: now, held: held) else {
      return []
    }
    return emitFinal()
  }

  static func mostlyBefore(_ time: TimeInterval, _ result: TranscriberResult) -> Bool {
    let length = result.end - result.start
    guard length > 0 else { return false }
    return (time - result.start) / length > Self.alreadyEmittedShare
  }

  static func cleaned(_ text: String) -> String {
    let trimmed = text.drop { !$0.isLetter && !$0.isNumber }
    return String(trimmed).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  static func isWorthTranslating(_ candidate: TranscriptCandidate) -> Bool {
    let letters = candidate.text.filter { $0.isLetter || $0.isNumber }.count
    return letters > 1 && (candidate.confidence ?? 1) >= minimumConfidence
  }

  private mutating func dropLate(_ language: SpokenLanguage) -> [TranscriptionEvent] {
    guard volatile[language] != nil else { return [] }
    volatile[language] = nil
    volatileHeardAt[language] = nil
    return bestLive()
  }

  private func passThrough(_ result: TranscriberResult) -> [TranscriptionEvent] {
    guard result.isFinal else { return [.volatile(result.language, result.text)] }
    let candidate = TranscriptCandidate(
      language: result.language, text: result.text, confidence: result.confidence)
    return [.final(result.language, Self.isWorthTranslating(candidate) ? result.text : "")]
  }

  private func counterpartIsUnfinished(at now: Date, held: TimeInterval) -> Bool {
    languages.contains { language in
      guard let heardAt = volatileHeardAt[language], let live = volatile[language],
        !live.text.isEmpty
      else { return false }
      return held < Self.holdLimit && now.timeIntervalSince(heardAt) < Self.settleLimit
    }
  }

  private var finalsReachTheSameEnd: Bool {
    let ends = languages.compactMap { finals[$0]?.last?.end }
    guard ends.count == languages.count, let latest = ends.max() else { return false }
    return ends.allSatisfy { $0 >= latest - Self.endTolerance }
  }

  private mutating func emitFinal() -> [TranscriptionEvent] {
    let candidates = languages.compactMap { language -> TranscriptCandidate? in
      guard let results = finals[language], !results.isEmpty else { return nil }
      return candidate(language, from: results, live: nil)
    }
    let held = finals
    let end = finals.values.flatMap { $0.map(\.end) }.max()
    finals = [:]
    firstFinalAt = nil
    guard let winner = LanguageArbiter.best(candidates.filter(Self.isWorthTranslating)) else {
      return [.final(languages[0], "")]
    }
    emittedThrough = end ?? emittedThrough
    volatile = volatile.filter { $0.value.end > emittedThrough + Self.endTolerance }
    let texts = (held[winner.language] ?? []).map(\.text).filter { !$0.isEmpty }
    return winner.language.sentences(in: texts).map { .final(winner.language, $0) }
  }

  private func candidate(
    _ language: SpokenLanguage, from results: [TranscriberResult], live: TranscriberResult?
  ) -> TranscriptCandidate {
    let confidences = results.compactMap(\.confidence)
    let texts = (results + [live].compactMap { $0 }).map(\.text).filter { !$0.isEmpty }
    return TranscriptCandidate(
      language: language,
      text: language.joined(texts),
      confidence: confidences.isEmpty ? nil : confidences.reduce(0, +) / Double(confidences.count)
    )
  }

  private func bestLive() -> [TranscriptionEvent] {
    let candidates = languages.compactMap { language -> TranscriptCandidate? in
      let held = finals[language] ?? []
      guard !held.isEmpty || volatile[language] != nil else { return nil }
      return candidate(language, from: held, live: volatile[language])
    }
    guard let best = LanguageArbiter.best(candidates) else { return [.volatile(languages[0], "")] }
    return [.volatile(best.language, best.text)]
  }
}
