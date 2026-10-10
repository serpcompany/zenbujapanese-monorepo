import SwiftUI

extension View {
  func searchField(
    text: Binding<String>,
    isPresented: Binding<Bool>,
    prompt: Text,
    submit: @escaping () -> Void
  ) -> some View {
    searchable(
      text: text,
      isPresented: isPresented,
      placement: .alwaysShown,
      prompt: prompt
    )
    .inlineNavigationTitle()
    .textEntry(.uncapitalized)
    .autocorrectionDisabled()
    .onSubmit(of: .search, submit)
  }
}
