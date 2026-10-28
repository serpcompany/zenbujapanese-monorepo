import Foundation
import SwiftUI
import notify

enum LaunchHarness {
  static let freshStateKey = "ZENBU_UI_TEST_FRESH"
  static let cameraImageKey = "ZENBU_CAMERA_IMAGE"
  static let signInStandInKey = "ZENBU_SIGN_IN_STAND_IN"
  static let speechStandInKey = "ZENBU_SPEECH_STAND_IN"
  static let youTubeStandInKey = "ZENBU_YOUTUBE_STAND_IN"
  static let accountStandInKey = "ZENBU_ACCOUNT_STAND_IN"
  static let appStoreStandInKey = "ZENBU_APP_STORE_STAND_IN"
  static let accountKeptStandInKey = "ZENBU_ACCOUNT_STAND_IN_KEPT"
  static let accountRefusesStandInKey = "ZENBU_ACCOUNT_STAND_IN_REFUSES"
  static let holdLinkingKey = "ZENBU_HOLD_LINKING"
  static let failLinkingKey = "ZENBU_FAIL_LINKING"
  static let failMeaningExamplesKey = "ZENBU_FAIL_MEANING_EXAMPLES"
  static let drawCountKey = "ZENBU_COUNT_DRAWS"
  static let appearanceKey = "ZENBU_APPEARANCE"
  static let openLinkKey = "ZENBU_OPEN_LINK"
  static let openLinkNotice = "com.zenbujapanese.dictionary.uitests.open-link"
  static let earlierNotesKey = "ZENBU_EARLIER_NOTES"
  static let shareTextKey = "ZENBU_SHARE_TEXT"
  static let shareImageKey = "ZENBU_SHARE_IMAGE"
  static let shareCardInAppKey = "ZENBU_SHARE_CARD_IN_APP"
  static let onlySectionKey = "ZENBU_ONLY_SECTION"
  static let problemReportStandInKey = "ZENBU_PROBLEM_REPORT_STAND_IN"
  static let progressStreakKey = "ZENBU_PROGRESS_STREAK"
  static let dailyGoalKey = "ZENBU_DAILY_GOAL"
  static let uiTestBundleSuffix = ".uitests"
  static let savedStateFolders = ["Zenbu Japanese", "FrequencyPacks", "Profile"]

  static func prepare() {
    _ = prepared
  }

  static var cameraImageURL: URL? {
    #if DEBUG
      ProcessInfo.processInfo.environment[cameraImageKey].map { URL(filePath: $0) }
    #else
      nil
    #endif
  }

  static func standsInForSignIn(_ environment: [String: String]) -> Bool {
    #if DEBUG
      environment[signInStandInKey] == "1"
    #else
      false
    #endif
  }

  static func holdsLinking(_ environment: [String: String]) -> Bool {
    #if DEBUG
      environment[holdLinkingKey] == "1"
    #else
      false
    #endif
  }

  static let heldLinking: HeldAnswers? = {
    guard holdsLinking(ProcessInfo.processInfo.environment) else { return nil }
    let held = HeldAnswers()
    held.letGoOnNotice()
    return held
  }()

  static func linkingFailures(_ environment: [String: String]) -> Int {
    #if DEBUG
      environment[failLinkingKey].flatMap(Int.init) ?? 0
    #else
      0
    #endif
  }

  static let failsLinkingAnswers = linkingFailures(ProcessInfo.processInfo.environment)

  static func meaningExamplesFail(_ environment: [String: String]) -> Bool {
    #if DEBUG
      environment[failMeaningExamplesKey] == "1"
    #else
      false
    #endif
  }

  static let failsMeaningExamples = meaningExamplesFail(ProcessInfo.processInfo.environment)

  static func countsDraws(_ environment: [String: String]) -> Bool {
    #if DEBUG
      environment[drawCountKey] == "1"
    #else
      false
    #endif
  }

  static let countsDraws = countsDraws(ProcessInfo.processInfo.environment)

  static func standsInForSpeech(_ environment: [String: String]) -> Bool {
    #if DEBUG
      environment[speechStandInKey] == "1"
    #else
      false
    #endif
  }

  static let standsInForSpeech = standsInForSpeech(ProcessInfo.processInfo.environment)

  @MainActor
  static var speechSynthesis: SpeechSynthesisClient? {
    #if DEBUG
      standsInForSpeech ? SpeechStandIn.shared.client : nil
    #else
      nil
    #endif
  }

  static func colorScheme(_ environment: [String: String]) -> ColorScheme? {
    #if DEBUG
      switch environment[appearanceKey] {
      case "dark": .dark
      case "light": .light
      default: nil
      }
    #else
      nil
    #endif
  }

  static let colorScheme = colorScheme(ProcessInfo.processInfo.environment)

  static func onlySections(_ environment: [String: String]) -> Set<String> {
    #if DEBUG
      Set(environment[onlySectionKey]?.split(separator: ",").map(String.init) ?? [])
    #else
      []
    #endif
  }

  static let onlySections = onlySections(ProcessInfo.processInfo.environment)

  static func shows(_ section: String, on page: String, only: Set<String> = LaunchHarness.onlySections) -> Bool {
    let named = only.filter { $0.hasPrefix(page + ".") }
    return named.isEmpty || named.contains("\(page).\(section)")
  }

  static func linkToOpen(_ environment: [String: String]) -> URL? {
    #if DEBUG
      environment[openLinkKey].flatMap(URL.init(string:))
    #else
      nil
    #endif
  }

  private static func openLinkOnNotice() {
    guard let link = linkToOpen(ProcessInfo.processInfo.environment) else { return }
    var registration: Int32 = 0
    notify_register_dispatch(openLinkNotice, &registration, .main) { _ in
      MainActor.assumeIsolated { AppLinkInbox.shared.receive(link) }
    }
  }

  static var signInProviders: SignInProviders? {
    #if DEBUG
      standsInForSignIn(ProcessInfo.processInfo.environment) ? standInSignIn : nil
    #else
      nil
    #endif
  }

  #if DEBUG
    private static let standInSignIn = SignInProviders(
      appleAuthorization: { _ in
        AppleSignInCredential(
          identityToken: "stand-in.apple.id-token", authorizationCode: "stand-in-code")
      },
      webSignIn: { url, scheme in
        let state = URLComponents(url: url, resolvingAgainstBaseURL: false)?
          .queryItems?.first { $0.name == "state" }?.value ?? ""
        guard let callback = URL(string: "\(scheme):/oauthredirect?code=stand-in&state=\(state)")
        else { throw GoogleSignInError.unexpectedCallback }
        return callback
      })
  #endif

  static var problemReportSender: ProblemReportSender? {
    #if DEBUG
      guard ProcessInfo.processInfo.environment[problemReportStandInKey] == "1" else { return nil }
      return ProblemReportSender(
        canSend: { true }, send: { _ in try? await Task.sleep(for: .milliseconds(400)) })
    #else
      nil
    #endif
  }

  static var accountSession: URLSession? {
    #if DEBUG
      guard ProcessInfo.processInfo.environment[accountStandInKey] == "1" else { return nil }
      let configuration = URLSessionConfiguration.ephemeral
      configuration.protocolClasses = [StandInAccountService.self]
      return AccountAPI.urlSession(configuration)
    #else
      nil
    #endif
  }

  static var standsInForTheAppStore: Bool {
    #if DEBUG
      ProcessInfo.processInfo.environment[appStoreStandInKey] == "1"
    #else
      false
    #endif
  }

  static var appStorePurchases: (any AppStorePurchases)? {
    #if DEBUG
      standsInForTheAppStore ? StandInAppStore() : nil
    #else
      nil
    #endif
  }

  static var youTubeFetch: YouTubeFetch? {
    #if DEBUG
      youTubeStandIn(ProcessInfo.processInfo.environment).map(\.fetch)
    #else
      nil
    #endif
  }

  static var youTubePlayerScript: String? {
    #if DEBUG
      youTubeStandIn(ProcessInfo.processInfo.environment).map(\.playerScript)
    #else
      nil
    #endif
  }

  static var youTubeResultsPage: String? {
    #if DEBUG
      youTubeStandIn(ProcessInfo.processInfo.environment).map { _ in YouTubeStandIn.resultsPage }
    #else
      nil
    #endif
  }

  #if DEBUG
    struct YouTubeStandIn: Decodable {
      let playerResponse: String
      let japanese: String
      let english: String?
      let duration: Double
      let playerError: Int?

      var fetch: YouTubeFetch {
        YouTubeFetch(
          playerResponse: { _ in Data(playerResponse.utf8) },
          timedText: { _, language in
            guard let text = language == nil ? japanese : english else {
              throw YouTubeCaptionError.unreadableCaptions
            }
            return Data(text.utf8)
          })
      }

      var playerScript: String {
        let failure = playerError.map { "options.events.onError({ data: \($0) }); return;" } ?? ""
        return """
          <script>
          window.YT = { PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 }, Player: function (id, options) {
            var time = 0, state = 5, rate = 1, duration = \(duration);
            this.getCurrentTime = function () { return time; };
            this.getPlayerState = function () { return state; };
            this.getDuration = function () { return duration; };
            this.playVideo = function () { state = 1; options.events.onStateChange({ data: 1 }); };
            this.pauseVideo = function () { state = 2; options.events.onStateChange({ data: 2 }); };
            this.seekTo = function (to) { time = Math.max(0, Math.min(to, duration)); };
            this.setPlaybackRate = function (to) { rate = to; };
            this.unloadModule = function () {};
            setInterval(function () {
              if (state === 1) { time = Math.min(duration, time + 0.1 * rate); if (time >= duration) { state = 0; } }
            }, 100);
            setTimeout(function () { \(failure) options.events.onReady({}); }, 0);
          } };
          onYouTubeIframeAPIReady();
          </script>
          """
      }

      static let resultsPage: String = {
        let results = (1...10).map { number in
          #"<ytm-video-with-context-renderer><a href="/watch?v=standInV\#(100 + number)">"#
            + "Stand-in result \(number)</a></ytm-video-with-context-renderer>"
        }
        return """
          <!DOCTYPE html>
          <html><head>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
          <style>
          body {
            margin: 0; font: 17px -apple-system, sans-serif;
            padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom)
              env(safe-area-inset-left);
          }
          ytm-app, ytm-search, ytm-video-with-context-renderer { display: block; }
          ytm-app { padding-top: 48px; }
          [has-pivot-bar=true] ytm-app { padding-bottom: 56px; }
          ytm-mobile-topbar-renderer { position: fixed; top: 0; left: 0; right: 0; height: 48px; }
          ytm-pivot-bar-renderer { display: flex; position: fixed; bottom: 0; left: 0; right: 0; }
          ytm-pivot-bar-renderer div { flex: 1; height: 56px; }
          ytm-video-with-context-renderer a { display: block; height: 240px; }
          </style>
          </head><body has-pivot-bar="true"><ytm-app id="app">
          <ytm-mobile-topbar-renderer id="header-bar"><header data-mode="search">
          <button role="link" aria-label="YouTube Home">YouTube</button>
          <input type="text" placeholder="Search YouTube" aria-label="Search YouTube">
          <button aria-label="Search with your voice">Voice</button>
          </header></ytm-mobile-topbar-renderer>
          <ytm-search>\(results.joined())</ytm-search>
          <ytm-pivot-bar-renderer role="tablist">
          <div role="tab">Home</div><div role="tab">Shorts</div><div role="tab">You</div>
          </ytm-pivot-bar-renderer>
          </ytm-app>
          <script>
          document.querySelectorAll('a[href^="/watch"]').forEach(function (link) {
            link.addEventListener('click', function (event) {
              event.preventDefault();
              history.pushState({}, '', link.href);
            });
          });
          </script>
          </body></html>
          """
      }()
    }

    static func youTubeStandIn(_ environment: [String: String]) -> YouTubeStandIn? {
      environment[youTubeStandInKey].flatMap {
        try? JSONDecoder().decode(YouTubeStandIn.self, from: Data($0.utf8))
      }
    }
  #endif

  static func erasesSavedState(environment: [String: String], bundleID: String?) -> Bool {
    environment[freshStateKey] == "1" && bundleID?.hasSuffix(uiTestBundleSuffix) == true
  }

  private static let prepared: Void = {
    #if DEBUG
      openLinkOnNotice()
      let bundleID = Bundle.main.bundleIdentifier
      let environment = ProcessInfo.processInfo.environment
      guard erasesSavedState(environment: environment, bundleID: bundleID) else { return }
      if let bundleID { UserDefaults.standard.removePersistentDomain(forName: bundleID) }
      KeychainSessionTokenStorage().delete()
      for folder in savedStateFolders {
        try? FileManager.default.removeItem(
          at: URL.applicationSupportDirectory.appending(path: folder, directoryHint: .isDirectory))
      }
      if let shared = SharedContainer.folder { try? FileManager.default.removeItem(at: shared) }
      if let earlierNotes = environment[earlierNotesKey] {
        UserDefaults.standard.set(
          Data(earlierNotes.utf8), forKey: WordNoteStorage.earlierStorageKey)
      }
      if let goal = environment[dailyGoalKey].flatMap(Int.init) {
        DailyGoal.write(goal, to: .standard)
      }
      if let streak = environment[progressStreakKey].flatMap(Int.init) {
        seedProgress(metDays: streak)
      }
      if let days = environment[dailyListsKey].flatMap(Int.init) {
        seedDailyLists(days: days)
      }
    #endif
  }()
}

#if DEBUG
  extension LaunchHarness {
    struct SeededProgress: Encodable {
      let version = 1
      let days: [String: ProgressLogDay]
    }

    private static func seedProgress(metDays: Int) {
      guard metDays > 0 else { return }
      var calendar = Calendar(identifier: .gregorian)
      calendar.timeZone = .autoupdatingCurrent
      var days: [String: ProgressLogDay] = [:]
      for back in 1...metDays {
        guard let day = calendar.date(byAdding: .day, value: -back, to: .now) else { continue }
        let change = ProgressLogChange(
          id: "042e07f7052f611fed33ddddf37f55fd", before: "unknown", after: "learning", at: day)
        days[ProgressLog.day(of: day, in: calendar)] = ProgressLogDay(
          changes: [change], goal: 1, totals: ProgressTotals(known: 0, learning: 1))
      }
      write(SeededProgress(days: days), to: ProgressLog.defaultFileURL)
    }
  }
#endif
