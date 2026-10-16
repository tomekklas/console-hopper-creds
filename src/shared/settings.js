// User settings (chrome.storage.sync) and the organisation kill switch
// (chrome.storage.managed). Credentials never go through here.

import { DEFAULT_PROFILE_PATTERN } from "./formats.js";

export const DEFAULTS = Object.freeze({
  // "saml" follows the assertion's SessionDuration (falling back to 1 h);
  // otherwise a number of seconds, 900–43200.
  duration: "saml",
  profilePattern: DEFAULT_PROFILE_PATTERN,
  // "" = the sign-in page's region when it has one, else us-east-1.
  region: "",
  os: "sh",
  extraFormat: "configure",
  // [{ name, body }] — see formats.applyTemplate.
  templates: [],
});

export const SETTINGS_KEY = "chc_settings";

export function normalizeSettings(raw) {
  const s = { ...DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
  if (s.duration !== "saml") {
    const n = parseInt(s.duration, 10);
    s.duration = Number.isFinite(n)
      ? Math.min(43200, Math.max(900, n))
      : "saml";
  }
  s.profilePattern = String(s.profilePattern || DEFAULT_PROFILE_PATTERN).slice(
    0,
    80
  );
  s.region = String(s.region || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 32);
  if (!["sh", "win", "ps", "fish"].includes(s.os)) s.os = "sh";
  s.extraFormat = String(s.extraFormat || "configure").slice(0, 32);
  s.templates = Array.isArray(s.templates)
    ? s.templates
        .filter((t) => t && typeof t === "object")
        .map((t) => ({
          name: String(t.name || "").slice(0, 40),
          body: String(t.body || "").slice(0, 4000),
        }))
        .filter((t) => t.name && t.body)
        .slice(0, 20)
    : [];
  return s;
}

export async function loadSettings() {
  try {
    const got = await chrome.storage.sync.get(SETTINGS_KEY);
    return normalizeSettings(got[SETTINGS_KEY]);
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(settings) {
  const s = normalizeSettings(settings);
  await chrome.storage.sync.set({ [SETTINGS_KEY]: s });
  return s;
}

// False only when an administrator set `enabled: false` by policy.
export async function isEnabledByPolicy() {
  try {
    if (!chrome.storage.managed) return true;
    const got = await chrome.storage.managed.get("enabled");
    return got.enabled !== false;
  } catch (e) {
    return true;
  }
}
