import SwiftUI

extension View {
  func searchField(
    text: Binding<String>,
    isPresented: Binding<Bool>,
    prompt: Text,
    submit: @escaping () -> Void
  ) -> some View {
    modifier(SearchField(text: text, isPresented: isPresented, prompt: prompt, submit: submit))
  }
}

private struct SearchField: ViewModifier {
  @Binding var text: String
  @Binding var isPresented: Bool
  let prompt: Text
  let submit: () -> Void
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass

  func body(content: Content) -> some View {
    content
      .searchable(text: $text, isPresented: $isPresented, placement: .alwaysShown, prompt: prompt)
      .searchPresentationToolbarBehavior(keepingTabsAtTheTopOfAWideScreen)
      .inlineNavigationTitle()
      .textEntry(.uncapitalized)
      .autocorrectionDisabled()
      .onSubmit(of: .search, submit)
  }

  private var keepingTabsAtTheTopOfAWideScreen: SearchPresentationToolbarBehavior {
    horizontalSizeClass == .regular ? .avoidHidingContent : .automatic
  }
}
