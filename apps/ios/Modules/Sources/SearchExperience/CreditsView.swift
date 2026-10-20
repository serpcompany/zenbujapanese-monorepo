import SwiftUI

struct CreditsView: View {
  private let shown = SourceCredits.shown

  var body: some View {
    List {
      if let shown {
        Section {
          Text(verbatim: "Zenbu Japanese is built on these open sources. \(shown.conversionNotice)")
        }

        ForEach(shown.credits) { credit in
          Section(credit.name) {
            Text(verbatim: credit.credit)
              .accessibilityIdentifier("credits.source.\(credit.id)")
            if let notice = credit.notice {
              Text(verbatim: notice)
                .accessibilityIdentifier("credits.notice.\(credit.id)")
            }
            LabeledContent("License", value: credit.license.name)
            Link("Project", destination: credit.url)
          }
        }
      } else {
        Section {
          Text("Credits unavailable")
            .accessibilityIdentifier("credits.unavailable")
        }
      }

      Section {
        NavigationLink("Licenses") {
          LicensesView(shown: shown)
        }
        .accessibilityIdentifier("credits.licenses")
      }
    }
    .accessibilityIdentifier("credits.list")
    .headerProminence(.increased)
    .navigationTitle("Credits & Attributions")
    .inlineNavigationTitle()
  }
}

struct BundledLicenseText: Identifiable, Sendable {
  var source: String?
  var package: String?
  var name: String?
  let resource: String
  var resourceExtension = "txt"
  var subdirectory: String?

  var id: String { "\(subdirectory.map { "\($0)/" } ?? "")\(resource).\(resourceExtension)" }

  func title(in shown: SourceCredits?) -> String {
    name ?? source.flatMap { shown?.credit($0)?.name } ?? resource
  }

  var contents: String? {
    let url =
      BundledData.bundle.url(
        forResource: resource, withExtension: resourceExtension, subdirectory: subdirectory)
      ?? BundledData.bundle.url(forResource: resource, withExtension: resourceExtension)
    return url.flatMap { try? String(contentsOf: $0, encoding: .utf8) }
  }

  static let listed = [
    BundledLicenseText(source: "kanjivg", resource: "KANJIVG-CC-BY-SA-3.0"),
    BundledLicenseText(source: "unidic", resource: "UNIDIC-NEW-BSD"),
    BundledLicenseText(source: "jlpt", resource: "JLPT-VOCABULARY-CC-BY-SA-4.0"),
    BundledLicenseText(source: "tubelex", resource: "TUBELEX-BSD-3-CLAUSE"),
    BundledLicenseText(source: "wikipedia", resource: "WIKIPEDIA-FREQUENCY-BSD-3-CLAUSE"),
    BundledLicenseText(
      source: "sudachi", package: "sudachi-swift", resource: "SudachiLanguageTechnologyNotices"),
    BundledLicenseText(source: "kuromoji", resource: "LICENSE-2.0", subdirectory: "Kuromoji"),
    BundledLicenseText(
      source: "kuromoji", name: "IPADIC", resource: "NOTICE", resourceExtension: "md",
      subdirectory: "Kuromoji"),
    BundledLicenseText(source: "tatoeba", resource: "TATOEBA-NOTICE"),
    BundledLicenseText(source: "dakanji", resource: "DAKANJI-MIT"),
    BundledLicenseText(package: "sentry-cocoa", name: "Sentry", resource: "SENTRY-COCOA-NOTICES"),
    BundledLicenseText(
      package: "zipfoundation", name: "ZIPFoundation", resource: "ZIPFOUNDATION-MIT"),
  ]

  static let sourcesWithLinkedTerms = ["jmdict", "kanjium", "tatoeba"]
}

private struct LicensesView: View {
  let shown: SourceCredits?

  private var linkedTerms: [SourceCredit.License] {
    BundledLicenseText.sourcesWithLinkedTerms.compactMap { shown?.credit($0)?.license }
  }

  var body: some View {
    List {
      Section("License Texts") {
        ForEach(BundledLicenseText.listed) { file in
          NavigationLink(file.title(in: shown)) {
            BundledLicenseTextView(title: file.title(in: shown), file: file)
          }
          .accessibilityIdentifier("licenses.text.\(file.id)")
        }
      }

      if !linkedTerms.isEmpty {
        Section("License Terms") {
          ForEach(linkedTerms, id: \.name) { license in
            if let url = license.url {
              Link(license.name, destination: url)
            }
          }
        }
      }

      Section {
        NavigationLink("Tatoeba Contributors") {
          TatoebaContributorCreditsView()
        }
        .accessibilityIdentifier("credits.tatoeba-contributors")
      }
    }
    .navigationTitle("Licenses")
    .inlineNavigationTitle()
  }
}

private struct TatoebaContributorCreditsView: View {
  @State private var credits: [TatoebaContributorCredit] = []

  var body: some View {
    List {
      Section {
        Text("Sentences without a named contributor are credited to Tatoeba contributors.")
      }
      Section("Named contributors (\(credits.count))") {
        ForEach(credits) { credit in
          LabeledContent(credit.username, value: "\(credit.sentenceSideCount)")
        }
      }
    }
    .navigationTitle("Tatoeba Contributors")
    .inlineNavigationTitle()
    .task {
      guard credits.isEmpty else { return }
      credits = TatoebaAttributionClient.contributorCredits()
    }
  }
}

private struct BundledLicenseTextView: View {
  let title: String
  let file: BundledLicenseText

  var body: some View {
    List {
      Section {
        Text(file.contents ?? "License text unavailable")
          .font(.system(.footnote, design: .monospaced))
          .accessibilityIdentifier("credits.license-text")
      }
    }
    .navigationTitle(title)
    .inlineNavigationTitle()
  }
}
