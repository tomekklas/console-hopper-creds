// The Keys dialog: one role, or every role, with each way of handing the
// credentials over. Lives in a closed shadow root on the sign-in page.
// Credentials exist only in this module's closure while the dialog is open;
// closing it drops them.

import {
  OS_TABS,
  EXTRA_FORMATS,
  envLines,
  unsetLines,
  profileBlock,
  renderExtra,
  applyTemplate,
  bundleEnv,
  bundleExtra,
  credentialsFile,
  configFile,
  profileNameFor,
} from "../shared/formats.js";
import { explainStsError } from "../shared/sts.js";
import { DIALOG_CSS } from "./styles.js";

const KEY_SVG =
  '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"></circle><path d="M10.8 12.2 21 2M15 8l3 3M18 5l3 3"></path></svg>';

const h = (s) =>
  String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const mask = (s) => "•".repeat(Math.min(40, String(s || "").length));
const maskToken = (s) => `${mask(s)}…(${String(s || "").length} chars)`;

const fmtTime = (iso) => {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return iso || "";
  const d = new Date(t);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const mins = Math.round((t - Date.now()) / 60000);
  const left = mins >= 90 ? `${Math.round(mins / 60)} h` : `${mins} min`;
  return `${hm} (${left})`;
};

const durationLabel = (s) =>
  s >= 3600
    ? `${Math.round((s / 3600) * 10) / 10} h`
    : `${Math.round(s / 60)} min`;

async function copyText(root, text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    root.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

function downloadText(root, filename, text) {
  const blob = new Blob([text], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  root.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ctx for the formats module from one item + its STS result.
function ctxFor(item, result, settings, region) {
  const c = result.credentials;
  const base = {
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    sessionToken: c.sessionToken,
    expiration: c.expiration || "",
    region,
    accountId: item.accountId,
    accountName: item.accountName || item.accountId,
    roleName: item.roleName,
    roleArn: item.roleArn,
    profileName: "",
  };
  base.profileName = profileNameFor(settings.profilePattern, base);
  return base;
}

export function openDialog(opts) {
  const {
    items,
    settings,
    saveSettings,
    exchange,
    region,
    roleSessionName,
    openSettings,
  } = opts;
  const host = document.createElement("div");
  host.setAttribute("data-chc", "dialog");
  // Progress for the page to see (the shadow root is closed): "loading", then
  // "ok=N fail=M", or "error". Counts only; never anything from a result.
  host.setAttribute("data-chc-state", "loading");
  const root = host.attachShadow({ mode: "closed" });
  document.body.appendChild(host);

  const state = {
    os: settings.os || "sh",
    extra: settings.extraFormat || "configure",
    reveal: false,
    results: null, // [{ item, result, ctx }]
    view: items.length === 1 ? "one" : "all",
    current: 0,
    copied: "",
    closed: false,
  };

  let ticker = 0;
  const close = () => {
    if (state.closed) return;
    state.closed = true;
    clearInterval(ticker);
    document.removeEventListener("keydown", onKey, true);
    state.results = null;
    host.remove();
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener("keydown", onKey, true);

  const render = () => {
    if (state.closed) return;
    root.innerHTML = `<style>${DIALOG_CSS}</style><div class="scrim" part="scrim">${body()}</div>`;
    wire();
  };

  const body = () => {
    if (!state.results) return loadingBox();
    if (state.view === "one") return oneBox(state.results[state.current]);
    return allBox();
  };

  const loadingBox = () => `
    <div class="box">
      <div class="head">${KEY_SVG}<h1>Asking AWS STS for ${items.length === 1 ? "keys" : `keys to ${items.length} roles`}…</h1><button type="button" class="x" data-act="close" aria-label="Close">×</button></div>
      <div class="loading">${state.error ? `<div class="err">${h(state.error)}</div>` : "One call per role, in parallel. Nothing is stored."}</div>
    </div>`;

  const extraChips = () => {
    const builtIn = EXTRA_FORMATS.map(
      (f) =>
        `<button type="button" class="chip ${state.extra === f.id ? "on" : ""}" data-extra="${h(f.id)}">${h(f.label)}</button>`
    );
    const custom = (settings.templates || []).map(
      (t, i) =>
        `<button type="button" class="chip ${state.extra === `tpl:${i}` ? "on" : ""}" data-extra="tpl:${i}" title="Your template">${h(t.name)}</button>`
    );
    return builtIn.concat(custom).join("");
  };

  const extraText = (ctxs) => {
    if (state.extra.startsWith("tpl:")) {
      const t = (settings.templates || [])[Number(state.extra.slice(4))];
      if (!t) return "";
      return ctxs.map((c) => applyTemplate(t.body, c)).join("\n\n");
    }
    return ctxs.length === 1
      ? renderExtra(state.extra, ctxs[0])
      : bundleExtra(state.extra, ctxs);
  };

  const masked = (ctx) => ({
    ...ctx,
    secretAccessKey: mask(ctx.secretAccessKey),
    sessionToken: maskToken(ctx.sessionToken),
  });
  const shown = (ctx) => (state.reveal ? ctx : masked(ctx));

  const copyBtn = (key, label = "Copy") =>
    `<button type="button" class="copy ${state.copied === key ? "done" : ""}" data-copy="${h(key)}">${state.copied === key ? "Copied" : h(label)}</button>`;

  const oneBox = (entry) => {
    const { item, result } = entry;
    if (!result.ok) {
      return `
        <div class="box" style="--stripe:${h(item.stripe || "#c7ccd1")}">
          <div class="head">${KEY_SVG}<div><h1>Keys for ${h(item.accountName)} · ${h(item.roleName)}</h1></div><button type="button" class="x" data-act="close" aria-label="Close">×</button></div>
          <div class="body"><div class="err"><b>${h(result.code || "Error")}</b> — ${h(explainStsError(result))}</div></div>
          <div class="foot"><div class="sub">Nothing was issued.</div><div class="actions">${state.results.length > 1 ? '<button type="button" class="ghost" data-act="back">Back to all roles</button>' : ""}<button type="button" class="primary" data-act="close">Done</button></div></div>
        </div>`;
    }
    const ctx = entry.ctx;
    const v = shown(ctx);
    const os = state.os;
    const envText = envLines(v, os);
    const tabs = OS_TABS.map(
      (t) =>
        `<button type="button" class="tab ${os === t.id ? "on" : ""}" data-os="${t.id}">${h(t.label)}</button>`
    ).join("");
    const shortened = result.shortened
      ? `<span class="pill warn">shortened to ${durationLabel(result.durationSeconds)} (asked ${durationLabel(result.requestedSeconds)})</span>`
      : "";
    return `
      <div class="box" style="--stripe:${h(item.stripe || "#c7ccd1")}">
        <div class="head">${KEY_SVG}
          <div style="min-width:0;flex:1">
            <h1>Keys for ${h(item.accountName)} · ${h(item.roleName)}</h1>
            <div class="meta">
              <span class="pill mono">${h(item.accountId)}</span>
              ${item.env ? `<span class="pill env" style="color:${h(item.stripe)};border-color:${h(item.stripe)}">${h(item.env)}</span>` : ""}
              <span class="pill">expires ${h(fmtTime(ctx.expiration))}</span>
              ${shortened}
              ${roleSessionName ? `<span class="pill">session name ${h(roleSessionName)}</span>` : ""}
              <span class="pill">STS ${h(region)}</span>
            </div>
          </div>
          <button type="button" class="x" data-act="close" aria-label="Close">×</button>
        </div>
        <div class="body">
          <div class="row">
            <div class="tabs">${tabs}</div>
            <label class="chk"><input type="checkbox" data-act="reveal" ${state.reveal ? "checked" : ""}> Reveal secrets</label>
          </div>
          <div class="sec">
            <div class="row"><div><h2>Option 1: Environment variables</h2><div class="sub">Override every profile for the current shell. The expiry line lets the CLI stop before AWS does.</div></div>${copyBtn("env")}</div>
            <pre>${h(envText)}</pre>
            <div class="sub">Undo: <span class="mono">${h(unsetLines(ctx, os))}</span></div>
          </div>
          <div class="sec">
            <div class="row"><div><h2>Option 2: Profile for ~/.aws/credentials</h2><div class="sub">Then <span class="mono">--profile ${h(ctx.profileName)}</span>. Profile name from your pattern <span class="mono">${h(settings.profilePattern)}</span>.</div></div>${copyBtn("profile")}</div>
            <pre>${h(profileBlock(v))}</pre>
          </div>
          <div class="sec">
            <div class="row"><div><h2>Option 3: Individual values</h2><div class="sub">For SDK constructors and GUI tools.</div></div></div>
            <div class="fields">
              <div class="field"><span>Access key ID</span><span class="val">${h(ctx.accessKeyId)}</span>${copyBtn("ak")}</div>
              <div class="field"><span>Secret access key</span><span class="val">${h(v.secretAccessKey)}</span>${copyBtn("sk")}</div>
              <div class="field"><span>Session token</span><span class="val">${h(v.sessionToken)}</span>${copyBtn("tk")}</div>
              <div class="field"><span>Expiration</span><span class="val">${h(ctx.expiration)}</span><span></span></div>
            </div>
          </div>
          <div class="sec">
            <div class="row"><h2>More formats</h2>${copyBtn("extra")}</div>
            <div class="chips">${extraChips()}</div>
            <pre>${h(extraText([v]))}</pre>
          </div>
        </div>
        <div class="foot">
          <div class="sub">Nothing is stored. These keys vanish when this closes. CloudTrail records them under the session name${roleSessionName ? ` <span class="mono">${h(roleSessionName)}</span>` : ""}.</div>
          <div class="actions">
            ${state.results.length > 1 ? '<button type="button" class="ghost" data-act="back">All roles</button>' : ""}
            <button type="button" class="ghost" data-act="download-one">Download credentials file</button>
            ${openSettings ? '<button type="button" class="ghost" data-act="settings">Settings</button>' : ""}
            <button type="button" class="primary" data-act="close">Done</button>
          </div>
        </div>
      </div>`;
  };

  const allBox = () => {
    const rows = state.results;
    const okRows = rows.filter((r) => r.result.ok);
    const shortenedN = okRows.filter((r) => r.result.shortened).length;
    const failedN = rows.length - okRows.length;
    // Every call failed for one reason (most often a sign-in too old for
    // STS): say it once above the table, not on each of the rows.
    const reasons = new Set(
      rows.filter((r) => !r.result.ok).map((r) => explainStsError(r.result))
    );
    const shared =
      rows.length > 1 && !okRows.length && reasons.size === 1
        ? [...reasons][0]
        : "";
    const body = rows
      .map((r, i) => {
        const { item, result } = r;
        const status = !result.ok
          ? `<span class="pill crit">✕ ${h(result.code || "Error")}</span>`
          : result.shortened
            ? `<span class="pill warn" title="Asked for ${durationLabel(result.requestedSeconds)}; this role allows at most ${durationLabel(result.durationSeconds)}">✓ ${durationLabel(result.durationSeconds)} · asked ${durationLabel(result.requestedSeconds)}</span>`
            : `<span class="pill ok">✓ ${durationLabel(result.durationSeconds)}</span>`;
        const actions = result.ok
          ? `<button type="button" class="mini ${state.copied === `env:${i}` ? "done" : ""}" data-copy="env:${i}">${state.copied === `env:${i}` ? "Copied" : "env"}</button>` +
            `<button type="button" class="mini ${state.copied === `profile:${i}` ? "done" : ""}" data-copy="profile:${i}">${state.copied === `profile:${i}` ? "Copied" : "profile"}</button>` +
            `<button type="button" class="mini" data-open="${i}">all…</button>`
          : shared
            ? ""
            : `<span class="sub">${h(explainStsError(result))}</span>`;
        const profile = result.ok ? r.ctx.profileName : "";
        return `<tr>
          <td class="stripe"><i style="background:${h(item.stripe || "#c7ccd1")}"></i></td>
          <td class="clip" style="font-weight:500" title="${h(item.accountName)}">${h(item.accountName)}</td>
          <td class="mono">${h(item.accountId)}</td>
          <td class="clip" title="${h(item.roleName)}">${h(item.roleName)}</td>
          <td>${status}</td>
          <td class="mono">${result.ok ? h(fmtTime(result.credentials.expiration)) : "—"}</td>
          <td class="mono clip" style="color:#555" title="${h(profile)}">${h(profile)}</td>
          <td class="copycell">${actions}</td>
        </tr>`;
      })
      .join("");
    // One option is selected: the bulk format chosen in this dialog, which
    // starts as the credentials file. (The per-role tabs and chips have their
    // own remembered defaults; they do not pick the bulk format.)
    const sel = (v) => (bulkFormat === v ? "selected" : "");
    const osTabs = OS_TABS.map(
      (t) =>
        `<option value="${t.id}" ${sel(t.id)}>env blocks: ${h(t.label)}</option>`
    ).join("");
    const extraOpts = EXTRA_FORMATS.map(
      (f) =>
        `<option value="x:${f.id}" ${sel(`x:${f.id}`)}>${h(f.label)}</option>`
    )
      .concat(
        (settings.templates || []).map(
          (t, i) =>
            `<option value="x:tpl:${i}" ${sel(`x:tpl:${i}`)}>${h(t.name)}</option>`
        )
      )
      .join("");
    return `
      <div class="box wide">
        <div class="head">${KEY_SVG}
          <div style="min-width:0;flex:1">
            <h1>Keys for all roles</h1>
            <div class="sub">One sign-in, ${rows.length} roles, ${rows.length} calls to STS ${h(region)} in parallel · ${okRows.length} succeeded${shortenedN ? `, ${shortenedN} shortened` : ""}${failedN ? `, ${failedN} failed` : ""}.</div>
          </div>
          <button type="button" class="x" data-act="close" aria-label="Close">×</button>
        </div>
        <div class="body">
          ${shared ? `<div class="err" data-chc-shared-error>${h(shared)}</div>` : ""}
          <div class="tablewrap"><table>
            <colgroup><col style="width:6px"><col><col style="width:118px"><col style="width:120px"><col style="width:150px"><col style="width:120px"><col><col style="width:216px"></colgroup>
            <thead><tr><th></th><th>Account</th><th>ID</th><th>Role</th><th>Status</th><th>Expires</th><th>Profile name</th><th>Copy</th></tr></thead>
            <tbody>${body}</tbody>
          </table></div>
        </div>
        <div class="foot">
          <div class="row" style="justify-content:flex-start">
            <span class="sub">Export the ${okRows.length} that worked as</span>
            <select class="sel" data-act="bulk-format">
              <option value="credentials" ${sel("credentials")}>credentials file (${okRows.length} profiles)</option>
              <option value="config" ${sel("config")}>config file (regions)</option>
              ${osTabs}
              ${extraOpts}
            </select>
            <button type="button" class="ghost" data-act="bulk-download">Download</button>
            <button type="button" class="copy ${state.copied === "bulk" ? "done" : ""}" data-copy="bulk">${state.copied === "bulk" ? "Copied" : "Copy"}</button>
          </div>
          <div class="actions">
            ${openSettings ? '<button type="button" class="ghost" data-act="settings">Settings</button>' : ""}
            <button type="button" class="primary" data-act="close">Done</button>
          </div>
        </div>
      </div>`;
  };

  const textFor = (key) => {
    const entry = state.results[state.current];
    const ctx = entry && entry.ctx;
    const okCtxs = state.results.filter((r) => r.result.ok).map((r) => r.ctx);
    if (key === "env") return envLines(ctx, state.os);
    if (key === "profile") return profileBlock(ctx);
    if (key === "ak") return ctx.accessKeyId;
    if (key === "sk") return ctx.secretAccessKey;
    if (key === "tk") return ctx.sessionToken;
    if (key === "extra") return extraText([ctx]);
    if (key.startsWith("env:"))
      return envLines(state.results[Number(key.slice(4))].ctx, state.os);
    if (key.startsWith("profile:"))
      return profileBlock(state.results[Number(key.slice(8))].ctx);
    if (key === "bulk") return bulkText(okCtxs);
    return "";
  };

  let bulkFormat = "credentials";
  const bulkText = (ctxs) => {
    if (bulkFormat === "credentials") return credentialsFile(ctxs);
    if (bulkFormat === "config") return configFile(ctxs);
    if (OS_TABS.some((t) => t.id === bulkFormat))
      return bundleEnv(ctxs, bulkFormat);
    if (bulkFormat.startsWith("x:")) {
      const prev = state.extra;
      state.extra = bulkFormat.slice(2);
      const out = extraText(ctxs);
      state.extra = prev;
      return out;
    }
    return credentialsFile(ctxs);
  };
  const bulkFilename = () =>
    bulkFormat === "config"
      ? "config"
      : bulkFormat === "credentials"
        ? "credentials"
        : "aws-creds.txt";

  const wire = () => {
    const scrim = root.querySelector(".scrim");
    scrim.addEventListener("click", (e) => {
      if (e.target === scrim) close();
    });
    root.querySelectorAll("[data-act]").forEach((el) => {
      const act = el.getAttribute("data-act");
      if (act === "close") el.addEventListener("click", close);
      if (act === "back")
        el.addEventListener("click", () => {
          state.view = "all";
          render();
        });
      if (act === "reveal")
        el.addEventListener("change", (e) => {
          state.reveal = !!e.target.checked;
          render();
        });
      if (act === "download-one")
        el.addEventListener("click", () =>
          downloadText(
            root,
            "credentials",
            credentialsFile([state.results[state.current].ctx])
          )
        );
      if (act === "bulk-format")
        el.addEventListener("change", (e) => {
          bulkFormat = e.target.value;
        });
      if (act === "settings")
        el.addEventListener("click", () => {
          Promise.resolve(openSettings()).catch(() => {});
        });
      if (act === "bulk-download")
        el.addEventListener("click", () =>
          downloadText(
            root,
            bulkFilename(),
            bulkText(state.results.filter((r) => r.result.ok).map((r) => r.ctx))
          )
        );
    });
    root.querySelectorAll("[data-os]").forEach((el) =>
      el.addEventListener("click", () => {
        state.os = el.getAttribute("data-os");
        saveSettings({ ...settings, os: state.os });
        render();
      })
    );
    root.querySelectorAll("[data-extra]").forEach((el) =>
      el.addEventListener("click", () => {
        state.extra = el.getAttribute("data-extra");
        if (!state.extra.startsWith("tpl:"))
          saveSettings({ ...settings, extraFormat: state.extra });
        render();
      })
    );
    root.querySelectorAll("[data-open]").forEach((el) =>
      el.addEventListener("click", () => {
        state.current = Number(el.getAttribute("data-open"));
        state.view = "one";
        render();
      })
    );
    root.querySelectorAll("[data-copy]").forEach((el) =>
      el.addEventListener("click", async () => {
        const key = el.getAttribute("data-copy");
        const ok = await copyText(root, textFor(key));
        state.copied = ok ? key : "";
        render();
        clearTimeout(state.copyTimer);
        state.copyTimer = setTimeout(() => {
          state.copied = "";
          render();
        }, 1400);
      })
    );
  };

  render();

  (async () => {
    try {
      const results = await exchange(items);
      if (state.closed) return;
      state.results = items.map((item, i) => {
        const result = results[i] || {
          ok: false,
          code: "NoResult",
          message: "no reply for this role",
        };
        return {
          item,
          result,
          ctx: result.ok ? ctxFor(item, result, settings, region) : null,
        };
      });
      bulkFormat = "credentials";
      const okN = state.results.filter((r) => r.result.ok).length;
      host.setAttribute(
        "data-chc-state",
        `ok=${okN} fail=${state.results.length - okN}`
      );
      // Re-render the expiry labels each minute so "(59 min)" stays honest.
      ticker = setInterval(() => {
        if (!state.closed) render();
      }, 60000);
    } catch (e) {
      state.error = e && e.message ? e.message : String(e);
      host.setAttribute("data-chc-state", "error");
    }
    render();
  })();

  return { close };
}
