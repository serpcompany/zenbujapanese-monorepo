import SwiftUI

enum SearchInputMode: Equatable {
  case inactive
  case keyboard
  case handwriting
  case radicals
}

struct SearchInputModePicker: View {
  let selectedMode: SearchInputMode
  let selectMode: (SearchInputMode) -> Void

  var body: some View {
    Picker("Search input", selection: selection) {
      Text("Keyboard")
        .tag(SearchInputMode.keyboard)
        .accessibilityIdentifier("search.input.keyboard")
      Text("Handwriting")
        .tag(SearchInputMode.handwriting)
        .accessibilityIdentifier("search.input.handwriting")
      Text("Radicals")
        .tag(SearchInputMode.radicals)
        .accessibilityIdentifier("search.input.radicals")
    }
    .pickerStyle(.segmented)
    .accessibilityIdentifier("search.input.mode")
    .padding(.horizontal)
    .padding(.vertical, 8)
  }

  private var selection: Binding<SearchInputMode> {
    Binding(
      get: { selectedMode == .inactive ? .keyboard : selectedMode },
      set: { mode in selectMode(mode) }
    )
  }
}
