import SwiftUI

struct FrequencyRankRow: View {
  let result: FrequencyLookupResult
  let showDetails: (FrequencyLookupResult) -> Void

  var body: some View {
    let presentation = FrequencyPresentationModel(result: result)
    Button {
      showDetails(result)
    } label: {
      HStack(spacing: 10) {
        FrequencyTierMarker(tier: presentation.tier)
        Text(presentation.packName)
          .foregroundStyle(.primary)
        Spacer(minLength: 8)
        Text(presentation.tier == nil ? presentation.missingText : presentation.inlineText)
          .monospacedDigit()
          .foregroundStyle(.secondary)
      }
      .contentShape(.rect)
    }
    .tint(.primary)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(presentation.inlineAccessibilityLabel)
    .accessibilityAddTraits(.isButton)
    .accessibilityIdentifier(
      "word-detail.frequency.\(presentation.pack?.id.rawValue ?? "unavailable")")
  }
}

struct FrequencyDisclosureItem: Identifiable {
  let result: FrequencyLookupResult

  var id: String {
    FrequencyPresentationModel(result: result).pack?.id.rawValue ?? "frequency-unavailable"
  }
}

struct FrequencyDisclosurePresentation: Equatable {
  struct Pack: Equatable {
    let name: String
    let domain: String
    let description: String
    let version: String
    let source: String
  }

  struct Row: Equatable {
    let label: String
    let value: String
  }

  let pack: Pack?
  let section: String
  let rows: [Row]
  let explanation: String?

  init(result: FrequencyLookupResult) {
    let presentation = FrequencyPresentationModel(result: result)
    pack = presentation.pack.map {
      Pack(
        name: $0.displayName, domain: $0.domain, description: $0.domainDescription,
        version: $0.version, source: $0.attribution)
    }
    section = presentation.levelText == nil ? "Frequency" : "Level"
    if let levelText = presentation.levelText {
      rows = [Row(label: "JLPT Level", value: levelText)]
    } else if let rankText = presentation.rankText,
      let percentileText = presentation.percentileText
    {
      rows = [Row(label: "Rank", value: rankText), Row(label: "Percentile", value: percentileText)]
    } else {
      rows = []
    }
    explanation = rows.isEmpty ? presentation.explanation : nil
  }
}

struct FrequencyDisclosureView: View {
  @Environment(\.dismiss) private var dismiss
  let item: FrequencyDisclosureItem
  let manage: () -> Void

  var body: some View {
    let details = FrequencyDisclosurePresentation(result: item.result)
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
        Section {
          Button("Manage Frequency Dictionaries", action: manage)
            .accessibilityIdentifier("frequency-detail.manage")
        }
      }
      .accessibilityIdentifier("frequency-detail.list")
      .navigationTitle("Frequency Details")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done", action: dismiss.callAsFunction)
        }
      }
    }
  }
}
