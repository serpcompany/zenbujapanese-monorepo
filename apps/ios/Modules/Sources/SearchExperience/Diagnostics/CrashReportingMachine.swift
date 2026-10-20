struct CrashReportingMachine: Equatable, Sendable {
  enum Mode: Equatable, Sendable { case off, reporting, sendingOnly }

  enum Action: Equatable, Sendable {
    case startReporting, startSendingOnly, capture, flush, close, deleteCrashReports
  }

  private(set) var mode = Mode.off
  private(set) var inFlight = 0
  private(set) var startsWhenSent = false

  mutating func turnOn() -> [Action] {
    switch mode {
    case .reporting:
      return []
    case .sendingOnly:
      startsWhenSent = true
      return []
    case .off:
      mode = .reporting
      return [.startReporting]
    }
  }

  mutating func turnOff() -> [Action] {
    startsWhenSent = false
    guard mode == .reporting else { return [.deleteCrashReports] }
    mode = .off
    return [.close, .deleteCrashReports]
  }

  mutating func send() -> [Action] {
    switch mode {
    case .reporting:
      return [.capture]
    case .sendingOnly:
      inFlight += 1
      return [.capture, .flush]
    case .off:
      mode = .sendingOnly
      inFlight = 1
      return [.startSendingOnly, .capture, .flush]
    }
  }

  mutating func drain() -> [Action] {
    guard mode == .off else { return [] }
    mode = .sendingOnly
    inFlight = 1
    return [.startSendingOnly, .flush]
  }

  mutating func flushed() -> [Action] {
    guard inFlight > 0 else { return [] }
    inFlight -= 1
    guard mode == .sendingOnly, inFlight == 0 else { return [] }
    guard startsWhenSent else {
      mode = .off
      return [.close]
    }
    startsWhenSent = false
    mode = .reporting
    return [.close, .startReporting]
  }
}
