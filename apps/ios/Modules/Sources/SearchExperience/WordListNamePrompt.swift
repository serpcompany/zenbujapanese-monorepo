import SwiftUI

enum WordListNamePrompt: Identifiable {
  case create
  case rename(WordList)

  var id: String {
    switch self {
    case .create: "create"
    case .rename(let list): "rename-\(list.id)"
    }
  }
}

extension View {
  func wordListNamePrompt(
    _ prompt: Binding<WordListNamePrompt?>, create: @escaping (String) -> Void
  ) -> some View {
    modifier(WordListNamePromptModifier(prompt: prompt, create: create))
  }
}

private struct WordListNamePromptModifier: ViewModifier {
  @Environment(WordLists.self) private var wordLists
  @Binding var prompt: WordListNamePrompt?
  @State private var name = ""
  let create: (String) -> Void

  func body(content: Content) -> some View {
    content
      .alert(
        title,
        isPresented: Binding(get: { prompt != nil }, set: { if !$0 { prompt = nil } }),
        presenting: prompt
      ) { prompt in
        TextField("Name", text: $name)
          .accessibilityIdentifier("word-list-name.field")
        Button("Cancel", role: .cancel) {}
        Button(prompt.isRename ? "Save" : "Create") {
          switch prompt {
          case .create: create(name)
          case .rename(let list): wordLists.renameList(list.id, to: name)
          }
        }
        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .accessibilityIdentifier("word-list-name.save")
      }
      .onChange(of: prompt?.id) {
        if case .rename(let list) = prompt { name = list.name } else { name = "" }
      }
  }

  private var title: LocalizedStringKey {
    prompt?.isRename == true ? "Rename List" : "New List"
  }
}

extension WordListNamePrompt {
  fileprivate var isRename: Bool {
    if case .rename = self { true } else { false }
  }
}
