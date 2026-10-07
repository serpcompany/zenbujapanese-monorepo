import SwiftUI

struct CreditsView: View {
  var body: some View {
    List {
      Section {
        Text(
          "Zenbu Japanese is built on these open sources. Zenbu converts each one into its own formats and shares converted Creative Commons data under the same license."
        )
      }

      Section("JMdict, KANJIDIC2 & RADKFILE") {
        Text("Dictionary, kanji, and radical data by the Electronic Dictionary Research and Development Group.")
        LabeledContent("License", value: "CC BY-SA 4.0")
        Link(
          "JMdict",
          destination: URL(
            string: "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project")!)
        Link(
          "KANJIDIC2", destination: URL(string: "https://www.edrdg.org/wiki/index.php/KANJIDIC_Project")!)
        Link("RADKFILE", destination: URL(string: "https://www.edrdg.org/krad/kradinf.html")!)
      }
      source(
        "KanjiVG", credit: "Kanji stroke data by Ulrich Apel.",
        license: "CC BY-SA 3.0", project: "https://kanjivg.tagaini.net/")
      source(
        "Kanjium", credit: "Kanji structure data by Uros O.",
        license: "CC BY-SA 4.0", project: "https://github.com/mifunetoshiro/kanjium")
      source(
        "UniDic",
        credit: "Pitch-accent data by the National Institute for Japanese Language and Linguistics.",
        license: "BSD", project: "https://clrd.ninjal.ac.jp/unidic/")
      source(
        "JLPT Levels",
        credit: "Unofficial level estimates from Jonathan Waller's lists, matched to JMdict by stephenmk.",
        license: "CC BY-SA 4.0", project: "https://github.com/stephenmk/yomitan-jlpt-vocab")
      source(
        "JLPT Kanji Levels",
        credit: "Unofficial level estimates from Jonathan Waller's JLPT kanji lists (tanos.co.uk).",
        license: "CC BY",
        project: "https://web.archive.org/web/20200806005029/http://www.tanos.co.uk/jlpt/jlpt5/kanji/")
      source(
        "TUBELEX", credit: "YouTube frequency data by Adam Nohejl and contributors.",
        license: "BSD-3-Clause", project: "https://github.com/naist-nlp/tubelex")
      source(
        "Japanese Wikipedia Frequency",
        credit: "Wikipedia frequency data by Adam Nohejl and contributors.",
        license: "BSD-3-Clause",
        project: "https://github.com/adno/wikipedia-word-frequency-clean")
      source(
        "Jiten",
        credit:
          "TV & Movies, Anime, Manga, Novels, Visual Novels, and Video Games frequency data by Jiten (jiten.moe).",
        license: "CC BY-SA 4.0", project: "https://jiten.moe/frequency-dictionaries")
      source(
        "Sudachi", credit: "Japanese word analysis for Search by Sudachi.rs and SudachiDict.",
        license: "Apache-2.0 · BSD-3-Clause · MIT",
        project: "https://github.com/WorksApplications/SudachiDict")
      source(
        "Kuromoji", credit: "Interactive text parsing by kuromoji.js with MeCab IPADIC.",
        license: "Apache-2.0 · IPADIC", project: "https://github.com/takuyaa/kuromoji.js")
      source(
        "Tatoeba", credit: "Example sentences by Tatoeba contributors.",
        license: "CC BY 2.0 FR", project: "https://tatoeba.org/")
      source(
        "DaKanji", credit: "Handwriting recognition by Dario Radmann and contributors.",
        license: "MIT", project: "https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition")

      Section {
        NavigationLink("Licenses") {
          LicensesView()
        }
        .accessibilityIdentifier("credits.licenses")
      }
    }
    .accessibilityIdentifier("credits.list")
    .headerProminence(.increased)
    .navigationTitle("Credits & Attributions")
    .navigationBarTitleDisplayMode(.inline)
  }

  private func source(_ name: String, credit: String, license: String, project: String)
    -> some View
  {
    Section(name) {
      Text(credit)
      LabeledContent("License", value: license)
      Link("Project", destination: URL(string: project)!)
    }
  }
}

private struct LicensesView: View {
  var body: some View {
    List {
      Section("License Texts") {
        licenseText("KanjiVG", resource: "KANJIVG-CC-BY-SA-3.0")
        licenseText("UniDic", resource: "UNIDIC-NEW-BSD")
        licenseText("JLPT Levels", resource: "JLPT-VOCABULARY-CC-BY-SA-4.0")
        licenseText("TUBELEX", resource: "TUBELEX-BSD-3-CLAUSE")
        licenseText("Japanese Wikipedia Frequency", resource: "WIKIPEDIA-FREQUENCY-BSD-3-CLAUSE")
        licenseText("Sudachi", resource: "SudachiLanguageTechnologyNotices")
        licenseText("Kuromoji", resource: "LICENSE-2.0", subdirectory: "Kuromoji")
        licenseText("IPADIC", resource: "NOTICE", extension: "md", subdirectory: "Kuromoji")
        licenseText("Tatoeba", resource: "TATOEBA-NOTICE")
        licenseText("DaKanji", resource: "DAKANJI-MIT")
      }

      Section("License Terms") {
        Link("EDRDG License", destination: URL(string: "https://www.edrdg.org/edrdg/licence.html")!)
        Link(
          "CC BY-SA 4.0",
          destination: URL(string: "https://creativecommons.org/licenses/by-sa/4.0/")!)
        Link(
          "CC BY 2.0 FR",
          destination: URL(string: "https://creativecommons.org/licenses/by/2.0/fr/")!)
      }

      Section {
        NavigationLink("Tatoeba Contributors") {
          TatoebaContributorCreditsView()
        }
        .accessibilityIdentifier("credits.tatoeba-contributors")
      }
    }
    .navigationTitle("Licenses")
    .navigationBarTitleDisplayMode(.inline)
  }

  private func licenseText(
    _ name: String,
    resource: String,
    extension resourceExtension: String = "txt",
    subdirectory: String? = nil
  ) -> some View {
    NavigationLink(name) {
      BundledLicenseTextView(
        title: name,
        resource: resource,
        resourceExtension: resourceExtension,
        subdirectory: subdirectory
      )
    }
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
  var resourceExtension = "txt"
  var subdirectory: String?

  private var text: String {
    let url =
      Bundle.module.url(
        forResource: resource,
        withExtension: resourceExtension,
        subdirectory: subdirectory
      )
      ?? Bundle.module.url(
        forResource: resource,
        withExtension: resourceExtension
      )
    guard let url,
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
          .accessibilityIdentifier("credits.license-text")
      }
    }
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
  }
}
