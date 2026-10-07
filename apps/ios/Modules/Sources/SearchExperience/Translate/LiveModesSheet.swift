import SwiftUI
import TranslatorCore

struct LiveModesSheet: View {
  let confirmTitle: String
  let confirm: (TranslateMode) -> Void
  @State private var selection: TranslateMode
  @Environment(\.dismiss) private var dismiss

  init(
    selection: TranslateMode, confirmTitle: String, confirm: @escaping (TranslateMode) -> Void
  ) {
    _selection = State(initialValue: selection)
    self.confirmTitle = confirmTitle
    self.confirm = confirm
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 24) {
          Text("Live translation modes")
            .font(.largeTitle)
            .multilineTextAlignment(.center)
          LiveModesPicker(selection: $selection)
        }
        .padding(.horizontal)
        .padding(.bottom, 24)
      }
      .safeAreaInset(edge: .bottom) {
        Button {
          confirm(selection)
          dismiss()
        } label: {
          Text(confirmTitle)
            .font(.headline)
            .padding(.horizontal, 28)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
        .controlSize(.large)
        .padding(.bottom, 8)
        .accessibilityIdentifier("translate.modes.confirm")
      }
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Close", systemImage: "xmark") { dismiss() }
        }
      }
    }
    .presentationDetents([.large])
    .accessibilityIdentifier("translate.modes")
  }
}

struct LiveModesPicker: View {
  @Binding var selection: TranslateMode

  var body: some View {
    VStack(spacing: 24) {
      hero
      VStack(spacing: 2) {
        ForEach(TranslateMode.allCases) { mode in
          ModeOption(mode: mode, isSelected: mode == selection) { selection = mode }
        }
      }
      .clipShape(.rect(cornerRadius: 24))
    }
  }

  private var hero: some View {
    Image(systemName: selection.heroSymbol)
      .font(.system(size: 64))
      .foregroundStyle(.tint)
      .contentTransition(.symbolEffect(.replace))
      .frame(maxWidth: .infinity)
      .frame(height: 150)
      .background(.tint.opacity(0.12), in: .rect(cornerRadius: 40))
      .accessibilityHidden(true)
  }
}

private struct ModeOption: View {
  let mode: TranslateMode
  let isSelected: Bool
  let select: () -> Void

  var body: some View {
    Button(action: select) {
      HStack(alignment: .firstTextBaseline, spacing: 14) {
        Image(systemName: mode.systemImage)
          .font(.title3)
          .frame(width: 28)
        VStack(alignment: .leading, spacing: 4) {
          Text(mode.title)
            .font(.title3)
          Text(mode.summary)
            .font(.subheadline)
            .foregroundStyle(isSelected ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
            .fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 0)
        if isSelected {
          Image(systemName: "checkmark")
            .font(.headline)
        }
      }
      .foregroundStyle(isSelected ? AnyShapeStyle(.tint) : AnyShapeStyle(.primary))
      .padding(18)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        isSelected
          ? AnyShapeStyle(.tint.opacity(0.18))
          : AnyShapeStyle(Color(uiColor: .secondarySystemBackground)))
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
    .accessibilityIdentifier("translate.mode.\(mode.rawValue)")
  }
}
