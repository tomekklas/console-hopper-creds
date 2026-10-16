// Console Hopper Creds — service worker.
//
// The one job here: take an assertion and a list of roles from the content
// script, call AWS STS for each, and hand the result back. The call runs
// here rather than in the content script because the sign-in page's CSP
// forbids a page-context fetch to STS. STS allows any origin (CORS), so no
// host permission is declared. Nothing is stored or logged.

import { assumeMany, stsEndpoint } from "./src/shared/sts.js";
import { isEnabledByPolicy } from "./src/shared/settings.js";

const MAX_ROLES = 200;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "chc_assume") return false;
  (async () => {
    if (!(await isEnabledByPolicy())) {
      sendResponse({ ok: false, error: "disabled by policy" });
      return;
    }
    const roles = Array.isArray(msg.roles) ? msg.roles.slice(0, MAX_ROLES) : [];
    if (!roles.length || typeof msg.assertion !== "string" || !msg.assertion) {
      sendResponse({ ok: false, error: "nothing to assume" });
      return;
    }
    const endpoint = stsEndpoint({ partition: msg.partition || "aws", region: msg.region || "" });
    const results = await assumeMany(fetch, roles, {
      endpoint,
      assertion: msg.assertion,
      durationSeconds: msg.durationSeconds,
    });
    sendResponse({ ok: true, endpoint, results });
  })().catch((e) => sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }));
  return true;
});
