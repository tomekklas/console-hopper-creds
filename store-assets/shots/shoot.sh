#!/usr/bin/env bash
# Capture one staged scene from the live role picker as a 1280x800 store
# screenshot.
#
#   shoot.sh <chrome-window-id> <out.png> [scene]
#
# scene: picker (default) | keys | all | plain | settings — see stage.js.
# The window id comes from Chrome's AppleScript dictionary, e.g.
#   osascript -e 'tell application "Google Chrome" to get id of front window'
#
# Everything that needs Chrome focused happens in ONE osascript call:
# activating Chrome from a separate call hands focus back to the terminal and
# you screenshot that instead. stage.js runs after activation because Console
# Hopper focuses its search box on window-activate. It runs up to five
# passes: the first stages the picker and opens the scene (a click that calls
# STS), later ones wait for the dialog, then freeze and rewrite it; the last
# re-pins everything and runs the leak check on the final frame.
set -euo pipefail

WIN="$1"
OUT="$2"
SCENE="${3:-picker}"
# STAGE_ONLY=1: stage and leak-check the active tab without bringing Chrome
# forward and without a screen capture (take the picture from inside Chrome
# instead). Needed when the display is too small for the frame or someone is
# using the machine: screencapture grabs whatever is in front.
STAGE_ONLY="${STAGE_ONLY:-0}"
if [[ "$STAGE_ONLY" == 1 ]]; then FRONT="--"; else FRONT=""; fi
# FULLSCREEN=1: for a display too short for a 1280x802 viewport plus the
# toolbar (a laptop's 1280x832). Put the tab in the page's own full screen
# first (document.documentElement.requestFullscreen() from a real click; a
# script alone is refused), which gives the page the whole screen with no
# toolbar; the window is then not resized. Leave it with
# document.exitFullscreen().
FULLSCREEN="${FULLSCREEN:-0}"
if [[ "$FULLSCREEN" == 1 ]]; then SIZE="--"; CURSOR_Y=822; else SIZE=""; CURSOR_Y=2100; fi
HERE="$(cd "$(dirname "$0")" && pwd)"
VW=1280
VH=802

# Hold the display awake; a locked or sleeping screen makes screencapture fail
# or return a solid black frame.
caffeinate -d -u -t 90 &
CAFF=$!
trap 'kill $CAFF 2>/dev/null || true' EXIT

# Park the OS cursor below the frame, away from the right edge (Console
# Hopper's side menu slides out on a right-edge hover).
CURSOR_Y=$CURSOR_Y python3 - <<'PY'
import ctypes
cg = ctypes.cdll.LoadLibrary(
    "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices")
class P(ctypes.Structure):
    _fields_ = [("x", ctypes.c_double), ("y", ctypes.c_double)]
cg.CGWarpMouseCursorPosition(P(640.0, float(__import__('os').environ['CURSOR_Y'])))
PY

out=$(osascript <<OSA
set js to "var SCENE = \"$SCENE\";" & (read POSIX file "$HERE/stage.js" as «class utf8»)
set probe to "JSON.stringify({sx:window.screenX,sy:window.screenY,iw:innerWidth,ih:innerHeight,oh:outerHeight})"
tell application "Google Chrome"
  $FRONT activate
  set w to window id $WIN
  $FRONT set index of w to 1
  -- size the OUTER window, then correct for the window chrome so the INNER
  -- viewport lands on exactly ${VW}x${VH}
  $SIZE set bounds of w to {0, 120, $VW, 120 + $VH + 121}
  $SIZE delay 0.4
  $SIZE set m to execute (active tab of w) javascript probe
  $SIZE set AppleScript's text item delimiters to {"\"iw\":", ",\"ih\":", ",\"oh\":"}
  $SIZE set iw to (text item 2 of m) as integer
  $SIZE set ih to (text item 3 of m) as integer
  $SIZE set AppleScript's text item delimiters to {""}
  $SIZE set bounds of w to {0, 120, $VW + ($VW - iw), 120 + $VH + 121 + ($VH - ih)}
  -- Bringing the window forward makes Console Hopper re-read its sessions;
  -- let that land before staging, or it repaints real data over the staged
  -- text.
  delay 3
  set stageOut to execute (active tab of w) javascript js
  repeat 4 times
    if stageOut does not contain "\"pending\":\"" then exit repeat
    delay 2
    set stageOut to execute (active tab of w) javascript js
  end repeat
  delay 0.5
  set stageOut to execute (active tab of w) javascript js
  set geomOut to execute (active tab of w) javascript probe
  return geomOut & "@@" & stageOut
end tell
OSA
)
geom="${out%%@@*}"
stage="${out##*@@}"
echo "stage: $stage"

rect=$(python3 - "$geom" "$stage" <<'PY'
import json, sys
g, s = json.loads(sys.argv[1]), json.loads(sys.argv[2])
if s.get("pending"):
    sys.exit("REFUSING: still %s" % s["pending"])
if s.get("leaks"):
    sys.exit("REFUSING: real data still visible: %s" % s["leaks"])
if not s.get("framing", {}).get("ok"):
    sys.exit("REFUSING: framing not ok: %s" % s.get("framing"))
shot = s["framing"]["shot"]
vx, vy = int(g["sx"]), int(g["sy"] + (g["oh"] - g["ih"]))
print(vx + shot["x"], vy + shot["y"], shot["w"], shot["h"])
PY
)
if [[ "$STAGE_ONLY" == 1 ]]; then
  echo "staged, not captured (STAGE_ONLY=1)"
  exit 0
fi
read -r X Y W H <<<"$rect"
echo "capture rect: ${X},${Y} ${W}x${H}"

# screencapture grabs whatever is in front. Another app taking focus (the
# terminal this runs in, a notification) has put the wrong window in a shot,
# so check that Chrome is the front app right before and right after.
chrome_front() { [[ "$(osascript -e 'tell application "Google Chrome" to get frontmost')" == true ]]; }
if ! chrome_front; then
  echo "REFUSING: Chrome is not the front app; nothing captured" >&2
  exit 1
fi
screencapture -x -R"${X},${Y},${W},${H}" "$HERE/raw.png"
if ! chrome_front; then
  rm -f "$HERE/raw.png"
  echo "REFUSING: Chrome lost the front during the capture; the image was deleted" >&2
  exit 1
fi
# 1280x800 on a 1x display; on a Retina display the same frame comes out
# at 2560x1600, and an exact 2:1 downscale gives the store's size.
cp "$HERE/raw.png" "$OUT"
if [[ "$(sips -g pixelWidth "$OUT" | awk '/pixelWidth/{print $2}')" == "$((W * 2))" ]]; then
  sips -z "$H" "$W" "$OUT" >/dev/null
fi
sips -g pixelWidth -g pixelHeight "$OUT" | tail -2
