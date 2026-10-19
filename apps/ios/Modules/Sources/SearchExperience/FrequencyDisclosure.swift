import SwiftUI

struct FrequencyRankRow: View {
  let row: FrequencyRow
  let showDetails: (FrequencyRow) -> Void

  var body: some View {
    Button {
      showDetails(row)
    } label: {
      HStack(spacing: 10) {
        FrequencyTierMarker(tier: row.tier)
        Text(row.source)
          .foregroundStyle(.primary)
        Spacer(minLength: 8)
        Text(row.value)
          .monospacedDigit()
          .foregroundStyle(.secondary)
      }
      .contentShape(.rect)
    }
    .tint(.primary)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(row.label). Double tap for details.")
    .accessibilityAddTraits(.isButton)
    .accessibilityIdentifier("word-detail.frequency.\(row.pack ?? "unavailable")")
  }
}

struct FrequencyDisclosureView: View {
  @Environment(\.dismiss) private var dismiss
  let details: FrequencyRow.Details
  var manage: (() -> Void)?

  var body: some View {
    NavigationStack {
      List {
        if let pack = details.pack {
          Section(pack.name) {
            LabeledContent("Domain", value: pack.domain)
            Text(pack.description)
            LabeledContent("Version", value: pack.version)
            LabeledContent("Source", value: pack.source)
          }
        }
        Section(details.section) {
          ForEach(details.rows, id: \.label) { row in
            LabeledContent(row.label, value: row.value)
          }
          if let explanation = details.explanation {
            Text(explanation)
          }
        }
        if let manage {
          Section {
            Button("Manage Frequency Dictionaries", action: manage)
              .accessibilityIdentifier("frequency-detail.manage")
          }
        }
      }
      .accessibilityIdentifier("frequency-detail.list")
      .navigationTitle("Frequency Details")
      .inlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done", action: dismiss.callAsFunction)
        }
      }
    }
    .sheetSize(onMac: AppWindow.sheetSize)
  }
}
