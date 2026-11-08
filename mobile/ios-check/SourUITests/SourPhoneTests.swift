import XCTest

// Sour Player on a simulated iPhone (run.sh runs this on GitHub's Macs, with a stand-in Hermes Music
// and a mock music server reachable at a Tailscale-style name and IP).
// testIphone: turns down a page that isn't Hermes Music, connects by the name (http to a name with
// dots, which the old network settings blocked), signs in with the music server filled in, checks
// that typing doesn't zoom the page in and goes through the tabs, an album and Now Playing upright
// and sideways; then You > Phone settings > Change address, and connects by the IP.
// testOffline (after run.sh stops Hermes Music): the app has to say it can't reach it and open by
// itself once it's back.
// VARIANT=old is the app as friends have it now (old network settings, the 0.10.8 web build): the
// same steps, only noted, never failed. Screenshots and notes.txt go to $SHOTS.
final class SourPhoneTests: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "com.anjalo.sourplayer")
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let env = ProcessInfo.processInfo.environment
    let host = "hermes.sourcheck.ts.net"
    let ip = "100.88.1.2"
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

    func shot(_ label: String) {
        count += 1
        let image = XCUIScreen.main.screenshot()
        let file = String(format: "%@/%@%02d-%@.png", dir, prefix, count, label)
        try? image.pngRepresentation.write(to: URL(fileURLWithPath: file))
        let attachment = XCTAttachment(screenshot: image)
        attachment.name = label
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

    func named(_ label: String) -> XCUIElement {
        let p = NSPredicate(format: "label ==[c] %@", label)
        for query in [app.buttons, app.links, app.radioButtons] {
            let el = query.matching(p).firstMatch
            if el.exists { return el }
        }
        return app.descendants(matching: .any).matching(p).firstMatch
    }

    func field(_ startsWith: String) -> XCUIElement {
        app.textFields.matching(NSPredicate(format: "label BEGINSWITH[c] %@", startsWith)).firstMatch
    }

    var welcomeBox: XCUIElement {
        app.textFields.matching(NSPredicate(format: "label CONTAINS[c] 'Hermes Music address' OR placeholderValue CONTAINS[c] 'umbrel.local'")).firstMatch
    }

    func tap(_ el: XCUIElement) {
        if el.isHittable {
            el.tap()
        } else {
            el.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
    }

    // whatever is in the box, replaced (tapped at its right end, so the cursor is after the text)
    func replace(_ el: XCUIElement, _ text: String) {
        el.coordinate(withNormalizedOffset: CGVector(dx: 0.96, dy: 0.5)).tap()
        sleep(1)
        let current = (el.value as? String) ?? ""
        if !current.isEmpty, current != el.placeholderValue {
            el.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count + 2))
        }
        el.typeText(text)
    }

    // the keyboard's Done (so the next box isn't under the keyboard)
    func keyboardDone() {
        let done = app.buttons["Done"]
        if done.exists, done.isHittable {
            done.tap()
            sleep(1)
        }
    }

    func fill(_ el: XCUIElement, _ text: String) {
        tap(el)
        sleep(1)
        el.typeText(text)
        keyboardDone()
    }

    // the system's own questions (notifications, saving the password) and the app's first-start guide
    func prompts() {
        keyboardDone()
        for label in ["Allow", "OK"] where springboard.buttons[label].exists {
            springboard.buttons[label].tap()
        }
        for label in ["Not Now", "Never for This Website", "Skip", "Dismiss"] where named(label).exists {
            tap(named(label))
            sleep(1)
        }
    }

    // nothing cut off at the sides
    func inside(_ what: String, _ el: XCUIElement) {
        guard el.exists else {
            check(false, "\(what) is on the screen (it isn't there at all)")
            return
        }
        let screen = app.windows.firstMatch.frame
        let f = el.frame
        check(f.minX >= screen.minX - 1 && f.maxX <= screen.maxX + 1,
              "\(what) fits on the screen (\(Int(f.minX))-\(Int(f.maxX)) of \(Int(screen.width)))")
    }

    // after Connect: true once Sour Player opened from Hermes Music (the welcome screen stayed gone
    // for 3 seconds), false when the welcome screen says why not
    func waitConnected() -> Bool {
        var goneFor = 0
        for _ in 0..<50 {
            if any("but it isn").exists || any("reach Hermes Music").exists || any("look like an address").exists {
                return false
            }
            goneFor = named("Connect").exists || any("Hermes Music address").exists ? 0 : goneFor + 1
            if goneFor >= 3 { return true }
            sleep(1)
        }
        return false
    }

    func errorText() -> String {
        for hint in ["but it isn", "reach Hermes Music", "look like an address"] where any(hint).exists {
            return any(hint).label
        }
        return "no answer"
    }

    // a fresh start of the app with that address typed on the welcome screen
    func connect(_ address: String, _ label: String) -> Bool {
        app.terminate()
        app.launch()
        guard welcomeBox.waitForExistence(timeout: 40) else {
            note("no welcome screen to type \(address) into")
            return false
        }
        // laid out (a box tapped before the styles load moves away from under the finger)
        for _ in 0..<10 where welcomeBox.frame.height < 30 { sleep(1) }
        sleep(1)
        check(!app.keyboards.firstMatch.exists, "no keyboard pops up by itself on the welcome screen")
        tap(welcomeBox)
        sleep(1)
        welcomeBox.typeText(address)
        keyboardDone()
        tap(named("Connect"))
        let ok = waitConnected()
        note("\(address): \(ok ? "connected" : "turned down: \(errorText())")")
        sleep(2)
        shot(label)
        return ok
    }

    func signIn(_ musicServer: String) {
        let url = field("URL")
        check(url.waitForExistence(timeout: 30), "the music server sign-in shows")
        sleep(3)
        check(!app.keyboards.firstMatch.exists, "no keyboard pops up by itself on the sign-in page")
        check(!any("Welcome to Sour Player").exists, "no setup guide over the sign-in page")
        shot("sign-in")
        prompts()
        let filled = (url.value as? String) ?? ""
        check(filled == musicServer, "the music server address is filled in (\(filled))")
        if filled != musicServer {
            replace(url, musicServer)
            keyboardDone()
        }
        let subsonic = named("OpenSubsonic")
        tap(subsonic.exists ? subsonic : any("OpenSubsonic"))
        let user = field("Username")
        let widthBefore = user.frame.width
        fill(user, "tester")
        fill(app.secureTextFields.firstMatch, "lemon-test-1")
        shot("typed")
        let widthAfter = user.frame.width
        check(abs(widthAfter - widthBefore) < 4, "typing doesn't zoom the page in (box \(Int(widthBefore)) -> \(Int(widthAfter)) wide)")
        tap(named("Add"))
        sleep(5)
        prompts()
    }

    // ---- the tests

    func testIphone() throws {
        prefix = "a"
        app.launch()
        check(welcomeBox.waitForExistence(timeout: 40), "the welcome screen shows")
        shot("welcome")

        // something that isn't Hermes Music (like an Umbrel's dashboard, without the :3340)
        check(!connect("127.0.0.1:3070", "not-hermes") && any("but it isn").exists, "a web page that isn't Hermes Music is turned down")

        // a Tailscale-style name over http (blocked by the old network settings)
        var server = "http://\(host):4533"
        let byName = connect("\(host):3060", "by-name")
        check(byName, "connects by a Tailscale-style name (\(host))")
        if !byName {
            server = "http://\(ip):4533"
            guard connect("\(ip):3060", "by-ip") else { return }
        }

        signIn(server)
        check(named("You").waitForExistence(timeout: 40), "signed in: the phone tabs show")
        sleep(4)
        prompts()
        shot("home")
        inside("the You tab", named("You"))
        inside("the Home tab", named("Home"))

        // Library > Albums > the first album > its first song (long names, like real soundtracks)
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

        // Now Playing (the mini player), sideways and upright
        if let card = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] 'Song 1'")).allElementsBoundByIndex.last {
            tap(card)
        }
        sleep(3)
        shot("sideways-now-playing")
        XCUIDevice.shared.orientation = .portrait
        sleep(4)
        shot("now-playing")
        let close = named("Close the Sour Stage")
        if close.exists { tap(close) }
        sleep(2)

        guard variant == "new" else { return }
        // You > Phone settings > Change address: back to the welcome screen, then the IP works too
        tap(named("You"))
        sleep(2)
        tap(any("Phone settings"))
        sleep(2)
        shot("phone-settings")
        let change = named("Change address")
        check(change.exists, "Phone settings has Change address")
        tap(change)
        check(welcomeBox.waitForExistence(timeout: 20), "Change address goes back to the welcome screen")
        for _ in 0..<10 where welcomeBox.frame.height < 30 { sleep(1) }
        sleep(1)
        shot("changed")
        tap(welcomeBox)
        sleep(1)
        welcomeBox.typeText("\(ip):3060")
        keyboardDone()
        tap(named("Connect"))
        check(waitConnected(), "connects by a Tailscale-style IP (\(ip))")
        sleep(3)
        prompts()
        shot("by-ip")
        check(((field("URL").value as? String) ?? "") == "http://\(ip):4533", "the music server is filled in for that address too")
    }

    func testOffline() throws {
        prefix = "b"
        app.launch()
        let offline = appears("reach Hermes Music", 60)
        sleep(3)
        shot("offline")
        check(offline, "with Hermes Music gone, the app says it can't reach it (no dark empty screen)")
        check(!app.keyboards.firstMatch.exists, "no keyboard over the can't-reach screen")
        check(named("Try again").exists && named("Use a different address").exists, "Try again and Use a different address are there")
        FileManager.default.createFile(atPath: dir + "/offline-seen", contents: nil)
        // run.sh brings Hermes Music back: the app opens Sour Player by itself
        let back = gone(any("reach Hermes Music"), 150) && (field("URL").waitForExistence(timeout: 40) || named("You").exists)
        sleep(3)
        shot("back-online")
        check(back, "once Hermes Music is back, the app opens by itself")
    }
}
