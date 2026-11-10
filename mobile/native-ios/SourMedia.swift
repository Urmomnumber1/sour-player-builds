// ---- Sour Player for iPhone (added to AppDelegate.swift by setup-ios.mjs) ----
// The web app's way into iOS: what's playing on the lock screen and Control Center (and the
// headphone / AirPods buttons), notifications, the connection type (data saver), offline songs
// and QR codes. Updates come from TestFlight, so the in-app updater is off here.

import AVFoundation
import Capacitor
import CoreImage
import MediaPlayer
import Network
import UserNotifications
import WebKit

@objc(SourMediaPlugin)
public class SourMediaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SourMediaPlugin"
    public let jsName = "SourMedia"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setQueue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notify", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "network", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeIntent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveOffline", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listOffline", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeOffline", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearOffline", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "qr", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanQr", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "musicSearch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setIcon", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "installUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setServer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "savedServer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keepAwake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "volume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "tvShow", returnType: CAPPluginReturnPromise),
    ]

    private let monitor = NWPathMonitor()
    private var netType = "wifi"
    private var playing = false
    private var artUrl = ""
    private var artwork: MPMediaItemArtwork?

    private func send(_ action: String, _ extra: [String: Any] = [:]) {
        var data = extra
        data["action"] = action
        notifyListeners("action", data: data)
    }

    override public func load() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default)
        try? session.setActive(true)
        volumeWatch = session.observe(\.outputVolume, options: [.new]) { [weak self] s, _ in
            self?.notifyListeners("volume", data: ["value": s.outputVolume])
        }
        watchScreens()

        let cc = MPRemoteCommandCenter.shared()
        cc.playCommand.addTarget { [weak self] _ in self?.send("play"); return .success }
        cc.pauseCommand.addTarget { [weak self] _ in self?.send("pause"); return .success }
        cc.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            self.send(self.playing ? "pause" : "play")
            return .success
        }
        cc.nextTrackCommand.addTarget { [weak self] _ in self?.send("next"); return .success }
        cc.previousTrackCommand.addTarget { [weak self] _ in self?.send("previous"); return .success }
        cc.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.send("seek", ["position": e.positionTime])
            return .success
        }

        monitor.pathUpdateHandler = { [weak self] path in
            if path.usesInterfaceType(.wifi) || path.usesInterfaceType(.wiredEthernet) { self?.netType = "wifi" }
            else if path.usesInterfaceType(.cellular) { self?.netType = "cellular" }
            else { self?.netType = path.status == .satisfied ? "other" : "none" }
        }
        monitor.start(queue: DispatchQueue.global(qos: .utility))

        // headphones / AirPods / the car: unplugged pauses, plugged in can play
        NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
            let output = AVAudioSession.sharedInstance().currentRoute.outputs.first
            let bluetooth = [AVAudioSession.Port.bluetoothA2DP, .bluetoothLE, .bluetoothHFP, .carAudio].contains(output?.portType ?? .builtInSpeaker)
            if reason == .oldDeviceUnavailable { self?.send("noisy") }
            if reason == .newDeviceAvailable {
                self?.notifyListeners("device", data: ["connected": true, "bluetooth": bluetooth, "name": output?.portName ?? ""])
            }
        }
    }

    // ---------- the phone's volume (the side buttons move it too): the slider in the app's player. iOS only
    // lets apps move it through its own volume slider, so one sits out of sight ----------
    private let volumeView = MPVolumeView(frame: CGRect(x: -2000, y: -2000, width: 10, height: 10))
    private var volumeWatch: NSKeyValueObservation?

    @objc func volume(_ call: CAPPluginCall) {
        call.resolve(["value": AVAudioSession.sharedInstance().outputVolume])
    }

    @objc func setVolume(_ call: CAPPluginCall) {
        let value = Float(max(0, min(1, call.getDouble("value") ?? 1)))
        DispatchQueue.main.async {
            if self.volumeView.superview == nil { self.bridge?.viewController?.view.addSubview(self.volumeView) }
            if let slider = self.volumeView.subviews.compactMap({ $0 as? UISlider }).first {
                slider.setValue(value, animated: false)
                slider.sendActions(for: .valueChanged)
            }
            call.resolve()
        }
    }

    // ---------- Sour Player TV (part of the app since 0.11): while Screen Mirroring, AirPlay or a cable is on,
    // the TV shows the party big and without buttons; the phone keeps the controls ----------
    private var tvWindow: UIWindow?
    private var tvWeb: WKWebView?
    private var tvPulse: Timer?
    private var tvAddress: String?

    @objc func tvShow(_ call: CAPPluginCall) {
        tvAddress = call.getString("url")
        DispatchQueue.main.async {
            self.updateTV()
            call.resolve(["screens": UIScreen.screens.count - 1])
        }
    }

    private func updateTV() {
        guard UIScreen.screens.count > 1, let address = tvAddress, let url = URL(string: address) else {
            closeTV()
            return
        }
        let screen = UIScreen.screens[1]
        if tvWindow == nil || tvWindow?.screen != screen {
            closeTV()
            let window = UIWindow(frame: screen.bounds)
            window.screen = screen
            let controller = UIViewController()
            controller.view.backgroundColor = UIColor(red: 0.043, green: 0.043, blue: 0.059, alpha: 1)
            let config = WKWebViewConfiguration()
            config.allowsInlineMediaPlayback = true
            config.mediaTypesRequiringUserActionForPlayback = []
            let web = WKWebView(frame: controller.view.bounds, configuration: config)
            web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            web.isOpaque = false
            web.backgroundColor = controller.view.backgroundColor
            web.scrollView.isScrollEnabled = false
            web.scrollView.contentInsetAdjustmentBehavior = .never
            controller.view.addSubview(web)
            window.rootViewController = controller
            window.isHidden = false
            tvWindow = window
            tvWeb = web
            // iOS treats the TV's page like a background page (slow timers): nudge it every second
            tvPulse = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                self?.tvWeb?.evaluateJavaScript("window.tvPulse && window.tvPulse()", completionHandler: nil)
            }
        }
        if tvWeb?.url?.absoluteString != address { tvWeb?.load(URLRequest(url: url)) }
    }

    private func closeTV() {
        tvPulse?.invalidate()
        tvPulse = nil
        tvWeb = nil
        tvWindow?.isHidden = true
        tvWindow = nil
    }

    private func watchScreens() {
        for name in [UIScreen.didConnectNotification, UIScreen.didDisconnectNotification] {
            NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.updateTV()
                self?.notifyListeners("tv", data: ["screens": UIScreen.screens.count - 1])
            }
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        playing = call.getBool("playing", false)
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: call.getString("title", ""),
            MPMediaItemPropertyArtist: call.getString("artist", ""),
            MPMediaItemPropertyAlbumTitle: call.getString("album", ""),
            MPMediaItemPropertyPlaybackDuration: call.getDouble("duration", 0),
            MPNowPlayingInfoPropertyElapsedPlaybackTime: call.getDouble("position", 0),
            MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0,
        ]
        let art = call.getString("art", "")
        if art != artUrl {
            artUrl = art
            artwork = nil
            if let url = URL(string: art), art.hasPrefix("http") {
                URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
                    guard let self = self, let data = data, let image = UIImage(data: data), art == self.artUrl else { return }
                    self.artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                    DispatchQueue.main.async {
                        var now = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
                        now[MPMediaItemPropertyArtwork] = self.artwork
                        MPNowPlayingInfoCenter.default().nowPlayingInfo = now
                    }
                }.resume()
            }
        }
        if let artwork = artwork { info[MPMediaItemPropertyArtwork] = artwork }
        DispatchQueue.main.async {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            MPNowPlayingInfoCenter.default().playbackState = self.playing ? .playing : .paused
        }
        call.resolve()
    }

    @objc func setQueue(_ call: CAPPluginCall) { call.resolve() }

    @objc func info(_ call: CAPPluginCall) {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        let code = Int(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0") ?? 0
        call.resolve(["version": version, "code": code, "platform": "ios"])
    }

    @objc func notify(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { call.resolve(); return }
            let content = UNMutableNotificationContent()
            content.title = call.getString("title", "Sour Player")
            content.body = call.getString("text", "")
            content.sound = .default
            center.add(UNNotificationRequest(identifier: call.getString("id", UUID().uuidString), content: content, trigger: nil))
            call.resolve()
        }
    }

    @objc func network(_ call: CAPPluginCall) { call.resolve(["type": netType]) }

    @objc func takeIntent(_ call: CAPPluginCall) { call.resolve([:]) }

    // ---- offline songs, in the app's own Documents folder

    private var offlineDir: URL {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("offline")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func safe(_ id: String) -> String {
        String(id.map { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" ? $0 : "_" })
    }

    @objc func saveOffline(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let link = call.getString("url"), let url = URL(string: link) else {
            call.reject("Missing song")
            return
        }
        let ext = call.getString("ext", "mp3").filter { $0.isLetter || $0.isNumber }
        let target = offlineDir.appendingPathComponent("\(safe(id)).\(ext)")
        URLSession.shared.downloadTask(with: url) { tmp, _, error in
            guard let tmp = tmp, error == nil else { call.reject("Download failed"); return }
            try? FileManager.default.removeItem(at: target)
            do {
                try FileManager.default.moveItem(at: tmp, to: target)
                let size = (try? FileManager.default.attributesOfItem(atPath: target.path)[.size] as? Int) ?? 0
                call.resolve(["path": target.path, "size": size])
            } catch {
                call.reject("Could not save it")
            }
        }.resume()
    }

    @objc func listOffline(_ call: CAPPluginCall) {
        let files = (try? FileManager.default.contentsOfDirectory(at: offlineDir, includingPropertiesForKeys: [.fileSizeKey])) ?? []
        call.resolve(["files": files.map { f -> [String: Any] in
            ["file": f.deletingPathExtension().lastPathComponent, "path": f.path, "size": (try? f.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0]
        }])
    }

    @objc func removeOffline(_ call: CAPPluginCall) {
        let prefix = safe(call.getString("id", "")) + "."
        for f in (try? FileManager.default.contentsOfDirectory(at: offlineDir, includingPropertiesForKeys: nil)) ?? [] where f.lastPathComponent.hasPrefix(prefix) {
            try? FileManager.default.removeItem(at: f)
        }
        call.resolve()
    }

    @objc func clearOffline(_ call: CAPPluginCall) {
        try? FileManager.default.removeItem(at: offlineDir)
        call.resolve()
    }

    // ---- QR codes (listen along and Group Play invites)

    @objc func qr(_ call: CAPPluginCall) {
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { call.reject("No QR codes"); return }
        filter.setValue(Data(call.getString("text", "").utf8), forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)),
              let cg = CIContext().createCGImage(output, from: output.extent),
              let png = UIImage(cgImage: cg).pngData() else { call.reject("Couldn't make the code"); return }
        call.resolve(["image": "data:image/png;base64," + png.base64EncodedString()])
    }

    @objc func scanQr(_ call: CAPPluginCall) {
        call.reject("Scan the code with the iPhone Camera app for now")
    }

    @objc func musicSearch(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: "shazam://"), UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url)
                call.resolve()
            } else {
                call.reject("Open Control Center and tap Music Recognition (the Shazam button)")
            }
        }
    }

    @objc func setIcon(_ call: CAPPluginCall) { call.resolve() }

    // Sour Player TV: the phone is mirrored to the TV, so it must not lock itself
    @objc func keepAwake(_ call: CAPPluginCall) {
        let on = call.getBool("on", false)
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = on }
        call.resolve()
    }

    // ---- your Hermes Music: the app runs Sour Player from its /app/ page (http on your network or
    // Tailscale), so iOS doesn't block the music server as "insecure" and the app updates with Hermes.
    // An empty address goes back to the welcome screen.

    static let knownKey = "sourHermesKnown"

    @objc func setServer(_ call: CAPPluginCall) {
        let text = call.getString("url", "").trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty {
            UserDefaults.standard.removeObject(forKey: SourBridgeViewController.serverKey)
            SourBridgeViewController.lastFailure = nil
            DispatchQueue.main.async { _ = self.bridge?.webView?.load(URLRequest(url: URL(string: "capacitor://localhost/")!)) }
            call.resolve()
            return
        }
        let candidates = SourMediaPlugin.hermesCandidates(text)
        guard let first = candidates.first, let host = URLComponents(string: first)?.host else {
            call.reject("That doesn't look like an address", "address")
            return
        }
        let shown = text.replacingOccurrences(of: "http://", with: "").replacingOccurrences(of: "https://", with: "")
        probe(candidates, 0, false) { found, notHermes in
            guard let base = found, let app = URL(string: base + "/app/") else {
                if notHermes {
                    call.reject("Something answered at \(shown), but it isn't Hermes Music. Its address ends in :3340, like umbrel.local:3340.", "notHermes")
                } else if SourMediaPlugin.isTailscale(host) {
                    call.reject("Couldn't reach Hermes Music at \(shown). Is Tailscale on? SideStore's VPN switches it off: turn Tailscale back on when SideStore is done.", "tailscale")
                } else if SourMediaPlugin.isLocal(host) {
                    call.reject("Couldn't reach Hermes Music at \(shown). That address only works on your home Wi-Fi, and Sour Player needs Local Network access (Settings > Privacy & Security > Local Network).", "local")
                } else {
                    call.reject("Couldn't reach Hermes Music at \(shown). Check the address, and that the phone is on your home Wi-Fi or Tailscale.", "unreachable")
                }
                return
            }
            UserDefaults.standard.set(app.absoluteString, forKey: SourBridgeViewController.serverKey)
            SourMediaPlugin.remember(base)
            SourBridgeViewController.lastFailure = nil
            call.resolve(["url": app.absoluteString])
            DispatchQueue.main.async { _ = self.bridge?.webView?.load(URLRequest(url: app)) }
        }
    }

    // where the app runs from now, the addresses that worked before, and why it couldn't load (the
    // welcome screen shows that and keeps trying)
    @objc func savedServer(_ call: CAPPluginCall) {
        let saved = UserDefaults.standard.string(forKey: SourBridgeViewController.serverKey) ?? ""
        call.resolve([
            "url": saved.hasSuffix("/app/") ? String(saved.dropLast(5)) : saved,
            "known": UserDefaults.standard.stringArray(forKey: SourMediaPlugin.knownKey) ?? [],
            "failed": SourBridgeViewController.lastFailure ?? "",
        ])
    }

    // Sour Player's page in the Settings app (Local Network, notifications)
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            call.resolve()
        }
    }

    // what was typed -> the addresses to try: http:// when there's none, Hermes Music's port (3340)
    // first when none was typed. Hermes always sits at the top, so a path (like /app/) is dropped.
    static func hermesCandidates(_ typed: String) -> [String] {
        var text = typed
        if !text.contains("://") { text = "http://" + text }
        guard let c = URLComponents(string: text), let scheme = c.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = c.host, !host.isEmpty else { return [] }
        let h = host.contains(":") ? "[\(host)]" : host
        if let port = c.port { return ["\(scheme)://\(h):\(port)"] }
        return ["http://\(h):3340", "\(scheme)://\(h)"]
    }

    // one address after another until Hermes Music answers (its /api/status, not just any web page:
    // an Umbrel's own dashboard answers without the :3340 too)
    private func probe(_ list: [String], _ i: Int, _ notHermes: Bool, _ done: @escaping (String?, Bool) -> Void) {
        guard i < list.count, let url = URL(string: list[i] + "/api/status") else {
            done(nil, notHermes)
            return
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 8
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { data, response, error in
            if error == nil, let http = response as? HTTPURLResponse {
                if http.statusCode == 200, let data = data,
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   json["workers"] != nil || json["library"] != nil {
                    done(list[i], false)
                } else {
                    self.probe(list, i + 1, true, done)
                }
                return
            }
            self.probe(list, i + 1, notHermes, done)
        }.resume()
    }

    static func remember(_ base: String) {
        var known = UserDefaults.standard.stringArray(forKey: knownKey) ?? []
        known.removeAll { $0 == base }
        known.insert(base, at: 0)
        UserDefaults.standard.set(Array(known.prefix(4)), forKey: knownKey)
    }

    // 100.64.0.0/10 and *.ts.net
    static func isTailscale(_ host: String) -> Bool {
        if host.hasSuffix(".ts.net") { return true }
        let p = host.split(separator: ".").compactMap { Int($0) }
        return p.count == 4 && p[0] == 100 && (64...127).contains(p[1])
    }

    // the home network: *.local, a name without dots, 10.x, 172.16-31.x, 192.168.x, 169.254.x
    static func isLocal(_ host: String) -> Bool {
        if host.hasSuffix(".local") || !host.contains(".") { return true }
        let p = host.split(separator: ".").compactMap { Int($0) }
        guard p.count == 4 else { return false }
        return p[0] == 10 || (p[0] == 172 && (16...31).contains(p[1])) || (p[0] == 192 && p[1] == 168) || (p[0] == 169 && p[1] == 254)
    }

    @objc func downloadUpdate(_ call: CAPPluginCall) { call.reject("TestFlight updates Sour Player on iPhone") }

    @objc func installUpdate(_ call: CAPPluginCall) { call.reject("TestFlight updates Sour Player on iPhone") }
}

// registers the plugin (the storyboard's view controller is set to this class)
class SourBridgeViewController: CAPBridgeViewController {
    static let serverKey = "sourHermesApp"
    // why the Hermes Music page didn't load (shown on the welcome screen)
    static var lastFailure: String?
    private var navGuard: SourNavigationGuard?

    // start at your Hermes Music's /app/ once it's set (see setServer)
    override open func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        if let saved = UserDefaults.standard.string(forKey: SourBridgeViewController.serverKey), URL(string: saved) != nil {
            descriptor.serverURL = saved
        }
        return descriptor
    }

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SourMediaPlugin())
        // the app is dark: no white flash behind the page while it loads, and nothing bounces past the edges
        let dark = UIColor(red: 16 / 255, green: 16 / 255, blue: 16 / 255, alpha: 1)
        view.backgroundColor = dark
        if let web = bridge?.webView {
            web.isOpaque = false
            web.backgroundColor = dark
            web.scrollView.backgroundColor = dark
            web.scrollView.bounces = false
            // a Hermes Music page that can't load (no network, Tailscale off, Hermes restarting) goes
            // back to the welcome screen instead of staying dark and empty
            let guardian = SourNavigationGuard(original: web.navigationDelegate) { [weak web] error in
                if let web = web { SourBridgeViewController.pageFailed(web, error) }
            }
            navGuard = guardian
            web.navigationDelegate = guardian
        }
        forgetIfNotHermes()
    }

    // The app before 0.10.9 took any web page for Hermes Music: an address typed without :3340 (the
    // Umbrel's own dashboard) left it stuck there. If the saved one has no port and something other
    // than Hermes Music answers, forget it and go back to the welcome screen. (An address with a port
    // is never dropped, so a hotel Wi-Fi login page can't make the app forget it.)
    private func forgetIfNotHermes() {
        guard let saved = UserDefaults.standard.string(forKey: Self.serverKey), saved.hasSuffix("/app/"),
              let url = URL(string: saved), url.port == nil,
              let status = URL(string: String(saved.dropLast(5)) + "/api/status") else { return }
        var request = URLRequest(url: status)
        request.timeoutInterval = 8
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard error == nil, let http = response as? HTTPURLResponse else { return }
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            if http.statusCode == 200, let json = json, json["workers"] != nil || json["library"] != nil { return }
            UserDefaults.standard.removeObject(forKey: Self.serverKey)
            Self.lastFailure = nil
            DispatchQueue.main.async { _ = self?.bridge?.webView?.load(URLRequest(url: URL(string: "capacitor://localhost/")!)) }
        }.resume()
    }

    // only real network trouble on the Hermes Music page itself: a cancelled load or an outside page
    // that fails stays where it is
    static func pageFailed(_ web: WKWebView, _ error: Error) {
        let e = error as NSError
        guard e.domain == NSURLErrorDomain, e.code != NSURLErrorCancelled,
              let saved = UserDefaults.standard.string(forKey: serverKey).flatMap({ URL(string: $0) }) else { return }
        if let failing = (e.userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? web.url,
           failing.host != saved.host || failing.port != saved.port { return }
        lastFailure = e.localizedDescription
        DispatchQueue.main.async { _ = web.load(URLRequest(url: URL(string: "capacitor://localhost/")!)) }
    }
}

// Hands every page event to Capacitor's own handler; a page that fails to load also goes to `failed`
final class SourNavigationGuard: NSObject, WKNavigationDelegate {
    private let original: WKNavigationDelegate?
    private let failed: (Error) -> Void

    init(original: WKNavigationDelegate?, failed: @escaping (Error) -> Void) {
        self.original = original
        self.failed = failed
    }

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (original?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if let original = original, original.responds(to: aSelector) { return original }
        return super.forwardingTarget(for: aSelector)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        original?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
        failed(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        original?.webView?(webView, didFail: navigation, withError: error)
        failed(error)
    }
}
