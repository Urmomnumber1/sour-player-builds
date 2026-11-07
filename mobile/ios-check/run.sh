#!/bin/bash
# The iPhone simulator check, on a Mac (GitHub Actions: ios-check.yml in sour-player-builds). The app
# has to be built for the simulator into $RUNNER_TEMP/dd first.
#   run.sh new   this app and web build (fails the run when a check fails)
#   run.sh old   the network settings and web build friends have now, to compare (never fails)
set -x
VARIANT="${1:-new}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SHOTS="$RUNNER_TEMP/shots"
mkdir -p "$SHOTS"
APP="$RUNNER_TEMP/dd/Build/Products/Release-iphonesimulator/App.app"

# what the stand-in Hermes Music serves at /app/: this web build, or for "old" the 0.10.8 one
WEB="$ROOT/out/web"
if [ "$VARIANT" = old ]; then
    mkdir -p "$RUNNER_TEMP/oldweb"
    curl -sL -o "$RUNNER_TEMP/oldweb.tgz" https://github.com/Urmomnumber1/feishin/releases/download/v0.10.8/sour-web.tar.gz
    tar -xzf "$RUNNER_TEMP/oldweb.tgz" -C "$RUNNER_TEMP/oldweb"
    WEB="$RUNNER_TEMP/oldweb"
fi

# a Tailscale-style name (with dots) for this Mac
echo "127.0.0.1 hermes.sourcheck.ts.net" | sudo tee -a /etc/hosts
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder || true

# the mock music server (long names, like real soundtracks), Hermes Music, and a page that isn't it
PORT=4533 LONG=1 node "$HERE/mock-subsonic.cjs" > "$SHOTS/mock.log" 2>&1 &
PORT=3060 WEB="$WEB" node "$HERE/fake-hermes.mjs" > "$SHOTS/hermes.log" 2>&1 &
HERMES=$!
PORT=3070 IMPOSTOR=1 node "$HERE/fake-hermes.mjs" > "$SHOTS/impostor.log" 2>&1 &
sleep 2
curl -s -m 5 http://hermes.sourcheck.ts.net:3060/api/status
echo
curl -s -m 5 -o /dev/null -w "app page %{http_code}\n" http://hermes.sourcheck.ts.net:3060/app/

# the newest iPhone (base model, with the Dynamic Island) on the newest iOS, on-screen keyboard
defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false
xcrun simctl list devices available -j > "$RUNNER_TEMP/devices.json"
UDID=$(python3 - "$RUNNER_TEMP/devices.json" <<'PY'
import json, re, sys
devices = json.load(open(sys.argv[1]))["devices"]
best = None
for runtime, items in devices.items():
    if ".iOS-" not in runtime:
        continue
    version = tuple(int(x) for x in re.findall(r"\d+", runtime.split(".iOS-")[1]))
    for d in items:
        m = re.fullmatch(r"iPhone (\d+)( Pro)?", d["name"])
        if not m:
            continue
        key = (version, int(m.group(1)), m.group(2) is None)
        if best is None or key > best[0]:
            best = (key, d["udid"], d["name"], runtime)
if best:
    print(best[1])
    print("simulator:", best[2], best[3], file=sys.stderr)
PY
)
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b
xcrun simctl install "$UDID" "$APP"

brew install xcodegen
(cd "$HERE" && xcodegen generate)

run_test() {
    TEST_RUNNER_SHOTS="$SHOTS" TEST_RUNNER_VARIANT="$VARIANT" xcodebuild test -project "$HERE/SourCheck.xcodeproj" \
        -scheme SourCheck -destination "id=$UDID" -only-testing:"SourCheckUITests/SourPhoneTests/$1" \
        -resultBundlePath "$RUNNER_TEMP/$1.xcresult" > "$SHOTS/$1.log" 2>&1
    local code=$?
    grep -E "SOURCHECK|error:|Test Case|\*\* TEST" "$SHOTS/$1.log" | tail -80
    echo "$1 finished with $code"
}

run_test testIphone
if [ "$VARIANT" = new ]; then
    # Hermes Music goes away; it comes back 10 seconds after the app has shown that it noticed
    kill "$HERMES"
    (
        for _ in $(seq 1 300); do [ -f "$SHOTS/offline-seen" ] && break; sleep 1; done
        sleep 10
        PORT=3060 WEB="$WEB" node "$HERE/fake-hermes.mjs" > "$SHOTS/hermes-again.log" 2>&1
    ) &
    run_test testOffline
fi

xcrun simctl spawn "$UDID" log show --last 30m --style compact --predicate 'process == "App"' > "$SHOTS/app-log.txt" 2>&1 || true
cat "$SHOTS/notes.txt"
if [ "$VARIANT" = new ] && { grep -q FAIL "$SHOTS/notes.txt" || ! grep -q "opens by itself" "$SHOTS/notes.txt"; }; then
    exit 1
fi
exit 0
