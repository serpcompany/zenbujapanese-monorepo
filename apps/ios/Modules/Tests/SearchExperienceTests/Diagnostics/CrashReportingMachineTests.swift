import Testing

@testable import SearchExperience

@Suite("Crash reporting modes")
struct CrashReportingMachineTests {
  private enum Launch: CaseIterable { case reportsOn, reportsOffWithWaitingReport, reportsOff }
  private enum Step: CaseIterable { case turnOn, turnOff, send, flushed }
  private enum Running { case reporting, sendingOnly }

  private struct World {
    var machine = CrashReportingMachine()
    var switchOn = false
    var running: Running?
    var flushing = 0
    var sends = 0
    var captures = 0
    var problems: [String] = []

    mutating func apply(_ actions: [CrashReportingMachine.Action]) {
      for action in actions {
        switch action {
        case .startReporting:
          if running != nil { problems.append("started while running") }
          if !switchOn { problems.append("caught crashes with reports off") }
          running = .reporting
        case .startSendingOnly:
          if running != nil { problems.append("started while running") }
          running = .sendingOnly
        case .capture:
          if running == nil { problems.append("captured with Sentry closed") }
          captures += 1
        case .flush:
          if running != .sendingOnly { problems.append("flushed outside a send") }
          flushing += 1
        case .close:
          if running == nil { problems.append("closed twice") }
          if flushing > 0 { problems.append("closed during a flush") }
          running = nil
        case .deleteCrashReports:
          if running == .reporting { problems.append("deleted reports while reporting") }
        }
      }
      if running == .reporting, !switchOn { problems.append("reporting with reports off") }
    }

    mutating func launch(_ launch: Launch) {
      switch launch {
      case .reportsOn:
        switchOn = true
        apply(machine.turnOn())
      case .reportsOffWithWaitingReport:
        apply(machine.drain())
      case .reportsOff:
        break
      }
    }

    mutating func take(_ step: Step) -> Bool {
      switch step {
      case .turnOn:
        switchOn = true
        apply(machine.turnOn())
      case .turnOff:
        switchOn = false
        apply(machine.turnOff())
      case .send:
        sends += 1
        apply(machine.send())
      case .flushed:
        guard flushing > 0 else { return false }
        flushing -= 1
        apply(machine.flushed())
      }
      return true
    }

    mutating func finishFlushes() {
      while flushing > 0 {
        flushing -= 1
        apply(machine.flushed())
      }
    }
  }

  private static func orders(upTo length: Int) -> [[Step]] {
    (1...length).reduce(into: [[Step]()]) { all, size in
      all += all.filter { $0.count == size - 1 }.flatMap { order in
        Step.allCases.map { order + [$0] }
      }
    }
  }

  @Test("every order of sends, flushes, and switch changes ends in the switch's mode, safely")
  func everyOrderIsSafe() {
    var checked = 0
    for launch in Launch.allCases {
      for order in Self.orders(upTo: 6) {
        var world = World()
        world.launch(launch)
        guard order.allSatisfy({ world.take($0) }) else { continue }
        world.finishFlushes()
        checked += 1
        let expected: Running? = world.switchOn ? .reporting : nil
        #expect(world.problems.isEmpty, "\(launch) \(order): \(world.problems)")
        #expect(world.running == expected, "\(launch) \(order)")
        #expect(world.captures == world.sends, "\(launch) \(order)")
        #expect(world.machine.inFlight == 0, "\(launch) \(order)")
        #expect(!world.machine.startsWhenSent, "\(launch) \(order)")
      }
    }
    #expect(checked > 1_000)
  }

  @Test("with reports on, a report is captured with them and nothing restarts")
  func sendWhileReporting() {
    var machine = CrashReportingMachine()
    #expect(machine.turnOn() == [.startReporting])
    #expect(machine.send() == [.capture])
    #expect(machine.mode == .reporting)
  }

  @Test("with reports off, Sentry starts just to send a report and closes once it's flushed")
  func sendWhileOff() {
    var machine = CrashReportingMachine()
    #expect(machine.send() == [.startSendingOnly, .capture, .flush])
    #expect(machine.send() == [.capture, .flush])
    #expect(machine.flushed().isEmpty)
    #expect(machine.flushed() == [.close])
    #expect(machine.mode == .off)
  }

  @Test("turning reports on during a send starts them once the send is done")
  func turnOnDuringASend() {
    var machine = CrashReportingMachine()
    _ = machine.send()
    #expect(machine.turnOn().isEmpty)
    #expect(machine.mode == .sendingOnly)
    #expect(machine.flushed() == [.close, .startReporting])
    #expect(machine.mode == .reporting)
  }

  @Test("turning them off again before the send is done leaves them off")
  func turnOnThenOffDuringASend() {
    var machine = CrashReportingMachine()
    _ = machine.send()
    _ = machine.turnOn()
    #expect(machine.turnOff() == [.deleteCrashReports])
    #expect(machine.flushed() == [.close])
    #expect(machine.mode == .off)
  }

  @Test("a report still waiting at a launch with reports off is sent, then Sentry closes")
  func drainAtLaunch() {
    var machine = CrashReportingMachine()
    #expect(machine.drain() == [.startSendingOnly, .flush])
    #expect(machine.drain().isEmpty)
    #expect(machine.flushed() == [.close])
  }

  @Test("turning reports off closes Sentry and deletes the crash reports it kept")
  func turnOff() {
    var machine = CrashReportingMachine()
    _ = machine.turnOn()
    #expect(machine.turnOff() == [.close, .deleteCrashReports])
    #expect(machine.turnOff() == [.deleteCrashReports])
    #expect(machine.flushed().isEmpty)
  }
}
