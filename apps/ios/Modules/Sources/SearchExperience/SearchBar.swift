import SwiftUI

struct SearchBar: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Binding var query: String
  var isFocused: FocusState<Bool>.Binding
  let isInputActive: Bool
  let activateKeyboard: () -> Void
  let cancel: () -> Void
  let submitQuery: (SearchQuery) -> Void

  var body: some View {
    HStack(spacing: 12) {
      HStack(spacing: 8) {
        Image(systemName: "magnifyingglass")
          .foregroundStyle(.secondary)

        searchTextField
          .textEntry(.uncapitalized)
          .autocorrectionDisabled()
          .submitLabel(.search)
          .focused(isFocused)
          .onChange(of: isFocused.wrappedValue) { _, focused in
            if focused { activateKeyboard() }
          }
          .onSubmit {
            let submittedQuery = SearchQuery(query)
            query = submittedQuery.value
            submitQuery(submittedQuery)
            isFocused.wrappedValue = false
          }
          .accessibilityIdentifier("search.field")

        if !query.isEmpty {
          Button {
            query = ""
          } label: {
            Image(systemName: "xmark.circle.fill")
              .foregroundStyle(.secondary)
              .frame(width: 44, height: 44)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Clear text")
        }

      }
      .font(.body)
      .padding(.horizontal, 10)
      .frame(minHeight: 44)
      .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 9))

      if isInputActive {
        Button("Cancel", action: cancel)
          .buttonStyle(.plain)
          .frame(minHeight: 44)
          .accessibilityIdentifier("search.cancel")
      }
    }
    .padding(.horizontal, 16)
    .padding(.bottom, 10)
  }

  @ViewBuilder
  private var searchTextField: some View {
    if dynamicTypeSize >= .xxLarge {
      TextField("Search", text: $query)
    } else {
      TextField("Search Japanese or English", text: $query)
    }
  }
}
