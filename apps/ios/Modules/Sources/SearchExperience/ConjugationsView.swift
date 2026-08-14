import SwiftUI

struct ConjugationsView: View {
  @Environment(\.dismiss) private var dismiss
  @State private var mode = ConjugationMode.plain

  let entry: DictionaryEntry
  let table: ConjugationTable

  var body: some View {
    VStack(spacing: 0) {
      toolbar

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
        .padding(.bottom, SearchExperienceLayout.bottomNavigationContentClearance)
      }
      .accessibilityIdentifier("conjugations.screen")
    }
    .background(ZenbuTheme.background)
    .toolbar(.hidden, for: .navigationBar)
  }

  private var toolbar: some View {
    HStack {
      Button(action: { dismiss() }) {
        HStack(spacing: 4) {
          Image(systemName: "chevron.left")
          Text(entry.headword)
        }
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("conjugations.back")

      Spacer()
      Text(table.title)
        .font(.headline)
      Spacer()
      Color.clear.frame(width: 72, height: 1)
    }
    .padding(.horizontal, 16)
    .frame(height: 49)
    .background(ZenbuTheme.chrome.ignoresSafeArea(edges: .top))
  }
}

private struct ConjugationRow: View {
  let form: ConjugatedForm
  let isLast: Bool

  var body: some View {
    HStack(spacing: 16) {
      ConjugatedSurface(form: form)
        .frame(maxWidth: .infinity, alignment: .leading)
        .layoutPriority(1)
      Text(form.id.title)
        .font(.system(size: 16))
        .fixedSize(horizontal: true, vertical: false)
        .frame(maxWidth: .infinity, alignment: .trailing)
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
            .font(.system(size: 10))
          Text(annotation.surfacePrefix)
            .font(.system(size: 19))
        }
        Text(annotation.sharedSuffix)
          .font(.system(size: 19))
      }
      .lineLimit(1)
      .minimumScaleFactor(0.72)
    } else {
      Text(form.surface)
        .font(.system(size: 19))
        .lineLimit(1)
        .minimumScaleFactor(0.72)
    }
  }
}
