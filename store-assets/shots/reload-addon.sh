#!/usr/bin/env bash
# Reload the unpacked Console Hopper Creds in Chrome, the same as its reload
# button at chrome://extensions: needed after `npm run build` or after
# patching dist/ for screenshots. Uses an open chrome://extensions tab
# (opens one in the front window if there is none). Prints "reloaded: ok".
set -euo pipefail
osascript -l JavaScript <<'JXA'
var c = Application("Google Chrome");
var tab = null;
c.windows().forEach(function (w) {
  w.tabs().forEach(function (t) { if (!tab && /^chrome:\/\/extensions/.test(t.url())) tab = t; });
});
if (!tab) {
  tab = c.Tab({ URL: "chrome://extensions/" });
  c.windows[0].tabs.push(tab);
  delay(1.5);
}
c.execute(tab, { javascript:
  "(function(){chrome.developerPrivate.getExtensionsInfo({includeDisabled:true},function(list){" +
  "var e=list.filter(function(x){return x.name===\"Console Hopper Creds\"})[0];" +
  "if(!e){document.title=\"reloaded: not installed\";return;}" +
  "chrome.developerPrivate.reload(e.id,{failQuietly:false},function(){" +
  "document.title=\"reloaded: \"+(chrome.runtime.lastError?chrome.runtime.lastError.message:\"ok\")})});return 1})()" });
var r = "";
for (var i = 0; i < 20 && r.indexOf("reloaded:") !== 0; i++) { delay(0.25); r = tab.title(); }
c.reload(tab);
r || "reloaded: no answer";
JXA
