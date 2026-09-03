import SwiftUI

struct DictionarySourcesView: View {
  var body: some View {
    List {
      Section("Zenbu Japanese") {
        Text(
          "Searches, notes, and Encounter Media stay on this device. Image Text processing stays on device. When you open a recognized word, Zenbu saves that source image with the word. You can review saved images in Media Library, remove one association from Word Detail, or delete an image from the library."
        )
        Link("Privacy Policy", destination: URL(string: "https://zenbujapanese.com/privacy")!)
          .accessibilityIdentifier("settings.privacy-policy")
        Link("Support", destination: URL(string: "https://zenbujapanese.com/support")!)
          .accessibilityIdentifier("settings.support")
      }

      Section("JMdict") {
        Text("Dictionary data from the Electronic Dictionary Research and Development Group.")
        LabeledContent("License", value: "CC BY-SA 4.0")
        LabeledContent("Snapshot", value: "2026-08-10")
        Link(
          "Project documentation",
          destination: URL(string: "https://www.edrdg.org/jmdict/j_jmdict.html")!
        )
        .accessibilityIdentifier("dictionary-sources.jmdict-project")
        Link(
          "License terms", destination: URL(string: "https://www.edrdg.org/edrdg/licence.html")!
        )
      }

      Section("KANJIDIC2") {
        Text(
          "Kanji classifications, meanings, and Japanese readings from the Electronic Dictionary Research and Development Group."
        )
        LabeledContent("License", value: "CC BY-SA 4.0")
        LabeledContent("Snapshot", value: "2026-08-10")
        Link(
          "Project documentation",
          destination: URL(string: "https://www.edrdg.org/wiki/index.php/KANJIDIC_Project")!)
        Link(
          "License terms", destination: URL(string: "https://www.edrdg.org/edrdg/licence.html")!
        )
      }

      Section("KRADFILE / RADKFILE") {
        Text(
          "Visible kanji-component data from the Electronic Dictionary Research and Development Group."
        )
        LabeledContent("License", value: "CC BY-SA 4.0")
        LabeledContent("Snapshot", value: "2026-08-10")
        Link(
          "Project documentation",
          destination: URL(string: "https://www.edrdg.org/krad/kradinf.html")!)
        Link(
          "License terms", destination: URL(string: "https://www.edrdg.org/edrdg/licence.html")!
        )
      }

      Section("KanjiVG") {
        Text(
          "Ordered kanji stroke geometry from KanjiVG by Ulrich Apel, transformed into Zenbu's app-owned drawing format."
        )
        LabeledContent("License", value: "CC BY-SA 3.0")
        LabeledContent("Release", value: "r20250816")
        NavigationLink("Bundled license text") {
          BundledLicenseTextView(
            title: "KanjiVG CC BY-SA 3.0 License",
            resource: "KANJIVG-CC-BY-SA-3.0"
          )
        }
        .accessibilityIdentifier("dictionary-sources.kanjivg-license")
        Link("Project documentation", destination: URL(string: "https://kanjivg.tagaini.net/")!)
        Link(
          "License terms",
          destination: URL(string: "https://creativecommons.org/licenses/by-sa/3.0/")!)
      }

      Section("Kanjium") {
        Text(
          "Kanji element structures and variants from Kanjium, including additions and modifications by Uros O. and EDRDG-derived fields."
        )
        LabeledContent("License", value: "CC BY-SA 4.0")
        LabeledContent("Snapshot", value: "8a0cdaa")
        Link(
          "Project and attribution",
          destination: URL(string: "https://github.com/mifunetoshiro/kanjium")!)
        Link(
          "License terms",
          destination: URL(string: "https://creativecommons.org/licenses/by-sa/4.0/")!)
      }

      Section("UniDic") {
        Text(
          "Pitch-accent facts from UniDic for Contemporary Written Japanese 3.1.0, published by the National Institute for Japanese Language and Linguistics."
        )
        LabeledContent("License", value: "New BSD")
        LabeledContent("Version", value: "3.1.0")
        NavigationLink("Bundled license text") {
          BundledLicenseTextView(
            title: "UniDic New BSD License",
            resource: "UNIDIC-NEW-BSD"
          )
        }
        .accessibilityIdentifier("dictionary-sources.unidic-license")
        Link(
          "Project documentation",
          destination: URL(string: "https://clrd.ninjal.ac.jp/unidic_archive/cwj/3.1.0/")!)
        Link(
          "License terms",
          destination: URL(
            string: "https://clrd.ninjal.ac.jp/unidic_archive/cwj/back_number_en.html")!)
      }

      Section("TUBELEX YouTube Japanese Frequency") {
        Text(
          "The included active-by-default frequency pack measures Japanese lemmas in YouTube subtitles across everyday media categories. Its ranks describe this media corpus, not universal Japanese frequency."
        )
        LabeledContent("License", value: "BSD-3-Clause")
        LabeledContent("Version", value: "2025.1 · UniDic 3.1")
        LabeledContent("Snapshot", value: "7cb5fb36")
        NavigationLink("Bundled license text") {
          BundledLicenseTextView(
            title: "TUBELEX BSD-3-Clause License",
            resource: "TUBELEX-BSD-3-CLAUSE"
          )
        }
        .accessibilityIdentifier("dictionary-sources.tubelex-license")
        Link(
          "Project and frequency lists",
          destination: URL(
            string:
              "https://github.com/naist-nlp/tubelex/tree/7cb5fb36add76b83a266d1967536e1a1d3faa513")!
        )
      }

      Section("Japanese Wikipedia Frequency") {
        Text(
          "The optional downloadable pack measures written Japanese in the 2022-10-20 Japanese Wikipedia dump using UniDic 3.1 and NFKC normalization."
        )
        LabeledContent("License", value: "BSD-3-Clause")
        LabeledContent("Version", value: "2022-10-20 · UniDic 3.1")
        LabeledContent("Snapshot", value: "8b7a2811")
        NavigationLink("Bundled license text") {
          BundledLicenseTextView(
            title: "Wikipedia Frequency BSD-3-Clause License",
            resource: "WIKIPEDIA-FREQUENCY-BSD-3-CLAUSE"
          )
        }
        .accessibilityIdentifier("dictionary-sources.wikipedia-frequency-license")
        Link(
          "Project and frequency lists",
          destination: URL(
            string:
              "https://github.com/adno/wikipedia-word-frequency-clean/tree/8b7a28118736ef4bc9b70ebb4abc33d32b53200c"
          )!
        )
      }

      Section("Japanese Word Analysis") {
        Text(
          "Optional on-device Japanese word boundaries, dictionary forms, readings, and parts of speech from Sudachi.rs and SudachiDict Core. ZIPFoundation reads the checksum-pinned official dictionary wheel during installation."
        )
        LabeledContent("Engine", value: "sudachi.rs 0.6.11")
        LabeledContent("Binding", value: "sudachi-swift 0.1.1")
        LabeledContent("Dictionary", value: "SudachiDict Core 20260723")
        LabeledContent("Archive reader", value: "ZIPFoundation 0.9.20")
        LabeledContent("License", value: "Apache-2.0 · BSD-3-Clause · MIT")
        NavigationLink("Bundled license and attribution text") {
          BundledLicenseTextView(
            title: "Japanese Analysis Notices",
            resource: "SudachiLanguageTechnologyNotices"
          )
        }
        .accessibilityIdentifier("dictionary-sources.japanese-analysis-license")
        Link(
          "SudachiDict release",
          destination: URL(
            string: "https://github.com/WorksApplications/SudachiDict/releases/tag/v20260723")!
        )
      }

      Section("Tatoeba") {
        Text(
          "Offline Japanese–English example sentences from Tatoeba's official weekly export. Zenbu retains both sentence IDs, supplied contributor usernames, per-record license class, and the exact source snapshot."
        )
        LabeledContent("License", value: "CC BY 2.0 FR")
        LabeledContent("Snapshot", value: "2026-08-08")
        NavigationLink("Contributor credits") {
          TatoebaContributorCreditsView()
        }
        .accessibilityIdentifier("dictionary-sources.tatoeba-contributors")
        NavigationLink("Bundled attribution notice") {
          BundledLicenseTextView(
            title: "Tatoeba Attribution Notice",
            resource: "TATOEBA-NOTICE"
          )
        }
        .accessibilityIdentifier("dictionary-sources.tatoeba-notice")
        Link(
          "Project and downloads", destination: URL(string: "https://tatoeba.org/en/downloads")!
        )
        Link(
          "License terms",
          destination: URL(string: "https://creativecommons.org/licenses/by/2.0/fr/")!)
      }

      Section("DaKanji handwriting recognition") {
        Text(
          "Offline single-character handwriting recognition by Dario Radmann and DaKanji contributors, converted to Core ML by Zenbu Japanese."
        )
        LabeledContent("License", value: "MIT")
        LabeledContent("Model", value: "Single Kanji Recognition v1.2")
        NavigationLink("Bundled license text") {
          BundledLicenseTextView(
            title: "DaKanji MIT License",
            resource: "DAKANJI-MIT"
          )
        }
        .accessibilityIdentifier("dictionary-sources.dakanji-license")
        Link(
          "Project and model source",
          destination: URL(
            string: "https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition")!)
      }

      Section("Zenbu transforms") {
        Text(
          "Zenbu retains each JMdict ent_seq source identifier and normalizes written forms, readings, English glosses, priority markers, and searchable romaji behind app-owned Language Reference Data. KANJIDIC2 classifications, English meanings, and Japanese readings are combined with KRADFILE visible-component membership behind a focused app-owned Kanji Reference capability. Kanjium structures and variants are normalized to top-level elements and combined with app-owned KANJIDIC reading summaries; no provider schema or proprietary etymology explanation reaches the product experience. KanjiVG paths are filtered to ideographs, normalized from SVG commands to absolute cubic geometry, and packaged in an app-owned ordered-stroke schema for Zenbu's renderer. Exact UniDic base-form and reading matches add app-owned pitch downstep facts. Tatoeba translation links become offline app-owned example pairs. Radical Search verifies KRADFILE membership against RADKFILE's stroke counts and inverted membership."
        )
      }
    }
    .accessibilityIdentifier("dictionary-sources.list")
    .headerProminence(.increased)
    .navigationTitle("Dictionary Sources")
    .navigationBarTitleDisplayMode(.inline)
  }
}

private struct TatoebaContributorCreditsView: View {
  @State private var credits: [TatoebaContributorCredit] = []

  var body: some View {
    List {
      Section {
        Text(
          "Named contributors supplied by Tatoeba's detailed 2026-08-08 exports. Each shipped pair also retains both Tatoeba record IDs. Records for which the official export supplies no username are marked not-supplied and attributed to Tatoeba contributors; Zenbu does not invent an author identity."
        )
      }
      Section("Named contributors (\(credits.count))") {
        ForEach(credits) { credit in
          LabeledContent(credit.username, value: "\(credit.sentenceSideCount)")
        }
      }
    }
    .navigationTitle("Tatoeba Contributors")
    .navigationBarTitleDisplayMode(.inline)
    .task {
      guard credits.isEmpty else { return }
      credits = TatoebaAttributionClient.contributorCredits()
    }
  }
}

private struct BundledLicenseTextView: View {
  let title: String
  let resource: String

  private var text: String {
    guard let url = Bundle.module.url(forResource: resource, withExtension: "txt"),
      let contents = try? String(contentsOf: url, encoding: .utf8)
    else {
      return "License text unavailable"
    }
    return contents
  }

  var body: some View {
    List {
      Section {
        Text(text)
          .font(.system(.footnote, design: .monospaced))
          .accessibilityIdentifier("dictionary-sources.license-text")
      }
    }
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
  }
}
