import XCTest

@MainActor
final class SpikeUITests: XCTestCase {
  let host = XCUIApplication()
  let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
  let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
  let base = ProcessInfo.processInfo.environment["SPIKE_BASE"] ?? "http://localhost:47947"
  var page: URL { URL(string: "\(base)/index.html")! }

  func dump(_ app: XCUIApplication, _ label: String) {
    print("=== DUMP \(label)\n\(app.debugDescription)\n=== END \(label)")
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = label
    shot.lifetime = .keepAlways
    add(shot)
  }

  func testA_turnOn() {
    host.launch()
    host.buttons["Turn On in Safari Settings"].tap()
    sleep(3)
    dump(settings, "settings-opened")
  }

  func testC2_enableFromApp() {
    settings.terminate()
    host.launch()
    host.buttons["Turn On in Safari Settings"].tap()
    sleep(3)
    enable()
  }

  func testC_enableByHand() {
    settings.terminate()
    settings.launch()
    let apps = settings.buttons["com.apple.settings.apps"]
    var tries = 0
    while !apps.isHittable && tries < 8 { settings.swipeUp(); tries += 1 }
    apps.tap()
    sleep(1)
    let safariRow = settings.buttons["com.apple.mobilesafari"].firstMatch
    tries = 0
    while !safariRow.isHittable && tries < 10 { settings.swipeUp(); tries += 1 }
    safariRow.tap()
    sleep(1)
    let extensions = settings.cells.containing(.staticText, identifier: "Extensions").firstMatch
    if !extensions.waitForExistence(timeout: 2) { dump(settings, "safari-settings") }
    tries = 0
    while !extensions.isHittable && tries < 10 { settings.swipeUp(); tries += 1 }
    extensions.tap()
    sleep(1)
    enable()
  }

  func enable() {
    dump(settings, "extensions-list")
    settings.buttons["com.zenbujapanese.dictionary.spike947.safari"].firstMatch.tap()
    sleep(1)
    dump(settings, "spike-extension")
    let toggle = settings.switches["Allow Extension"].firstMatch
    if toggle.exists, (toggle.value as? String) == "0" {
      toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
    }
    sleep(1)
    dump(settings, "spike-extension-on")
    let all = settings.staticTexts["All Websites"].firstMatch
    if !all.exists { dump(settings, "no-all-websites") }
    var tries2 = 0
    while !all.isHittable && tries2 < 5 { settings.swipeUp(); tries2 += 1 }
    all.tap()
    sleep(1)
    dump(settings, "all-websites")
    settings.staticTexts[ProcessInfo.processInfo.environment["SPIKE_CHOICE"] ?? "Allow"].firstMatch.tap()
    sleep(1)
    dump(settings, "all-websites-allowed")
    host.activate()
    sleep(2)
    dump(host, "host-after-enable")
  }

  func testD_lookUp() {
    XCUIDevice.shared.system.open(page)
    XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 10))
    sleep(4)
    dump(safari, "safari-page")
    let text = safari.webViews.staticTexts.containing(NSPredicate(format: "label CONTAINS '辞書'")).firstMatch
    XCTAssertTrue(text.waitForExistence(timeout: 10))
    text.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.5)).doubleTap()
    sleep(5)
    dump(safari, "after-select")
  }

  func point(_ app: XCUIApplication, _ x: CGFloat, _ y: CGFloat) -> XCUICoordinate {
    app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: y))
  }

  func testE_longPress() {
    safari.activate()
    sleep(1)
    let x = Double(ProcessInfo.processInfo.environment["SPIKE_X"] ?? "") ?? 35
    let y = Double(ProcessInfo.processInfo.environment["SPIKE_Y"] ?? "") ?? 103
    point(safari, x, y).press(forDuration: 1.2)
    sleep(4)
    dump(safari, "after-long-press")
  }

  func testF_tap() {
    safari.activate()
    sleep(1)
    let x = Double(ProcessInfo.processInfo.environment["SPIKE_X"] ?? "") ?? 0
    let y = Double(ProcessInfo.processInfo.environment["SPIKE_Y"] ?? "") ?? 0
    point(safari, x, y).tap()
    sleep(4)
    dump(XCUIApplication(bundleIdentifier: ProcessInfo.processInfo.environment["SPIKE_APP"] ?? "com.apple.mobilesafari"), "after-tap")
  }

  func meta(_ label: String) {
    let line = safari.staticTexts.containing(NSPredicate(format: "label BEGINSWITH 'kind '")).firstMatch
    print("SPIKE \(label): \(line.exists ? line.label.replacingOccurrences(of: "\n", with: " | ") : "no meta")")
  }

  func testG_saveAndMore() {
    safari.activate()
    sleep(1)
    safari.buttons["Mark as Known"].firstMatch.tap()
    sleep(3)
    meta("after mark known")
    safari.buttons["Add to List"].firstMatch.tap()
    sleep(3)
    meta("after add to list")
    point(safari, 80, 100).press(forDuration: 1.2)
    sleep(4)
    meta("食べた")
    point(safari, 260, 100).press(forDuration: 1.2)
    sleep(4)
    meta("third word")
    point(safari, 112, 100).press(forDuration: 1.2, thenDragTo: point(safari, 368, 100))
    sleep(5)
    meta("paragraph")
    dump(safari, "after-paragraph")
  }

  func testH_probe() {
    let url = URL(string: ProcessInfo.processInfo.environment["SPIKE_URL"]!)!
    XCUIDevice.shared.system.open(url)
    XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 10))
    let done = safari.staticTexts.containing(NSPredicate(format: "label CONTAINS 'PROBE done'")).firstMatch
    _ = done.waitForExistence(timeout: 90)
    for line in safari.staticTexts.containing(NSPredicate(format: "label CONTAINS 'PROBE'")).allElementsBoundByIndex {
      print("SPIKE " + line.label.replacingOccurrences(of: "\n", with: "\nSPIKE "))
    }
  }

  func openFromSafari(_ button: XCUIElement, _ label: String) {
    XCTAssertTrue(button.waitForExistence(timeout: 15))
    button.tap()
    sleep(2)
    dump(safari, "\(label)-prompt")
    let open = safari.buttons["Open"].firstMatch
    if open.exists { open.tap() }
    print("SPIKE \(label) host foreground: \(host.wait(for: .runningForeground, timeout: 8))")
    sleep(1)
    dump(host, "\(label)-host")
  }

  func testI_watchInZenbu() {
    XCUIDevice.shared.system.open(URL(string: "\(base)/index.html?run=8")!)
    XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 10))
    sleep(3)
    openFromSafari(safari.buttons["Watch in Zenbu"].firstMatch, "watch")
  }

  func testJ_openInZenbu() {
    XCUIDevice.shared.system.open(URL(string: "\(base)/index.html?run=9")!)
    XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 10))
    sleep(3)
    point(safari, 35, 103).press(forDuration: 1.2)
    sleep(4)
    openFromSafari(safari.buttons["Open in Zenbu"].firstMatch, "open")
  }

  func testK_youtubeAndShare() {
    XCUIDevice.shared.system.open(URL(string: "https://www.youtube.com/watch?v=dQw4w9WgXcQ")!)
    XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 10))
    sleep(8)
    dump(safari, "youtube-page")
    print("SPIKE youtube watch button: \(safari.buttons["Watch in Zenbu"].exists)")
    safari.buttons["MoreMenuButton"].firstMatch.tap()
    sleep(2)
    dump(safari, "page-menu")
    let share = safari.buttons["Share"].firstMatch
    if share.exists { share.tap() } else { safari.staticTexts["Share"].firstMatch.tap() }
    sleep(3)
    dump(safari, "share-sheet")
    let spike = safari.cells.containing(NSPredicate(format: "label CONTAINS 'Spike'")).firstMatch
    let spikeButton = safari.buttons.containing(NSPredicate(format: "label CONTAINS 'Spike'")).firstMatch
    print("SPIKE share sheet has spike cell: \(spike.exists) button: \(spikeButton.exists)")
    if spikeButton.exists { spikeButton.tap() } else if spike.exists { spike.tap() }
    sleep(3)
    dump(safari, "share-extension")
    let watch = safari.buttons["Watch in Spike"].firstMatch
    if watch.waitForExistence(timeout: 5) { watch.tap() }
    sleep(3)
    let result = safari.staticTexts["shareResult"].firstMatch
    print("SPIKE share result: \(result.exists ? result.label : "missing")")
    print("SPIKE host foreground after share: \(host.state == .runningForeground)")
    dump(safari, "share-after-open")
  }

  func testL_askPage() {
    XCUIDevice.shared.system.open(URL(string: "\(base)/index.html?run=10")!)
    XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 10))
    sleep(4)
    dump(safari, "ask-page")
    print("SPIKE ask watch button: \(safari.buttons["Watch in Zenbu"].exists)")
  }

  func testM_askMenu() {
    safari.activate()
    safari.buttons["MoreMenuButton"].firstMatch.tap()
    sleep(2)
    dump(safari, "ask-menu")
    let item = safari.buttons.containing(NSPredicate(format: "label CONTAINS 'Spike'")).firstMatch
    print("SPIKE menu item: \(item.exists ? item.label : "missing")")
    if item.exists { item.tap() }
    sleep(2)
    dump(safari, "ask-extension")
  }

  func testN_manageExtensions() {
    safari.activate()
    let cancel = safari.buttons["Cancel"].firstMatch
    if cancel.exists { cancel.tap(); sleep(1) }
    safari.buttons["MoreMenuButton"].firstMatch.tap()
    sleep(2)
    let manage = safari.buttons["ManageExtensions"].firstMatch
    var tries = 0
    while !manage.isHittable && tries < 4 { safari.swipeUp(); tries += 1 }
    manage.tap()
    sleep(2)
    dump(safari, "manage-extensions")
  }

  func testB_turnOnWarm() {
    host.activate()
    host.buttons["Turn On in Safari Settings"].tap()
    sleep(4)
    dump(settings, "settings-warm")
  }
}
