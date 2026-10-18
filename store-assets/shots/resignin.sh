#!/usr/bin/env bash
# Sign the picker tab in again through mock-saml (localhost:4000): AWS stops
# accepting a SAML response for new keys a few minutes after it was issued,
# and the Keys buttons grey out. Opens the login form in the given Chrome
# window's active tab, submits it, and waits for the add-on's toolbar.
#
#   resignin.sh <chrome-window-id>
set -euo pipefail
WIN="$1"
osascript <<OSA
tell application "Google Chrome"
  set w to window id $WIN
  set URL of active tab of w to "http://localhost:4000/saml/login"
  delay 2.5
  execute (active tab of w) javascript "document.querySelector('form button[type=submit]').click(); 'submitted'"
  repeat 30 times
    delay 1
    try
      set r to execute (active tab of w) javascript "(function(){var n=document.getElementById('chc_toolbar')||document.getElementById('chc_toolbar_plain');return n?n.innerText.replace(/\\\\n/g,' · '):''})()"
      if r is not "" then return r
    end try
  end repeat
  return "timed out waiting for the picker"
end tell
OSA
