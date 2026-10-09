import Foundation

enum LaunchHarness {
  static let freshStateKey = "ZENBU_UI_TEST_FRESH"
  static let cameraImageKey = "ZENBU_CAMERA_IMAGE"
  static let signInStandInKey = "ZENBU_SIGN_IN_STAND_IN"
  static let youTubeStandInKey = "ZENBU_YOUTUBE_STAND_IN"
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
      let bundleID = Bundle.main.bundleIdentifier
      guard erasesSavedState(environment: ProcessInfo.processInfo.environment, bundleID: bundleID)
      else { return }
      if let bundleID { UserDefaults.standard.removePersistentDomain(forName: bundleID) }
      for folder in savedStateFolders {
        try? FileManager.default.removeItem(
          at: URL.applicationSupportDirectory.appending(path: folder, directoryHint: .isDirectory))
      }
    #endif
  }()
}
