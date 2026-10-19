#!/usr/bin/env bash
# Sign the picker tab in again through mock-saml (localhost:4000): AWS stops
# accepting a SAML response for new keys a few minutes after it was issued,
# and the Keys buttons grey out. Opens the login form in the given Chrome
# window's active tab, waits for its Sign In button (the dev server can take
# a while to compile the page), submits it, and waits for the add-on's
# toolbar. Exits non-zero when any step times out, so a chain stops there.
#
#   resignin.sh <chrome-window-id>
set -euo pipefail
WIN="$1"
out=$(osascript <<OSA
tell application "Google Chrome"
  set w to window id $WIN
  set URL of active tab of w to "http://localhost:4000/saml/login"
  set clicked to "no"
  repeat 40 times
    delay 0.5
    try
      set clicked to execute (active tab of w) javascript "(function(){var b=document.querySelector('form button[type=submit]');if(!b)return 'no';b.click();return 'yes'})()"
    end try
    if clicked is "yes" then exit repeat
  end repeat
  if clicked is not "yes" then return "timed out waiting for the login form"
  repeat 40 times
    delay 1
    try
      set r to execute (active tab of w) javascript "(function(){var n=document.getElementById('chc_toolbar');return n?n.innerText.replace(/\\\\n/g,' · '):''})()"
      if r is not "" and r is not missing value then return r
    end try
  end repeat
  return "timed out waiting for the picker"
end tell
OSA
)
echo "$out"
[[ "$out" != timed\ out* ]]
