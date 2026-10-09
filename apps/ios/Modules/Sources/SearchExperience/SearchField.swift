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
      placement: .navigationBarDrawer(displayMode: .always),
      prompt: prompt
    )
    .navigationBarTitleDisplayMode(.inline)
    .textInputAutocapitalization(.never)
    .autocorrectionDisabled()
    .onSubmit(of: .search, submit)
  }
}
