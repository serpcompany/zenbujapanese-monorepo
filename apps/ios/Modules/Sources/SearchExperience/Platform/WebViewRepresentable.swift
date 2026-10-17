import SwiftUI
import WebKit

#if os(macOS)
  protocol WebViewRepresentable: NSViewRepresentable where NSViewType == WKWebView {
    func makeWebView(context: Context) -> WKWebView
    func updateWebView(_ webView: WKWebView, context: Context)
    static func dismantleWebView(_ webView: WKWebView, coordinator: Coordinator)
  }

  extension WebViewRepresentable {
    func makeNSView(context: Context) -> WKWebView { makeWebView(context: context) }

    func updateNSView(_ webView: WKWebView, context: Context) {
      updateWebView(webView, context: context)
    }

    static func dismantleNSView(_ webView: WKWebView, coordinator: Coordinator) {
      dismantleWebView(webView, coordinator: coordinator)
    }
  }
#else
  protocol WebViewRepresentable: UIViewRepresentable where UIViewType == WKWebView {
    func makeWebView(context: Context) -> WKWebView
    func updateWebView(_ webView: WKWebView, context: Context)
    static func dismantleWebView(_ webView: WKWebView, coordinator: Coordinator)
  }

  extension WebViewRepresentable {
    func makeUIView(context: Context) -> WKWebView { makeWebView(context: context) }

    func updateUIView(_ webView: WKWebView, context: Context) {
      updateWebView(webView, context: context)
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
      dismantleWebView(webView, coordinator: coordinator)
    }
  }
#endif

extension WebViewRepresentable {
  static func dismantleWebView(_ webView: WKWebView, coordinator: Coordinator) {}
}

extension WKWebViewConfiguration {
  func playsMediaInline() {
    #if os(iOS)
      allowsInlineMediaPlayback = true
    #endif
  }
}

extension WKWebView {
  func showsVideoOnBlack(identifier: String) {
    #if os(macOS)
      underPageBackgroundColor = .black
      setValue(false, forKey: "drawsBackground")
      setAccessibilityIdentifier(identifier)
    #else
      isOpaque = false
      backgroundColor = .black
      scrollView.isScrollEnabled = false
      accessibilityIdentifier = identifier
    #endif
  }
}
