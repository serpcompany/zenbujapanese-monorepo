import SwiftUI
import WebKit

/// Where Player searches for videos. Each provider is a results page shown in an in-app browser;
/// choosing a YouTube video from it opens the video in Player.
enum VideoSearchProvider: String, Hashable, CaseIterable, Sendable {
  case youTube
  case googleVideos

  var name: String {
    switch self {
    case .youTube: "YouTube"
    case .googleVideos: "Google Videos"
    }
  }

  func resultsURL(for query: String) -> URL? {
    var components: URLComponents?
    switch self {
    case .youTube:
      components = URLComponents(string: "https://m.youtube.com/results")
      components?.queryItems = [URLQueryItem(name: "search_query", value: query)]
    case .googleVideos:
      components = URLComponents(string: "https://www.google.com/search")
      components?.queryItems = [
        URLQueryItem(name: "q", value: query), URLQueryItem(name: "tbm", value: "vid"),
      ]
    }
    return components?.url
  }
}

struct VideoSearch: Hashable, Sendable {
  let query: String
  let provider: VideoSearchProvider
}

/// Shows a provider's results page and hands any chosen YouTube video to Player.
struct VideoSearchView: View {
  let search: VideoSearch
  let openVideo: (YouTubeVideoID) -> Void

  var body: some View {
    Group {
      if let url = search.provider.resultsURL(for: search.query) {
        VideoSearchWebView(url: url, openVideo: openVideo)
          .ignoresSafeArea(edges: .bottom)
      } else {
        ContentUnavailableView.search(text: search.query)
      }
    }
    .navigationTitle(search.query)
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityIdentifier("watch.search-results")
  }
}

private struct VideoSearchWebView: UIViewRepresentable {
  let url: URL
  let openVideo: (YouTubeVideoID) -> Void

  func makeCoordinator() -> Coordinator { Coordinator(openVideo: openVideo) }

  func makeUIView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    // Results pages preview videos; only Player should play them.
    configuration.mediaTypesRequiringUserActionForPlayback = .all
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = context.coordinator
    webView.allowsBackForwardNavigationGestures = true
    context.coordinator.observe(webView)
    webView.load(URLRequest(url: url))
    return webView
  }

  func updateUIView(_ webView: WKWebView, context: Context) {
    context.coordinator.openVideo = openVideo
  }

  @MainActor
  final class Coordinator: NSObject, WKNavigationDelegate {
    var openVideo: (YouTubeVideoID) -> Void
    private var urlObservation: NSKeyValueObservation?

    init(openVideo: @escaping (YouTubeVideoID) -> Void) {
      self.openVideo = openVideo
    }

    /// YouTube's mobile site changes pages without loading them, so watch the URL as well.
    func observe(_ webView: WKWebView) {
      urlObservation = webView.observe(\.url, options: .new) { [weak self] webView, _ in
        MainActor.assumeIsolated {
          guard let url = webView.url, let videoID = YouTubeVideoID(navigatingTo: url) else {
            return
          }
          webView.stopLoading()
          if webView.canGoBack { webView.goBack() }
          self?.openVideo(videoID)
        }
      }
    }

    func webView(
      _ webView: WKWebView,
      decidePolicyFor navigationAction: WKNavigationAction
    ) async -> WKNavigationActionPolicy {
      guard navigationAction.targetFrame?.isMainFrame != false,
        let url = navigationAction.request.url,
        let videoID = YouTubeVideoID(navigatingTo: url)
      else { return .allow }
      openVideo(videoID)
      return .cancel
    }
  }
}
