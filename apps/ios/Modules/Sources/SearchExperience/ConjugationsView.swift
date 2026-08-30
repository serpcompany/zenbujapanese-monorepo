import SwiftUI

struct ConjugationsView: View {
  @State private var mode = ConjugationMode.plain

  let entry: DictionaryEntry
  let table: ConjugationTable

  var body: some View {
    ScrollView {
      VStack(spacing: table.supportsModes ? 28 : 0) {
        if table.supportsModes {
          Picker("Conjugation mode", selection: $mode) {
            ForEach(ConjugationMode.allCases, id: \.self) { option in
              Text(option.rawValue)
                .tag(option)
                .accessibilityIdentifier("conjugations.mode.\(option.rawValue.lowercased())")
            }
          }
          .pickerStyle(.segmented)
          .accessibilityIdentifier("conjugations.mode")
        }

        VStack(spacing: 0) {
          let forms = table.forms(for: mode)
          ForEach(Array(forms.enumerated()), id: \.element.id) { index, form in
            ConjugationRow(form: form, isLast: index == forms.count - 1)
          }
        }
        .background(ZenbuTheme.row, in: RoundedRectangle(cornerRadius: 10))
      }
      .padding(.horizontal, 28)
      .padding(.top, 30)
    }
    .accessibilityIdentifier("conjugations.screen")
    .background(ZenbuTheme.background)
    .navigationTitle(table.title)
    .navigationBarTitleDisplayMode(.inline)
  }
}

private struct ConjugationRow: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  let form: ConjugatedForm
  let isLast: Bool

  var body: some View {
    Group {
      if dynamicTypeSize >= .xxLarge {
        VStack(alignment: .leading, spacing: 6) {
          ConjugatedSurface(form: form)
          Text(form.id.title).font(.body).foregroundStyle(ZenbuTheme.secondaryText)
        }
      } else {
        HStack(spacing: 16) {
          ConjugatedSurface(form: form)
            .frame(maxWidth: .infinity, alignment: .leading)
            .layoutPriority(1)
          Text(form.id.title)
            .font(.callout)
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
      }
    }
    .padding(.horizontal, 20)
    .frame(minHeight: 50)
    .overlay(alignment: .bottom) {
      if !isLast {
        Rectangle().fill(ZenbuTheme.divider).frame(height: 0.5)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(form.surface), \(form.id.title)")
    .accessibilityValue(form.reading)
    .accessibilityIdentifier("conjugations.row.\(form.id.rawValue)")
  }
}

private struct ConjugatedSurface: View {
  let form: ConjugatedForm

  var body: some View {
    if let annotation = form.readingAnnotation {
      HStack(alignment: .bottom, spacing: 0) {
        VStack(spacing: -2) {
          Text(annotation.readingPrefix)
            .font(.body)
          Text(annotation.surfacePrefix)
            .font(.title3)
        }
        Text(annotation.sharedSuffix)
          .font(.title3)
      }
      .fixedSize(horizontal: false, vertical: true)
    } else {
      Text(form.surface)
        .font(.title3)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}
