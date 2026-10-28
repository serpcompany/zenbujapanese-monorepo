import SwiftUI

enum DailyGoalPreset: Int, CaseIterable, Identifiable {
  case light = 5
  case steady = 10
  case focused = 20
  case intense = 30

  var id: Int { rawValue }

  var name: String {
    switch self {
    case .light: "Light"
    case .steady: "Steady"
    case .focused: "Focused"
    case .intense: "Intense"
    }
  }
}

struct DailyGoalSheet: View {
  @Environment(\.dismiss) private var dismiss
  @State private var goal: Int
  @State private var isCustom: Bool
  let save: (Int) -> Void

  init(goal: Int, save: @escaping (Int) -> Void) {
    _goal = State(initialValue: goal)
    _isCustom = State(initialValue: DailyGoalPreset(rawValue: goal) == nil)
    self.save = save
  }

  var body: some View {
    NavigationStack {
      Form {
        Section("New Words Each Day") {
          ForEach(DailyGoalPreset.allCases) { preset in
            choice(
              "\(preset.rawValue) words · \(preset.name)",
              detail: "about \(ProgressWording.perMonth(preset.rawValue).formatted()) a month",
              isChosen: !isCustom && goal == preset.rawValue, identifier: "\(preset.rawValue)"
            ) {
              goal = preset.rawValue
              isCustom = false
            }
          }
          choice("Custom", detail: "pick any number", isChosen: isCustom, identifier: "custom") {
            isCustom = true
          }
          if isCustom {
            Stepper(value: $goal, in: DailyGoal.range) {
              Text(ProgressWording.newWords(goal) + " a day")
                .accessibilityIdentifier("daily-goal.custom-goal")
            }
          }
        }
        DailyGoalPace(goal: goal)
      }
      .formStyle(.grouped)
      .navigationTitle("Daily Goal")
      .inlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", action: dismiss.callAsFunction)
            .accessibilityIdentifier("daily-goal.cancel")
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") {
            save(goal)
            dismiss()
          }
          .accessibilityIdentifier("daily-goal.done")
        }
      }
    }
    .sheetSize(onMac: AppWindow.sheetSize)
    .accessibilityIdentifier("daily-goal.sheet")
  }

  private func choice(
    _ title: String, detail: String, isChosen: Bool, identifier: String, choose: @escaping () -> Void
  ) -> some View {
    Button(action: choose) {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(title)
          Text(detail)
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        Spacer()
        if isChosen {
          Image(systemName: "checkmark")
            .fontWeight(.semibold)
            .foregroundStyle(.tint)
        }
      }
      .contentShape(.rect)
    }
    .foregroundStyle(.primary)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(isChosen ? .isSelected : [])
    .accessibilityIdentifier("daily-goal.choice.\(identifier)")
  }
}

private struct DailyGoalPace: View {
  @State private var model: JLPTCoverageModel?
  let goal: Int

  private var levels: [JLPTCoverage.Level] {
    (model?.coverage?.levels ?? []).filter { (3...5).contains($0.level) }.sorted { $0.level > $1.level }
  }

  var body: some View {
    Section {
      Text("At \(goal) a day")
        .font(.headline)
        .followsJLPTCoverage(goal: goal, into: $model)
      LabeledContent("New words a month", value: "≈ \(ProgressWording.perMonth(goal).formatted())")
        .accessibilityIdentifier("daily-goal.month")
      ForEach(levels) { level in
        LabeledContent("All \(level.name) in Learning", value: ProgressWording.paceDate(level.pace))
          .accessibilityIdentifier("daily-goal.pace.n\(level.level)")
      }
    } footer: {
      Text("Dates are when every word of the level is in Learning, from what you know today.")
    }
  }
}

private struct JLPTCoverageFollower: ViewModifier {
  @Environment(WordKnowledge.self) private var knowledge
  @Binding var model: JLPTCoverageModel?
  let goal: Int

  func body(content: Content) -> some View {
    content
      .task {
        let model = JLPTCoverageModel(knowledge: knowledge, goal: goal)
        self.model = model
        await model.follow()
      }
      .onChange(of: goal) { model?.goal = goal }
  }
}

extension View {
  func followsJLPTCoverage(goal: Int, into model: Binding<JLPTCoverageModel?>) -> some View {
    modifier(JLPTCoverageFollower(model: model, goal: goal))
  }
}
