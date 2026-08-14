import SwiftUI

struct DictionarySourcesView: View {
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List {
        Section("JMdict") {
          Text("Dictionary data from the Electronic Dictionary Research and Development Group.")
          HStack {
            Text("License")
            Spacer()
            Text("CC BY-SA 4.0")
          }
          LabeledContent("Snapshot", value: "2026-08-10")
          Link("Project documentation", destination: URL(string: "https://www.edrdg.org/jmdict/j_jmdict.html")!)
          Link("License terms", destination: URL(string: "https://www.edrdg.org/edrdg/licence.html")!)
        }

        Section("KANJIDIC2") {
          Text("Kanji classifications, meanings, and Japanese readings from the Electronic Dictionary Research and Development Group.")
          HStack {
            Text("License")
            Spacer()
            Text("CC BY-SA 4.0")
          }
          LabeledContent("Snapshot", value: "2026-08-10")
          Link("Project documentation", destination: URL(string: "https://www.edrdg.org/wiki/index.php/KANJIDIC_Project")!)
          Link("License terms", destination: URL(string: "https://www.edrdg.org/edrdg/licence.html")!)
        }

        Section("KRADFILE / RADKFILE") {
          Text("Visible kanji-component data from the Electronic Dictionary Research and Development Group.")
          HStack {
            Text("License")
            Spacer()
            Text("CC BY-SA 4.0")
          }
          LabeledContent("Snapshot", value: "2026-08-10")
          Link("Project documentation", destination: URL(string: "https://www.edrdg.org/krad/kradinf.html")!)
          Link("License terms", destination: URL(string: "https://www.edrdg.org/edrdg/licence.html")!)
        }

        Section("KanjiVG") {
          Text("Ordered kanji stroke geometry from KanjiVG by Ulrich Apel, transformed into Zenbu's app-owned drawing format.")
          HStack {
            Text("License")
            Spacer()
            Text("CC BY-SA 3.0")
          }
          LabeledContent("Release", value: "r20250816")
          NavigationLink("Bundled license text") {
            BundledLicenseTextView(
              title: "KanjiVG CC BY-SA 3.0 License",
              resource: "KANJIVG-CC-BY-SA-3.0"
            )
          }
          .accessibilityIdentifier("dictionary-sources.kanjivg-license")
          Link("Project documentation", destination: URL(string: "https://kanjivg.tagaini.net/")!)
          Link("License terms", destination: URL(string: "https://creativecommons.org/licenses/by-sa/3.0/")!)
        }

        Section("Kanjium") {
          Text("Kanji element structures and variants from Kanjium, including additions and modifications by Uros O. and EDRDG-derived fields.")
          HStack {
            Text("License")
            Spacer()
            Text("CC BY-SA 4.0")
          }
          LabeledContent("Snapshot", value: "8a0cdaa")
          Link("Project and attribution", destination: URL(string: "https://github.com/mifunetoshiro/kanjium")!)
          Link("License terms", destination: URL(string: "https://creativecommons.org/licenses/by-sa/4.0/")!)
        }

        Section("UniDic") {
          Text("Pitch-accent facts from UniDic for Contemporary Written Japanese 3.1.0, published by the National Institute for Japanese Language and Linguistics.")
          HStack {
            Text("License")
            Spacer()
            Text("New BSD")
          }
          LabeledContent("Version", value: "3.1.0")
          NavigationLink("Bundled license text") {
            BundledLicenseTextView(
              title: "UniDic New BSD License",
              resource: "UNIDIC-NEW-BSD"
            )
          }
          .accessibilityIdentifier("dictionary-sources.unidic-license")
          Link("Project documentation", destination: URL(string: "https://clrd.ninjal.ac.jp/unidic_archive/cwj/3.1.0/")!)
          Link("License terms", destination: URL(string: "https://clrd.ninjal.ac.jp/unidic_archive/cwj/back_number_en.html")!)
        }

        Section("Tatoeba") {
          Text("Offline Japanese–English example sentences from Tatoeba's official weekly export.")
          HStack {
            Text("License")
            Spacer()
            Text("CC BY 2.0 FR")
          }
          LabeledContent("Snapshot", value: "2026-08-08")
          Link("Project and downloads", destination: URL(string: "https://tatoeba.org/en/downloads")!)
          Link("License terms", destination: URL(string: "https://creativecommons.org/licenses/by/2.0/fr/")!)
        }

        Section("DaKanji handwriting recognition") {
          Text("Offline single-character handwriting recognition by Dario Radmann and DaKanji contributors, converted to Core ML by Zenbu Japanese.")
          HStack {
            Text("License")
            Spacer()
            Text("MIT")
          }
          LabeledContent("Model", value: "Single Kanji Recognition v1.2")
          NavigationLink("Bundled license text") {
            BundledLicenseTextView(
              title: "DaKanji MIT License",
              resource: "DAKANJI-MIT"
            )
          }
          .accessibilityIdentifier("dictionary-sources.dakanji-license")
          Link("Project and model source", destination: URL(string: "https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition")!)
        }

        Section("Zenbu transforms") {
          Text(
            "Zenbu retains each JMdict ent_seq source identifier and normalizes written forms, readings, English glosses, priority markers, and searchable romaji behind app-owned Language Reference Data. KANJIDIC2 classifications, English meanings, and Japanese readings are combined with KRADFILE visible-component membership behind a focused app-owned Kanji Reference capability. Kanjium structures and variants are normalized to top-level elements and combined with app-owned KANJIDIC reading summaries; no provider schema or proprietary etymology explanation reaches the product experience. KanjiVG paths are filtered to ideographs, normalized from SVG commands to absolute cubic geometry, and packaged in an app-owned ordered-stroke schema for Zenbu's renderer. Exact UniDic base-form and reading matches add app-owned pitch downstep facts. Tatoeba translation links become offline app-owned example pairs. Radical Search verifies KRADFILE membership against RADKFILE's stroke counts and inverted membership."
          )
        }
      }
      .accessibilityIdentifier("dictionary-sources.list")
      .navigationTitle("Dictionary Sources")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { dismiss() }
        }
      }
    }
  }
}

private struct BundledLicenseTextView: View {
  let title: String
  let resource: String

  private var text: String {
    guard let url = Bundle.module.url(forResource: resource, withExtension: "txt"),
          let contents = try? String(contentsOf: url, encoding: .utf8) else {
      return "License text unavailable"
    }
    return contents
  }

  var body: some View {
    ScrollView {
      Text(text)
        .font(.system(.footnote, design: .monospaced))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .accessibilityIdentifier("dictionary-sources.license-text")
    }
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
  }
}
