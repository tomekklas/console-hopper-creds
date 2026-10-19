// The add-on's settings, as a panel on the sign-in page (a closed shadow
// root), so they sit where the user already is. The options page carries
// the same fields for chrome://extensions.

import { TEMPLATE_KEYS } from "../shared/formats.js";
import { normalizeSettings } from "../shared/settings.js";
import { DIALOG_CSS, SETTINGS_CSS } from "./styles.js";
import { followHopperTheme } from "./theme.js";

const h = (s) =>
  String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const DURATIONS = [
  [
    "saml",
    "what your identity provider asks for (SessionDuration), else 1 hour",
  ],
  ["900", "15 minutes"],
  ["3600", "1 hour"],
  ["7200", "2 hours"],
  ["14400", "4 hours"],
  ["28800", "8 hours"],
  ["43200", "12 hours"],
];

export function openSettingsPanel({ settings, saveSettings }) {
  if (document.querySelector('[data-chc="settings"]')) return null;
  const host = document.createElement("div");
  host.setAttribute("data-chc", "settings");
  const root = host.attachShadow({ mode: "closed" });
  document.body.appendChild(host);
  const theme = followHopperTheme(root);

  let templates = (settings.templates || []).map((t) => ({ ...t }));
  // What the fields show: the saved values until the person edits them. Kept
  // apart from `settings` so adding or removing a template (which redraws the
  // form) does not throw unsaved edits away.
  let draft = {
    duration: String(settings.duration),
    profilePattern: settings.profilePattern,
    region: settings.region,
  };
  let status = "";

  const close = () => {
    theme.stop();
    document.removeEventListener("keydown", onKey, true);
    host.remove();
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener("keydown", onKey, true);

  const templateRows = () =>
    templates
      .map(
        (t, i) => `
        <div class="tpl" data-i="${i}">
          <div class="row">
            <input type="text" class="in tplName" maxlength="40" placeholder="name shown on the chip" value="${h(t.name)}">
            <button type="button" class="ghost danger tplDel">Remove</button>
          </div>
          <textarea class="in tplBody" maxlength="4000" placeholder="e.g. mytool login --key {{accessKeyId}} --secret {{secretAccessKey}} --token {{sessionToken}}">${h(t.body)}</textarea>
        </div>`
      )
      .join("");

  const render = () => {
    const dur = String(draft.duration);
    root.innerHTML = `<style>${DIALOG_CSS}${SETTINGS_CSS}</style>
      <div class="scrim">
        <div class="box">
          <div class="head" style="--stripe:#b5701c">
            <div style="min-width:0;flex:1">
              <h1>Creds settings</h1>
              <div class="sub">What the Keys dialog shows and how long the keys last. Keys themselves are never stored.</div>
            </div>
            <button type="button" class="x" data-act="close" aria-label="Close">×</button>
          </div>
          <form class="body" data-act="form">
            <div class="sec">
              <h2>Session length</h2>
              <label class="lbl" for="chc_duration">Ask AWS STS for</label>
              <select id="chc_duration" class="in">
                ${DURATIONS.map(([v, l]) => `<option value="${v}" ${dur === v ? "selected" : ""}>${h(l)}</option>`).join("")}
              </select>
              <div class="sub">A role allows at most its own maximum session duration. When AWS refuses the length asked for, the add-on retries at 1 hour, then 15 minutes, and says so in the dialog.</div>
            </div>
            <div class="sec">
              <h2>Profiles</h2>
              <label class="lbl" for="chc_pattern">Profile name pattern</label>
              <input id="chc_pattern" class="in" type="text" maxlength="80" value="${h(draft.profilePattern)}" placeholder="{account}-{role}">
              <div class="sub">Placeholders: <span class="mono">{account}</span> (the name shown on the picker), <span class="mono">{accountId}</span>, <span class="mono">{role}</span>. Other characters than letters, digits, <span class="mono">_ . @ -</span> become <span class="mono">-</span>.</div>
              <label class="lbl" for="chc_region">Region for env vars, profiles and the STS endpoint</label>
              <input id="chc_region" class="in" type="text" maxlength="32" value="${h(draft.region)}" placeholder="empty: the sign-in page's region">
              <div class="sub">Empty means the region of the sign-in page (<span class="mono">eu-west-1.signin.aws.amazon.com</span> gives <span class="mono">eu-west-1</span>), or <span class="mono">us-east-1</span> on the global page.</div>
            </div>
            <div class="sec">
              <h2>Your templates</h2>
              <div class="sub">Any format the built-in list lacks. Each becomes a chip under “More formats”. Placeholders: <span class="mono">${TEMPLATE_KEYS.map((k) => `{{${k}}}`).join(" ")}</span></div>
              <div class="tpls">${templateRows()}</div>
              <div><button type="button" class="ghost" data-act="add">Add template</button></div>
            </div>
          </form>
          <div class="foot">
            <div class="sub">${h(status)}</div>
            <div class="actions">
              <button type="button" class="ghost" data-act="close">Close</button>
              <button type="button" class="primary" data-act="save">Save</button>
            </div>
          </div>
        </div>
      </div>`;
    theme.apply();
    wire();
  };

  const readFields = () => {
    const dur = root.querySelector("#chc_duration");
    if (!dur) return;
    draft = {
      duration: dur.value,
      profilePattern: root.querySelector("#chc_pattern").value,
      region: root.querySelector("#chc_region").value,
    };
  };

  const readTemplates = () => {
    templates = [...root.querySelectorAll(".tpl")].map((el) => ({
      name: el.querySelector(".tplName").value,
      body: el.querySelector(".tplBody").value,
    }));
  };

  const wire = () => {
    const scrim = root.querySelector(".scrim");
    scrim.addEventListener("click", (e) => {
      if (e.target === scrim) close();
    });
    root
      .querySelectorAll('[data-act="close"]')
      .forEach((el) => el.addEventListener("click", close));
    root.querySelector('[data-act="form"]').addEventListener("submit", (e) => {
      e.preventDefault();
      save();
    });
    root.querySelector('[data-act="save"]').addEventListener("click", save);
    root.querySelector('[data-act="add"]').addEventListener("click", () => {
      readFields();
      readTemplates();
      templates.push({ name: "", body: "" });
      status = "";
      render();
    });
    root.querySelectorAll(".tplDel").forEach((b) =>
      b.addEventListener("click", () => {
        readFields();
        readTemplates();
        templates.splice(Number(b.closest(".tpl").getAttribute("data-i")), 1);
        status = "";
        render();
      })
    );
  };

  const save = async () => {
    readFields();
    readTemplates();
    const next = normalizeSettings({ ...settings, ...draft, templates });
    try {
      await saveSettings(next);
      Object.assign(settings, next);
      templates = next.templates.map((t) => ({ ...t }));
      draft = {
        duration: String(next.duration),
        profilePattern: next.profilePattern,
        region: next.region,
      };
      status = "Saved.";
    } catch (e) {
      status = "Could not save: " + (e && e.message ? e.message : String(e));
    }
    render();
  };

  render();
  return { close };
}
