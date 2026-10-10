import SwiftUI
import WebKit

@MainActor
@Observable
final class YouTubePlayerController {
  enum State: Equatable {
    case loading
    case ready
    case failed(Int)
  }

  private(set) var state = State.loading
  private(set) var currentTime: TimeInterval = 0
  private(set) var isPlaying = false
  private(set) var duration: TimeInterval = 0
  private(set) var playbackRate: Double = 1
  @ObservationIgnored fileprivate weak var webView: WKWebView?

  @ObservationIgnored private var pauseTime: TimeInterval?
  @ObservationIgnored private var stretchStart: TimeInterval?
  private(set) var loop: ClosedRange<TimeInterval>?

  func setLoop(_ range: ClosedRange<TimeInterval>?) {
    loop = range
  }
  var isPlayingOneStretch: Bool { pauseTime != nil }

  func play() {
    pauseTime = nil
    stretchStart = nil
    run("player.playVideo()")
  }

  func pause() {
    pauseTime = nil
    stretchStart = nil
    run("player.pauseVideo()")
  }

  func togglePlayback() {
    isPlaying ? pause() : play()
  }

  func seek(to time: TimeInterval, play shouldPlay: Bool = true) {
    pauseTime = nil
    stretchStart = nil
    currentTime = time
    run("player.seekTo(\(max(time, 0)), true);" + (shouldPlay ? "player.playVideo();" : ""))
  }

  func play(from start: TimeInterval, until end: TimeInterval) {
    seek(to: start)
    stretchStart = start
    pauseTime = end
  }

  func setPlaybackRate(_ rate: Double) {
    playbackRate = rate
    run("player.setPlaybackRate(\(rate))")
  }

  private func run(_ script: String) {
    guard state == .ready else { return }
    webView?.evaluateJavaScript("if (window.player) { \(script) }")
  }

  fileprivate func receive(_ body: Any) {
    guard let message = body as? [String: Any], let event = message["event"] as? String else {
      return
    }
    switch event {
    case "ready":
      state = .ready
    case "time":
      if let time = message["time"] as? Double {
        if let stretchStart, let pauseTime {
          guard time >= stretchStart - 0.5, time < pauseTime + 1 else { break }
          self.stretchStart = nil
        }
        currentTime = time
        if let pauseTime, time >= pauseTime { pause() }
        let hasEnded = message["state"] as? Int == 0
        if let loop, isPlaying || hasEnded,
          time >= loop.upperBound || time < loop.lowerBound - 1 || hasEnded
        {
          seek(to: loop.lowerBound)
        }
      }
      if let length = message["duration"] as? Double, length > 0 { duration = length }
      if let playerState = message["state"] as? Int { isPlaying = playerState == 1 || playerState == 3 }
    case "error":
      state = .failed(message["code"] as? Int ?? 0)
    default:
      break
    }
  }
}

struct YouTubePlayerView: WebViewRepresentable {
  let videoID: YouTubeVideoID
  let controller: YouTubePlayerController

  func makeCoordinator() -> MessageProxy { MessageProxy(controller: controller) }

  func makeWebView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.playsMediaInline()
    configuration.mediaTypesRequiringUserActionForPlayback = []
    configuration.userContentController.add(context.coordinator, name: "player")
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.showsVideoOnBlack(identifier: "watch.player")
    controller.webView = webView
    webView.loadHTMLString(Self.html(videoID), baseURL: Self.origin)
    return webView
  }

  func updateWebView(_ webView: WKWebView, context: Context) {}

  static func dismantleWebView(_ webView: WKWebView, coordinator: MessageProxy) {
    webView.configuration.userContentController.removeScriptMessageHandler(forName: "player")
  }

  private static let origin = URL(string: "https://zenbujapanese.com")!
  private static let youTubeScript = #"<script src="https://www.youtube.com/iframe_api"></script>"#

  private static func html(_ videoID: YouTubeVideoID) -> String {
    """
    <!DOCTYPE html>
    <html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <style>html,body{margin:0;height:100%;background:#000}#player{width:100%;height:100%}</style>
    </head><body>
    <div id="player"></div>
    <script>
    function post(message) { window.webkit.messageHandlers.player.postMessage(message); }
    function onYouTubeIframeAPIReady() {
      window.player = new YT.Player('player', {
        videoId: '\(videoID.rawValue)',
        playerVars: {
          // Player's own controls drive playback, so hide YouTube's.
          controls: 0, disablekb: 1, fs: 0,
          playsinline: 1, rel: 0, cc_load_policy: 0, iv_load_policy: 3,
          origin: '\(origin.absoluteString)', widget_referrer: '\(origin.absoluteString)'
        },
        events: {
          onReady: function () {
            post({ event: 'ready' });
            setInterval(function () {
              post({
                event: 'time', time: player.getCurrentTime(), state: player.getPlayerState(),
                duration: player.getDuration()
              });
            }, 200);
          },
          // Zenbu lists the captions itself, so hide the player's own once they load.
          onStateChange: function (e) {
            if (e.data === YT.PlayerState.PLAYING) { player.unloadModule('captions'); }
          },
          onError: function (e) { post({ event: 'error', code: e.data }); }
        }
      });
    }
    </script>
    \(LaunchHarness.youTubePlayerScript ?? youTubeScript)
    </body></html>
    """
  }

  final class MessageProxy: NSObject, WKScriptMessageHandler {
    private weak var controller: YouTubePlayerController?

    init(controller: YouTubePlayerController) {
      self.controller = controller
    }

    func userContentController(
      _ userContentController: WKUserContentController,
      didReceive message: WKScriptMessage
    ) {
      controller?.receive(message.body)
    }
  }
}
