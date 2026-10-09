import Foundation
import Observation
import Translation
import TranslatorCore

enum TranslatePreparation: Equatable {
  case checking
  case downloadingTranslation
  case downloadingSpeech(Double)
}

enum ConversationLayout: String, CaseIterable {
  case cards
  case twoPanes
}

enum TranslateStartProblem: Equatable {
  case microphoneDenied
  case speechUnavailable
  case translationUnavailable
}

@MainActor
@Observable
final class TranslateExperience {
  private static let startKey = "translate.start.v1"
  private static let layoutKey = "translate.layout.v1"
  private static let speechSpeedKey = "translate.speech-speed.v1"
  static let speechSpeeds = 0.5...2.0
  static let speechSpeedStep = 0.1

  let history: ConversationHistory
  private(set) var session: LiveConversation?
  private(set) var preparation: TranslatePreparation?
  private(set) var startProblem: TranslateStartProblem?
  var translationDownload: TranslationSession.Configuration?
  var preferredStart: TranslateStart {
    didSet { defaults.set(preferredStart.rawValue, forKey: Self.startKey) }
  }
  var layout: ConversationLayout {
    didSet { defaults.set(layout.rawValue, forKey: Self.layoutKey) }
  }
  var speechSpeed: Double {
    didSet {
      defaults.set(speechSpeed, forKey: Self.speechSpeedKey)
      services.setSpeechSpeed(speechSpeed)
    }
  }
  @ObservationIgnored let readingAids: ReadingAidPreferences
  @ObservationIgnored let conversationWords = ConversationWords()

  @ObservationIgnored let services: TranslateServices
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private var modeAwaitingTranslationDownload: TranslateMode?
  @ObservationIgnored private var startIsAbandoned = false

  init(
    services: TranslateServices,
    history: ConversationHistory,
    defaults: UserDefaults = .standard
  ) {
    self.services = services
    self.history = history
    self.defaults = defaults
    preferredStart =
      defaults.string(forKey: Self.startKey).flatMap(TranslateStart.init(rawValue:))
      ?? .conversation
    layout =
      defaults.string(forKey: Self.layoutKey).flatMap(ConversationLayout.init(rawValue:)) ?? .cards
    let speed = defaults.object(forKey: Self.speechSpeedKey) as? Double ?? 1
    speechSpeed = speed
    readingAids = ReadingAidPreferences(
      defaults: defaults, storageKey: "translate.reading-aids.v1", furiganaByDefault: false)
    services.setSpeechSpeed(speed)
  }

  func changeSpeechSpeed(by steps: Int) {
    let next = ((speechSpeed + Double(steps) * Self.speechSpeedStep) * 10).rounded() / 10
    speechSpeed = min(max(next, Self.speechSpeeds.lowerBound), Self.speechSpeeds.upperBound)
  }

  static func live() -> TranslateExperience {
    TranslateExperience(services: .forThisLaunch, history: .shared)
  }

  var isPreparing: Bool { preparation != nil }

  func start(_ requestedMode: TranslateMode? = nil) async {
    await start(
      requestedMode ?? preferredStart.liveMode ?? .conversation, offeringTranslationDownload: true)
  }

  func dismissStartProblem() {
    startProblem = nil
  }

  func requestTranslationDownload() {
    translationDownload = OnDeviceTranslation.downloadConfiguration
  }

  func translationDownloadFinished() async {
    translationDownload = nil
    guard let mode = modeAwaitingTranslationDownload else { return }
    modeAwaitingTranslationDownload = nil
    preparation = nil
    guard !droppedAbandonedStart() else { return }
    await start(mode, offeringTranslationDownload: false)
  }

  func leave(saving: Bool) async {
    guard let session else { return }
    await session.leave(saving: saving)
    self.session = nil
    history.liveConversationID = nil
  }

  func sceneMovedToBackground() {
    session?.appMovedToBackground()
  }

  func lastWindowClosed() {
    if session == nil, preparation != nil { startIsAbandoned = true }
    session?.appMovedToBackground()
  }

  private func droppedAbandonedStart() -> Bool {
    guard startIsAbandoned else { return false }
    startIsAbandoned = false
    preparation = nil
    return true
  }

  private func start(_ mode: TranslateMode, offeringTranslationDownload: Bool) async {
    guard session == nil, preparation == nil else { return }
    startProblem = nil
    startIsAbandoned = false
    preparation = .checking
    guard await services.requestMicrophone() else {
      finishPreparing(with: .microphoneDenied)
      return
    }
    guard !droppedAbandonedStart() else { return }
    switch await services.translationAvailability() {
    case .installed:
      break
    case .downloadable where offeringTranslationDownload:
      modeAwaitingTranslationDownload = mode
      preparation = .downloadingTranslation
      translationDownload = OnDeviceTranslation.downloadConfiguration
      return
    case .downloadable, .unsupported:
      finishPreparing(with: .translationUnavailable)
      return
    }
    do {
      if try await services.speechNeedsDownload(SpokenLanguage.allCases) {
        preparation = .downloadingSpeech(0)
        try await services.installSpeech(SpokenLanguage.allCases) { [weak self] fraction in
          Task { @MainActor in self?.reportSpeechDownload(fraction) }
        }
      }
    } catch {
      finishPreparing(with: .speechUnavailable)
      return
    }
    guard !droppedAbandonedStart() else { return }
    preparation = nil
    let session = LiveConversation(
      mode: mode, clients: services.clients, archive: history, timing: services.timing)
    self.session = session
    history.liveConversationID = session.conversation.id
    session.start()
  }

  private func reportSpeechDownload(_ fraction: Double) {
    guard case .downloadingSpeech = preparation else { return }
    preparation = .downloadingSpeech(fraction)
  }

  private func finishPreparing(with problem: TranslateStartProblem) {
    preparation = nil
    startProblem = problem
  }
}
