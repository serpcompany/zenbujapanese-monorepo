import Foundation
import Observation

@MainActor
@Observable
final class FrequencyPackDownloads {
  typealias Operation = @MainActor (@escaping FrequencyPackManager.Progress) async throws -> Void

  static let shared = FrequencyPackDownloads()

  private(set) var fractions: [FrequencyPackID: Double] = [:]
  @ObservationIgnored private var tasks: [FrequencyPackID: (id: UUID, task: Task<Void, Never>)] = [:]

  func fraction(for packID: FrequencyPackID) -> Double? {
    fractions[packID]
  }

  func start(_ packID: FrequencyPackID, operation: @escaping Operation) {
    guard fractions[packID] == nil else { return }
    let id = UUID()
    fractions[packID] = 0
    let task = Task {
      try? await operation { fraction in
        Task { @MainActor in
          if self.tasks[packID]?.id == id { self.report(fraction, for: packID) }
        }
      }
      if tasks[packID]?.id == id { clear(packID) }
    }
    tasks[packID] = (id, task)
  }

  func stop(_ packID: FrequencyPackID) {
    guard let fraction = fractions[packID], fraction < 1 else { return }
    tasks[packID]?.task.cancel()
    clear(packID)
  }

  func report(_ fraction: Double, for packID: FrequencyPackID) {
    guard let current = fractions[packID] else { return }
    fractions[packID] = max(current, min(fraction, 1))
  }

  private func clear(_ packID: FrequencyPackID) {
    fractions[packID] = nil
    tasks[packID] = nil
  }
}
