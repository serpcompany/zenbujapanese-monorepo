import SwiftUI
import UIKit

// Disposable #173 control: ordinary native components only, no Zenbu imports.
struct DefaultContrastControlView: View {
  @Environment(\.dynamicTypeSize) private var textSize
  @Environment(\.colorScheme) private var appearance

  private var fixture: String {
    let arguments = ProcessInfo.processInfo.arguments
    guard let index = arguments.firstIndex(of: "-DefaultContrastControl") else { return "search" }
    return arguments[index + 1]
  }

  var body: some View {
    TabView {
      Tab("Search", systemImage: "magnifyingglass") {
        NavigationStack {
          Group {
            if fixture == "detail" { detail } else { search }
          }
          .accessibilityIdentifier("default-control.list")
          .accessibilityValue(
            "size=\(textSize == .large ? "large" : "other"); appearance=\(appearance == .dark ? "dark" : "light"); increaseContrast=\(UIAccessibility.isDarkerSystemColorsEnabled); bold=\(UIAccessibility.isBoldTextEnabled); reduceTransparency=\(UIAccessibility.isReduceTransparencyEnabled)"
          )
          .navigationTitle(fixture == "detail" ? "日本" : "Search")
          .navigationBarTitleDisplayMode(.inline)
        }
      }
      Tab("You", systemImage: "person.crop.circle") { Text("Native control") }
    }
    .scrollEdgeEffectStyle(.hard, for: .bottom)
  }

  private var search: some View {
    List {
      if fixture == "defect" || fixture == "repair" {
        Text("Sensitivity control")
          .foregroundStyle(.primary.opacity(fixture == "defect" ? 0.12 : 1))
          .accessibilityIdentifier("default-control.sensitivity")
      }
      Section("Best Matches") {
        NavigationLink {
          Text("Japan")
        } label: {
          HStack(alignment: .top, spacing: 10) {
            Text("#115")
              .font(.caption.monospacedDigit())
              .foregroundStyle(.secondary)
              .fixedSize(horizontal: false, vertical: true)
              .accessibilityHidden(true)
              .frame(minWidth: 54, alignment: .leading)
            Text("日本, Japan").font(.body).foregroundStyle(.primary)
          }
        }
        .accessibilityLabel("日本, にほん, Japan")
        .accessibilityValue("Best match 1, Frequency rank 115")
        .accessibilityIdentifier("default-control.rank-row")
      }
      Section {
        Text("Native result")
      } header: {
        Text("Additional Matches")
      }
    }
    .listStyle(.plain)
  }

  private var detail: some View {
    List {
      Section {
        LabeledContent {
          Text("Noun")
            .multilineTextAlignment(.trailing)
            .fixedSize(horizontal: false, vertical: true)
        } label: {
          Text("Part of speech")
        }
      }
      Section("ALTERNATIVES") { Text("にっぽん") }
      Section("MEANING") { Text("1. Japan").font(.body.weight(.semibold)) }
      Section("KANJI") { Text("日") }
      Section("NOTES") {
        Button("Add Note", systemImage: "square.and.pencil", action: {})
          .font(.body)
      }
    }
    .listStyle(.insetGrouped)
  }
}
