import SwiftUI

struct ShareButton: View {
  let page: SharedPage

  var body: some View {
    #if os(macOS)
      ShareLink(item: page.text) { label }
    #else
      if let url = page.url {
        ShareLink(item: url, message: Text(page.text), preview: SharePreview(page.title)) { label }
      } else {
        ShareLink(item: page.text) { label }
      }
    #endif
  }

  private var label: some View {
    Label("Share", systemImage: "square.and.arrow.up")
  }
}
