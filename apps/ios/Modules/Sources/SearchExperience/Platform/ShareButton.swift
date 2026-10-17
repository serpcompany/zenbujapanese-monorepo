import SwiftUI

#if os(macOS)
  import AppKit
#endif

struct ShareButton: View {
  let page: SharedPage

  var body: some View {
    #if os(macOS)
      SharingServicePickerButton(items: page.sharedItems) { label }
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

#if os(macOS)
  private struct SharingServicePickerButton<ButtonLabel: View>: View {
    let items: [Any]
    @ViewBuilder let label: () -> ButtonLabel
    @State private var anchor = SharingAnchor()

    var body: some View {
      Button { anchor.show(items) } label: { label() }
        .background(SharingAnchorView(anchor: anchor))
    }
  }

  @MainActor
  private final class SharingAnchor {
    weak var view: NSView?

    func show(_ items: [Any]) {
      guard let view else { return }
      NSSharingServicePicker(items: items).show(
        relativeTo: view.bounds, of: view, preferredEdge: .minY)
    }
  }

  private struct SharingAnchorView: NSViewRepresentable {
    let anchor: SharingAnchor

    func makeNSView(context: Context) -> NSView { NSView() }

    func updateNSView(_ view: NSView, context: Context) {
      anchor.view = view
    }
  }
#endif
