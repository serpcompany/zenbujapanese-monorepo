import Foundation
import Observation
import Translation
import TranslatorCore

enum TranslatePreparation: Equatable {
  case checking
  case downloadingTranslation
  case downloadingSpeech(Double)
}

enum TranslateStartProblem: Equatable {
  case microphoneDenied
  case speechUnavailable
  case translationUnavailable
}

@MainActor
@Observable
final class TranslateExperience {
  private static let modeKey = "translate.mode.v1"

  let history: ConversationHistory
  private(set) var session: LiveConversation?
  private(set) var preparation: TranslatePreparation?
  private(set) var startProblem: TranslateStartProblem?
  var translationDownload: TranslationSession.Configuration?
  var preferredMode: TranslateMode {
    didSet { defaults.set(preferredMode.rawValue, forKey: Self.modeKey) }
  }

  @ObservationIgnored let services: TranslateServices
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private var modeAwaitingTranslationDownload: TranslateMode?

  init(
    services: TranslateServices,
    history: ConversationHistory,
    defaults: UserDefaults = .standard
  ) {
    self.services = services
    self.history = history
    self.defaults = defaults
    preferredMode =
      defaults.string(forKey: Self.modeKey).flatMap(TranslateMode.init(rawValue:))
      ?? .conversation
  }

  static func live() -> TranslateExperience {
    TranslateExperience(services: .forThisLaunch, history: ConversationHistory())
  }

  var isPreparing: Bool { preparation != nil }

  func start(_ requestedMode: TranslateMode? = nil) async {
    await start(requestedMode ?? preferredMode, offeringTranslationDownload: true)
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
    await start(mode, offeringTranslationDownload: false)
  }

  func leave(saving: Bool) async {
    guard let session else { return }
    await session.leave(saving: saving)
    self.session = nil
  }

  func switchMode(to mode: TranslateMode) async {
    preferredMode = mode
    guard let session, session.mode != mode else { return }
    if session.mode.canSwitchWithinSession(to: mode) {
      session.switchMode(to: mode)
      return
    }
    await leave(saving: true)
    await start(mode, offeringTranslationDownload: true)
  }

  func sceneMovedToBackground() {
    session?.appMovedToBackground()
  }

  private func start(_ mode: TranslateMode, offeringTranslationDownload: Bool) async {
    guard session == nil, preparation == nil else { return }
    startProblem = nil
    preparation = .checking
    guard await services.requestMicrophone() else {
      finishPreparing(with: .microphoneDenied)
      return
    }
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
      if try await services.speechNeedsDownload(mode.listensFor) {
        preparation = .downloadingSpeech(0)
        try await services.installSpeech(mode.listensFor) { [weak self] fraction in
          Task { @MainActor in self?.reportSpeechDownload(fraction) }
        }
      }
    } catch {
      finishPreparing(with: .speechUnavailable)
      return
    }
    preparation = nil
    let session = LiveConversation(
      mode: mode, clients: services.clients, archive: history, timing: services.timing)
    self.session = session
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
