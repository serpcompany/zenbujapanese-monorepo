import SwiftUI

enum SearchInputMode: Equatable {
  case inactive
  case keyboard
  case handwriting
  case radicals
}

struct SearchInputModeBar: View {
  let selectedMode: SearchInputMode
  let selectMode: (SearchInputMode) -> Void

  var body: some View {
    HStack(spacing: 8) {
      Spacer()
      modeButton("Radicals", symbol: "square.grid.3x3", mode: .radicals)
      modeButton("Handwriting", symbol: "hand.draw", mode: .handwriting)
      modeButton("Keyboard", symbol: "keyboard", mode: .keyboard)
    }
    .padding(.horizontal, 12)
    .frame(height: 44)
    .background(ZenbuTheme.row)
  }

  private func modeButton(_ label: String, symbol: String, mode: SearchInputMode) -> some View {
    Button {
      selectMode(mode)
    } label: {
      Image(systemName: symbol)
        .font(.system(size: 21))
        .frame(width: 42, height: 36)
        .background(
          selectedMode == mode ? ZenbuTheme.selectedTab : Color.clear,
          in: RoundedRectangle(cornerRadius: 7))
    }
    .buttonStyle(.plain)
    .foregroundStyle(
      selectedMode == mode ? ZenbuTheme.primaryForeground : ZenbuTheme.foreground
    )
    .accessibilityLabel(label)
    .accessibilityAddTraits(selectedMode == mode ? .isSelected : [])
    .accessibilityIdentifier("search.input.\(mode.accessibilityName)")
  }
}

extension SearchInputMode {
  fileprivate var accessibilityName: String {
    switch self {
    case .inactive: "inactive"
    case .keyboard: "keyboard"
    case .handwriting: "handwriting"
    case .radicals: "radicals"
    }
  }
}
