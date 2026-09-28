import SwiftUI

/// Word Detail → ••• → Add to List…: every list, with a checkmark on the ones holding the word.
/// Tapping a list adds or removes the word at once.
struct WordListPickerView: View {
  @Environment(WordLists.self) private var wordLists
  @Environment(\.dismiss) private var dismiss
  @State private var namePrompt: WordListNamePrompt?
  let entry: DictionaryEntry

  var body: some View {
    NavigationStack {
      Group {
        if !wordLists.isLoaded {
          ProgressView("Loading Lists")
            .accessibilityIdentifier("word-list-picker.loading")
        } else {
          List {
            Section {
              ForEach(wordLists.lists) { list in
                let isMember = wordLists.contains(entry.id, in: list.id)
                Button {
                  wordLists.toggle(entry, in: list.id)
                } label: {
                  HStack {
                    Text(list.name)
                    Spacer()
                    if isMember {
                      Image(systemName: "checkmark")
                        .fontWeight(.semibold)
                        .foregroundStyle(.tint)
                    }
                  }
                  .contentShape(Rectangle())
                }
                .foregroundStyle(.primary)
                .disabled(wordLists.isReadOnly)
                .accessibilityValue(isMember ? Text("In list") : Text("Not in list"))
                .accessibilityAddTraits(isMember ? .isSelected : [])
                .accessibilityIdentifier("word-list-picker.list.\(list.id)")
              }
            } footer: {
              if let message = wordLists.readOnlyMessage {
                Text(message)
                  .accessibilityIdentifier("word-list-picker.read-only")
              }
            }

            Section {
              Button("New List", systemImage: "plus") {
                namePrompt = .create
              }
              .disabled(wordLists.isReadOnly)
              .accessibilityIdentifier("word-list-picker.new-list")
            }
          }
        }
      }
      .navigationTitle("Add to List")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { dismiss() }
            .accessibilityIdentifier("word-list-picker.done")
        }
      }
      .wordListNamePrompt($namePrompt) { name in
        if let list = wordLists.createList(named: name) {
          wordLists.addWord(
            entry.id, headword: entry.headword, reading: entry.reading, to: list.id)
        }
      }
    }
    .presentationDetents([.medium, .large])
    .accessibilityIdentifier("word-list-picker.screen")
  }
}

/// Account → Lists: every list in the learner's order, with its word count.
struct WordListsView: View {
  @Environment(WordLists.self) private var wordLists
  @State private var namePrompt: WordListNamePrompt?
  @State private var pendingDeletion: WordList?

  var body: some View {
    content
      .navigationTitle("Lists")
      .toolbar {
        if wordLists.canChange {
          ToolbarItemGroup(placement: .topBarTrailing) {
            if !wordLists.lists.isEmpty {
              EditButton()
                .accessibilityIdentifier("word-lists.edit")
            }
            Button("New List", systemImage: "plus") { namePrompt = .create }
              .accessibilityIdentifier("word-lists.new-list")
          }
        }
      }
      .wordListNamePrompt($namePrompt) { name in
        wordLists.createList(named: name)
      }
      .confirmationDialog(
        deletionTitle,
        isPresented: Binding(
          get: { pendingDeletion != nil },
          set: { if !$0 { pendingDeletion = nil } }
        ),
        titleVisibility: .visible,
        presenting: pendingDeletion
      ) { list in
        Button("Delete List", role: .destructive) {
          wordLists.deleteList(list.id)
        }
        .accessibilityIdentifier("word-lists.confirm-delete")
      } message: { list in
        let count = wordLists.wordCount(in: list.id)
        Text("^[\(count) word](inflect: true) will be removed with this list.")
      }
  }

  @ViewBuilder
  private var content: some View {
    if !wordLists.isLoaded {
      ProgressView("Loading Lists")
        .accessibilityIdentifier("word-lists.loading")
    } else if wordLists.lists.isEmpty {
      ContentUnavailableView {
        Label("No Lists", systemImage: "list.bullet.rectangle")
      } description: {
        Text(wordLists.readOnlyMessage ?? "Create a list to save words you want to come back to.")
      } actions: {
        if !wordLists.isReadOnly {
          Button("New List") { namePrompt = .create }
            .accessibilityIdentifier("word-lists.empty.new-list")
        }
      }
      .accessibilityIdentifier("word-lists.empty")
    } else {
      List {
        Section {
          ForEach(wordLists.lists) { list in
            row(list)
          }
          .onMove(perform: moveLists)
        } footer: {
          if let message = wordLists.readOnlyMessage {
            Text(message)
              .accessibilityIdentifier("word-lists.read-only")
          }
        }
      }
      .accessibilityIdentifier("word-lists.list")
    }
  }

  private func row(_ list: WordList) -> some View {
    WordListIndexRow(list: list, count: wordLists.wordCount(in: list.id)) {
      namePrompt = .rename(list)
    }
    .accessibilityIdentifier("word-lists.list.\(list.id)")
    // No full swipe, so a list is never deleted by swiping too far.
    .swipeActions(allowsFullSwipe: false) {
      if !wordLists.isReadOnly {
        // Not a destructive role, so the row stays while deletion is confirmed.
        Button("Delete", systemImage: "trash") {
          if wordLists.wordCount(in: list.id) == 0 {
            wordLists.deleteList(list.id)
          } else {
            pendingDeletion = list
          }
        }
        .tint(.red)
        .accessibilityIdentifier("word-lists.delete.\(list.id)")
        Button("Rename", systemImage: "pencil") {
          namePrompt = .rename(list)
        }
        .tint(.blue)
        .accessibilityIdentifier("word-lists.rename.\(list.id)")
      }
    }
  }

  private var moveLists: ((IndexSet, Int) -> Void)? {
    guard !wordLists.isReadOnly else { return nil }
    return { wordLists.moveLists(fromOffsets: $0, toOffset: $1) }
  }

  private var deletionTitle: Text {
    Text("Delete “\(pendingDeletion?.name ?? "")”?")
  }
}

/// A list in Account → Lists. It opens the list, or while editing, renames it.
private struct WordListIndexRow: View {
  @Environment(\.editMode) private var editMode
  let list: WordList
  let count: Int
  let rename: () -> Void

  var body: some View {
    if editMode?.wrappedValue.isEditing == true {
      Button(action: rename) {
        label
      }
      .foregroundStyle(.primary)
      .accessibilityHint("Renames the list")
    } else {
      NavigationLink(value: AccountRoute.wordList(list.id)) {
        label
      }
    }
  }

  private var label: some View {
    LabeledContent {
      Text(count, format: .number)
    } label: {
      Text(list.name)
    }
  }
}

/// One list's words, most recently added first, with a menu to rename or delete the list and
/// to select words to remove.
struct WordListView: View {
  @Environment(WordLists.self) private var wordLists
  @Environment(WordKnowledge.self) private var wordKnowledge
  @Environment(\.dismiss) private var dismiss
  @State private var searchText = ""
  @State private var editMode = EditMode.inactive
  @State private var selection = Set<String>()
  @State private var namePrompt: WordListNamePrompt?
  @State private var confirmsDeletion = false
  let listID: UUID
  let openWord: (WordListMembership) -> Void

  private var list: WordList? { wordLists.lists.first { $0.id == listID } }
  private var isSelecting: Bool { editMode.isEditing }

  var body: some View {
    content
      .navigationTitle(list?.name ?? "")
      .toolbar { toolbar }
      // Select All takes the back button's place while selecting.
      .navigationBarBackButtonHidden(isSelecting)
      .environment(\.editMode, $editMode)
      .onChange(of: isSelecting) {
        if !isSelecting { selection = [] }
      }
      .wordListNamePrompt($namePrompt) { _ in }
      .confirmationDialog(
        Text("Delete “\(list?.name ?? "")”?"),
        isPresented: $confirmsDeletion,
        titleVisibility: .visible
      ) {
        Button("Delete List", role: .destructive, action: deleteList)
          .accessibilityIdentifier("word-list.confirm-delete")
      } message: {
        let count = wordLists.wordCount(in: listID)
        Text("^[\(count) word](inflect: true) will be removed with this list.")
      }
  }

  @ViewBuilder
  private var content: some View {
    let words = filteredWords
    if !wordLists.isLoaded {
      ProgressView("Loading List")
        .accessibilityIdentifier("word-list.loading")
    } else if wordLists.wordCount(in: listID) == 0 {
      ContentUnavailableView(
        "No Words",
        systemImage: "list.bullet.rectangle",
        description: Text("Add words from the ••• menu on a word’s page.")
      )
      .accessibilityIdentifier("word-list.empty")
    } else {
      List(selection: $selection) {
        ForEach(words) { word in
          row(word)
        }
      }
      .overlay {
        if words.isEmpty {
          ContentUnavailableView.search(text: searchText)
        }
      }
      .searchable(text: $searchText, prompt: "Search this list")
      .accessibilityIdentifier("word-list.list")
    }
  }

  @ViewBuilder
  private func row(_ word: WordListMembership) -> some View {
    let label = SavedWordRow(
      headword: word.headword, reading: word.reading, date: word.addedAt,
      isKnown: wordKnowledge.isKnown(word.languageReferenceID))
    Group {
      if isSelecting {
        // While selecting, a tap selects the row instead of opening the word.
        label
      } else {
        Button {
          openWord(word)
        } label: {
          label
        }
        .foregroundStyle(.primary)
      }
    }
    .accessibilityIdentifier("word-list.item.\(word.entryID)")
    .swipeActions {
      if !wordLists.isReadOnly {
        Button("Remove", systemImage: "minus.circle", role: .destructive) {
          wordLists.removeWord(word.languageReferenceID, from: listID)
        }
        .accessibilityIdentifier("word-list.remove.\(word.entryID)")
      }
    }
  }

  @ToolbarContentBuilder
  private var toolbar: some ToolbarContent {
    if isSelecting {
      ToolbarItem(placement: .topBarLeading) {
        let allSelected = !filteredWords.isEmpty && selectedWords.count == filteredWords.count
        Button(allSelected ? "Deselect All" : "Select All") {
          selection = allSelected ? [] : Set(filteredWords.map(\.entryID))
        }
        .accessibilityIdentifier("word-list.select-all")
      }
      ToolbarItemGroup(placement: .topBarTrailing) {
        Button("Remove", role: .destructive, action: removeSelected)
          .disabled(selectedWords.isEmpty)
          .accessibilityIdentifier("word-list.remove-selected")
        Button("Done") { editMode = .inactive }
          .fontWeight(.semibold)
          .accessibilityIdentifier("word-list.done-selecting")
      }
    } else if wordLists.canChange, let list {
      ToolbarItem(placement: .topBarTrailing) {
        Menu {
          Button("Rename List", systemImage: "pencil") { namePrompt = .rename(list) }
            .accessibilityIdentifier("word-list.rename")
          Button("Select Words", systemImage: "checkmark.circle") {
            editMode = .active
          }
          .disabled(wordLists.wordCount(in: listID) == 0)
          .accessibilityIdentifier("word-list.select")
          Divider()
          Button("Delete List", systemImage: "trash", role: .destructive) {
            if wordLists.wordCount(in: listID) == 0 {
              deleteList()
            } else {
              confirmsDeletion = true
            }
          }
          .accessibilityIdentifier("word-list.delete")
        } label: {
          Label("More", systemImage: "ellipsis")
            .labelStyle(.iconOnly)
        }
        .accessibilityLabel("More")
        .accessibilityIdentifier("word-list.more-menu")
      }
    }
  }

  /// The selected words still shown, so a search never removes words it hides.
  private var selectedWords: [WordListMembership] {
    filteredWords.filter { selection.contains($0.entryID) }
  }

  private func removeSelected() {
    for word in selectedWords {
      wordLists.removeWord(word.languageReferenceID, from: listID)
    }
    editMode = .inactive
  }

  private func deleteList() {
    wordLists.deleteList(listID)
    dismiss()
  }

  private var filteredWords: [WordListMembership] {
    let words = wordLists.words(in: listID)
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return words }
    return words.filter {
      $0.headword.localizedStandardContains(query) || $0.reading.localizedStandardContains(query)
    }
  }
}

extension WordLists {
  var readOnlyMessage: LocalizedStringKey? {
    switch readOnlyReason {
    case .newerVersion:
      "Lists can’t be changed because they were saved by a newer version of Zenbu."
    case .couldNotKeepCopy:
      "Lists can’t be saved right now. Free up storage and reopen Zenbu."
    case nil:
      nil
    }
  }
}

/// Asking for a list's name, to create a list or rename one.
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
  /// Shows an alert asking for a list name. `create` runs for a new list; a rename is saved to
  /// the list directly.
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
