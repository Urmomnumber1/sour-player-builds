import XCTest

// Sour Player on a simulated iPhone (run.sh runs this on GitHub's Macs). testIphone connects to the
// stand-in Hermes Music by a Tailscale-style name (http to a name with dots, which iOS used to block),
// signs in to the mock music server, checks that typing doesn't zoom the page in, and goes through
// the tabs, an album and Now Playing upright and sideways. testOffline runs after run.sh stops Hermes
// Music: the app has to say so and open by itself once it's back.
// VARIANT=old is the app as friends have it now (the old network settings and web build): the same
// steps, but only noted, not checked. Screenshots and notes.txt go to $SHOTS.
final class SourPhoneTests: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "com.anjalo.sourplayer")
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let env = ProcessInfo.processInfo.environment
    var count = 0
    var prefix = "a"

    var variant: String { env["VARIANT"] ?? "new" }
    var dir: String { env["SHOTS"] ?? NSTemporaryDirectory() }

    override func setUp() {
        continueAfterFailure = true
        XCUIDevice.shared.orientation = .portrait
    }

    // ---- helpers

    func note(_ line: String) {
        print("SOURCHECK [\(variant)] \(line)")
        let file = URL(fileURLWithPath: dir + "/notes.txt")
        let data = Data("[\(variant)] \(line)\n".utf8)
        if let handle = try? FileHandle(forWritingTo: file) {
            handle.seekToEndOfFile()
            handle.write(data)
            try? handle.close()
        } else {
            try? data.write(to: file)
        }
    }

    // a check that only fails the run for the new app (the old one is there to show what was wrong)
    func check(_ ok: Bool, _ what: String) {
        note("\(ok ? "OK  " : "FAIL") \(what)")
        if variant == "new" { XCTAssertTrue(ok, what) }
    }

    func shot(_ name: String) {
        count += 1
        let image = XCUIScreen.main.screenshot()
        let file = String(format: "%@/%@%02d-%@.png", dir, prefix, count, name)
        try? image.pngRepresentation.write(to: URL(fileURLWithPath: file))
        let attachment = XCTAttachment(screenshot: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func any(_ text: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    func appears(_ text: String, _ timeout: TimeInterval = 25) -> Bool {
        any(text).waitForExistence(timeout: timeout)
    }

    func gone(_ el: XCUIElement, _ timeout: TimeInterval) -> Bool {
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: el)
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

    func textBox(_ hint: String) -> XCUIElement {
        let p = NSPredicate(format: "label CONTAINS[c] %@ OR placeholderValue CONTAINS[c] %@", hint, hint)
        return app.textFields.matching(p).firstMatch
    }

    func named(_ label: String) -> XCUIElement {
        let p = NSPredicate(format: "label ==[c] %@", label)
        for query in [app.buttons, app.links, app.radioButtons] {
            let el = query.matching(p).firstMatch
            if el.exists { return el }
        }
        return app.descendants(matching: .any).matching(p).firstMatch
    }

    func tap(_ el: XCUIElement) {
        if el.isHittable {
            el.tap()
        } else {
            el.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
    }

    func type(_ el: XCUIElement, _ text: String) {
        tap(el)
        sleep(1)
        let current = (el.value as? String) ?? ""
        if !current.isEmpty, current != el.placeholderValue {
            el.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count + 2))
        }
        el.typeText(text)
    }

    // the system's own questions (notifications, saving the password)
    func prompts() {
        for label in ["Allow", "OK"] where springboard.buttons[label].exists {
            springboard.buttons[label].tap()
        }
        for label in ["Not Now", "Never for This Website"] where app.buttons[label].exists {
            app.buttons[label].tap()
        }
    }

    // nothing cut off at the sides
    func inside(_ name: String, _ el: XCUIElement) {
        guard el.exists else {
            check(false, "\(name) is on the screen (it isn't there at all)")
            return
        }
        let screen = app.windows.firstMatch.frame
        let f = el.frame
        check(f.minX >= screen.minX - 1 && f.maxX <= screen.maxX + 1, "\(name) fits on the screen (\(Int(f.minX))-\(Int(f.maxX)) of \(Int(screen.width)))")
    }

    // ---- the tests

    func testIphone() throws {
        prefix = "a"
        app.launch()
        check(appears("Hermes Music address", 40), "the welcome screen shows")
        shot("welcome")
        let address = textBox("Hermes Music address").exists ? textBox("Hermes Music address") : textBox("umbrel.local")

        // something that isn't Hermes Music (like an Umbrel's dashboard, without the :3340)
        type(address, "127.0.0.1:3070")
        tap(named("Connect"))
        check(appears("but it isn", 30), "a web page that isn't Hermes Music is turned down")
        shot("not-hermes")

        // a Tailscale-style name over http
        type(address, "hermes.sourcheck.ts.net:3060")
        tap(named("Connect"))
        let urlBox = app.textFields.matching(NSPredicate(format: "label CONTAINS[c] 'URL' AND NOT (label CONTAINS[c] 'Public')")).firstMatch
        let viaName = urlBox.waitForExistence(timeout: 45) && !any("reach Hermes Music").exists
        check(viaName, "connects to Hermes Music by a Tailscale-style name (hermes.sourcheck.ts.net)")
        if !viaName {
            shot("tailscale-name-blocked")
            // what the old app can do: an IP address
            type(address, "127.0.0.1:3060")
            tap(named("Connect"))
            note("with an IP address instead: \(urlBox.waitForExistence(timeout: 45) ? "connects" : "doesn't connect either")")
        }
        prompts()
        sleep(2)
        shot("sign-in")

        // the music server: filled in from Hermes Music's address in the new app
        let filled = (urlBox.value as? String) ?? ""
        check(filled.contains(":4533"), "the music server address is filled in (\(filled))")
        if !filled.contains(":4533") { type(urlBox, viaName ? "http://hermes.sourcheck.ts.net:4533" : "http://127.0.0.1:4533") }
        let subsonic = named("OpenSubsonic")
        tap(subsonic.exists ? subsonic : any("OpenSubsonic"))
        let user = textBox("Username")
        let widthBefore = user.frame.width
        type(user, "tester")
        let pass = app.secureTextFields.firstMatch
        type(pass, "lemon-test-1")
        shot("typing")
        let widthAfter = user.frame.width
        check(abs(widthAfter - widthBefore) < 4, "typing doesn't zoom the page in (box \(Int(widthBefore)) -> \(Int(widthAfter)) wide)")
        tap(named("Add"))
        sleep(5)
        prompts()
        check(named("You").waitForExistence(timeout: 40), "signed in: the phone tabs show")
        sleep(4)
        prompts()
        shot("home")
        inside("the You tab", named("You"))
        inside("the Home tab", named("Home"))

        // Library > Albums > the first album > its first song
        tap(named("Library"))
        sleep(3)
        shot("library")
        let albums = named("Albums")
        tap(albums.exists ? albums : any("Albums"))
        check(appears("Album 1", 25), "the albums show")
        sleep(2)
        shot("albums")
        tap(any("Album 1"))
        check(appears("Song 1", 25), "the album opens")
        sleep(2)
        shot("album")
        inside("the You tab on the album page", named("You"))
        tap(any("Song 1"))
        sleep(4)
        prompts()
        shot("playing")

        // sideways: still the phone layout, nothing cut off
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(4)
        shot("sideways-album")
        check(named("You").exists, "sideways keeps the phone tabs")
        inside("the You tab sideways", named("You"))
        tap(named("Home"))
        sleep(3)
        shot("sideways-home")

        // Now Playing, sideways and upright
        let card = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] 'Song 1'")).allElementsBoundByIndex.last
        if let card = card { tap(card) }
        sleep(3)
        shot("sideways-now-playing")
        XCUIDevice.shared.orientation = .portrait
        sleep(4)
        shot("now-playing")
    }

    func testOffline() throws {
        prefix = "b"
        app.launch()
        let offline = appears("reach Hermes Music", 60)
        shot("offline")
        check(offline, "with Hermes Music gone, the app says it can't reach it (no dark empty screen)")
        FileManager.default.createFile(atPath: dir + "/offline-seen", contents: nil)
        // run.sh brings Hermes Music back: the app opens Sour Player by itself
        let back = gone(any("reach Hermes Music"), 150) && named("You").waitForExistence(timeout: 40)
        sleep(3)
        shot("back-online")
        check(back, "once Hermes Music is back, the app opens by itself")
    }
}
