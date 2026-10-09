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

  func searchField(
    keeping query: Binding<String>,
    isPresented: Binding<Bool>,
    prompt: Text,
    submit: @escaping () -> Void
  ) -> some View {
    modifier(
      QueryKeepingSearchField(
        query: query, isPresented: isPresented, prompt: prompt, submit: submit))
  }
}

private struct QueryKeepingSearchField: ViewModifier {
  private static let fieldRedrawInterval = Duration.milliseconds(20)
  @Binding var query: String
  @Binding var isPresented: Bool
  let prompt: Text
  let submit: () -> Void
  @State private var fieldText = ""
  @State private var queryClearedByField: String?

  func body(content: Content) -> some View {
    content
      .searchField(text: text, isPresented: presentation, prompt: prompt, submit: submit)
      .onChange(of: query, initial: true) { _, newQuery in
        fieldText = newQuery
      }
      .onChange(of: isPresented) { _, presented in
        if !presented { showQueryInField() }
      }
  }

  private var text: Binding<String> {
    Binding(
      get: { fieldText },
      set: { newText in
        fieldText = newText
        guard isPresented else {
          if newText != query { showQueryInField() }
          return
        }
        queryClearedByField = newText.isEmpty ? query : nil
        query = newText
      })
  }

  private var presentation: Binding<Bool> {
    Binding(
      get: { isPresented },
      set: { presented in
        if isPresented, !presented, let clearedQuery = queryClearedByField {
          query = clearedQuery
        }
        queryClearedByField = nil
        isPresented = presented
      })
  }

  private func showQueryInField() {
    Task { @MainActor in
      fieldText = ""
      try? await Task.sleep(for: Self.fieldRedrawInterval)
      fieldText = query
    }
  }
}
