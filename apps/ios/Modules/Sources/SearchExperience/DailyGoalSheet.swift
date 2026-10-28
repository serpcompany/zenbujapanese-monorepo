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
        Section {
          Text("At \(goal) a day")
            .font(.headline)
          LabeledContent("New words a month", value: "≈ \(ProgressWording.perMonth(goal).formatted())")
            .accessibilityIdentifier("daily-goal.month")
        }
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
