import SwiftUI

struct PagedView<Selection: Hashable, Content: View>: View {
  @Binding var selection: Selection
  let showsIndex: Bool
  var interactiveIndex = false
  @ViewBuilder let content: Content

  @ViewBuilder
  var body: some View {
    #if os(macOS)
      Group(subviews: content) { pages in
        ScrollView(.horizontal) {
          HStack(spacing: 0) {
            ForEach(pages) { page in
              page
                .containerRelativeFrame(.horizontal)
                .id(page.containerValues.tag(for: Selection.self))
            }
          }
          .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollIndicators(.never)
        .scrollPosition(id: scrolledPage)
        .overlay(alignment: .bottom) {
          if showsIndex, pages.count > 1 {
            PageDots(pages: pages.compactMap { $0.containerValues.tag(for: Selection.self) }, selection: $selection)
          }
        }
      }
    #else
      let pages = TabView(selection: $selection) { content }
        .tabViewStyle(.page(indexDisplayMode: showsIndex ? .automatic : .never))
      if interactiveIndex {
        pages.indexViewStyle(.page(backgroundDisplayMode: .interactive))
      } else {
        pages
      }
    #endif
  }

  #if os(macOS)
    private var scrolledPage: Binding<Selection?> {
      Binding { selection } set: { page in
        if let page, page != selection { selection = page }
      }
    }
  #endif
}

#if os(macOS)
  private struct PageDots<Selection: Hashable>: View {
    let pages: [Selection]
    @Binding var selection: Selection

    var body: some View {
      HStack(spacing: 8) {
        ForEach(Array(pages.enumerated()), id: \.offset) { index, page in
          Button {
            withAnimation { selection = page }
          } label: {
            Circle()
              .fill(page == selection ? Color.primary : Color.secondary.opacity(0.4))
              .frame(width: 8, height: 8)
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Page \(index + 1) of \(pages.count)")
        }
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .background(.regularMaterial, in: .capsule)
      .padding(.bottom, 12)
    }
  }
#endif
