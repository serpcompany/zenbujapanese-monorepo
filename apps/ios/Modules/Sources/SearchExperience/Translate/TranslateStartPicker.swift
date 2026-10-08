import SwiftUI
import TranslatorCore

struct TranslateStartPicker: View {
  @Binding var selection: TranslateStart

  var body: some View {
    VStack(spacing: 24) {
      hero
      VStack(spacing: 2) {
        ForEach(TranslateStart.allCases) { option in
          StartOption(option: option, isSelected: option == selection) { selection = option }
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
      .frame(height: 110)
      .background(.tint.opacity(0.12), in: .rect(cornerRadius: 40))
      .accessibilityHidden(true)
  }
}

private struct StartOption: View {
  let option: TranslateStart
  let isSelected: Bool
  let select: () -> Void

  var body: some View {
    Button(action: select) {
      HStack(alignment: .firstTextBaseline, spacing: 14) {
        Image(systemName: option.systemImage)
          .font(.title3)
          .frame(width: 28)
        VStack(alignment: .leading, spacing: 4) {
          Text(option.title)
            .font(.title3)
          Text(option.summary)
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
          : AnyShapeStyle(SystemColor.secondaryBackground))
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
    .accessibilityIdentifier("translate.start.\(option.rawValue)")
  }
}
