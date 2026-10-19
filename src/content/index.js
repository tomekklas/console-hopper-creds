// Console Hopper Creds — content script for the AWS SAML role picker.
//
// Reads the SAML response AWS keeps in the page's own hidden form field,
// finds the roles it lists, and adds a Keys button to each role row (and a
// "Keys for all roles" button). A click sends the assertion and the chosen
// roles to the service worker, which calls AWS STS; the credentials come
// back to a dialog here and nowhere else.
//
// It works on top of Console Hopper 1.9.0 or later, which owns the page:
// Keys goes into Console Hopper's Sign In cell, "Keys for all roles" into
// its right-hand column, a Settings entry into its side menu. Console Hopper
// also owns the sign-in's expiry (the banner, the rule) and publishes it on
// <html> as data-console-hopper-signin-until / -signin-expired / -expiry-ui;
// this script reads those to grey out Keys. The two extensions never talk:
// they share only the page's DOM. Without Console Hopper 1.9.0+ the add-on
// shows a short notice instead of Keys.

import {
  decodeSamlResponse,
  parseAssertion,
  signinRegionFromHost,
  partitionOf,
  accountOf,
  roleNameOf,
} from "../shared/saml.js";
import { DURATION_DEFAULT } from "../shared/sts.js";
import {
  loadSettings,
  saveSettings,
  isEnabledByPolicy,
} from "../shared/settings.js";
import { BUTTON_CSS } from "./styles.js";
import { openDialog } from "./dialog.js";
import { openSettingsPanel } from "./settings-panel.js";

const KEY_SVG =
  '<svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"></circle><path d="M10.8 12.2 21 2M15 8l3 3M18 5l3 3"></path></svg>';

// How long to wait for Console Hopper to show any sign of itself, and how
// long to wait for its rows once it has.
const CH_WAIT_MS = 1500;
const CH_ROWS_WAIT_MS = 12000;

// Console Hopper's page interface (1.9.0+), on <html>.
export const CH_EXPIRY_UI_ATTR = "data-console-hopper-expiry-ui";
export const CH_SIGNIN_UNTIL_ATTR = "data-console-hopper-signin-until";
export const CH_SIGNIN_EXPIRED_ATTR = "data-console-hopper-signin-expired";
export const CH_MIN_VERSION = "1.9.0";
const CH_HOME = "https://consolehopper.com/";

const log = (...a) => console.info("[Console Hopper Creds]", ...a);

// Console Hopper 1.9.0 or later marks the page before it builds its rows;
// earlier versions never set this attribute.
export const consoleHopperSupported = (root = document.documentElement) =>
  root.getAttribute(CH_EXPIRY_UI_ATTR) === "1";

// When the sign-in stops being usable, as Console Hopper published it (ms
// since the epoch), or null when it published none (a response with no
// times never expires).
export function consoleHopperSigninUntil(root = document.documentElement) {
  const v = root.getAttribute(CH_SIGNIN_UNTIL_ATTR);
  const n = v === null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

(async function main() {
  if (!(await isEnabledByPolicy())) return;
  if (document.documentElement.hasAttribute("data-chc-loaded")) return;
  document.documentElement.setAttribute("data-chc-loaded", "1");

  const samlInput =
    document.querySelector('#saml_form input[name="SAMLResponse"]') ||
    document.querySelector('input[name="SAMLResponse"]');
  if (!samlInput) return;

  let parsed;
  try {
    parsed = parseAssertion(decodeSamlResponse(samlInput.value));
  } catch (e) {
    log("could not read the SAML response:", e && e.message);
    return;
  }
  if (parsed.encrypted) {
    log(
      "the assertion is encrypted; roles cannot be read client-side, so no Keys buttons."
    );
    return;
  }
  if (!parsed.roles.length) {
    log("no AWS roles in the SAML response; nothing to do.");
    return;
  }

  const settings = await loadSettings();
  const partition = partitionOf(parsed.roles[0].roleArn);
  const regionFor = () =>
    settings.region ||
    signinRegionFromHost(location.hostname) ||
    (partition === "aws-cn"
      ? "cn-north-1"
      : partition === "aws-us-gov"
        ? "us-gov-west-1"
        : "us-east-1");
  const durationFor = () =>
    settings.duration === "saml"
      ? parsed.sessionDuration || DURATION_DEFAULT
      : settings.duration;
  const byArn = new Map(parsed.roles.map((r) => [r.roleArn, r]));

  const style = document.createElement("style");
  style.textContent = BUTTON_CSS;
  document.documentElement.appendChild(style);

  // --- rows -------------------------------------------------------------

  // Every role row: AWS's radio, which Console Hopper keeps in each of its
  // rows, carries the ARN.
  const roleRows = () => {
    const out = [];
    document
      .querySelectorAll('input[type="radio"][name="roleIndex"]')
      .forEach((radio) => {
        const row = radio.closest(".saml-role");
        if (!row || row.getAttribute("data-jump") === "1") return;
        const pair = byArn.get(radio.value);
        if (pair) out.push({ row, radio, pair });
      });
    return out;
  };

  // The rows the user can see right now. Console Hopper hides rows that a
  // filter or search excludes with display: none; "Keys for all roles" means
  // those that are shown, so a filter scopes it.
  const isShown = (row) =>
    row.style.display !== "none" && getComputedStyle(row).display !== "none";
  const shownRows = () => roleRows().filter((e) => isShown(e.row));

  const itemFor = ({ row, pair }) => {
    const roleArn = pair.roleArn;
    const accountId = accountOf(roleArn);
    const nameEl = row.querySelector(".tm_account_name");
    const accountName = nameEl ? (nameEl.textContent || "").trim() : "";
    const env = row.getAttribute("data-env-id") || "";
    const stripe = row.style.borderLeftColor || "";
    return {
      roleArn,
      principalArn: pair.principalArn,
      accountId,
      accountName: accountName || accountId,
      roleName: roleNameOf(roleArn),
      env: env && env !== "default" ? env.toUpperCase() : "",
      stripe: stripe || "#c7ccd1",
    };
  };

  // --- exchange ---------------------------------------------------------

  const exchange = async (items) => {
    const assertion = samlInput.value;
    const reply = await chrome.runtime.sendMessage({
      type: "chc_assume",
      assertion,
      roles: items.map((i) => ({
        roleArn: i.roleArn,
        principalArn: i.principalArn,
      })),
      durationSeconds: durationFor(),
      region: regionFor(),
      partition,
    });
    if (!reply || !reply.ok)
      throw new Error((reply && reply.error) || "no reply from the extension");
    return reply.results;
  };

  const persist = (next) => {
    Object.assign(settings, next);
    return saveSettings(settings).catch(() => settings);
  };

  const openSettings = () =>
    openSettingsPanel({ settings, saveSettings: persist });

  const open = (items) =>
    openDialog({
      items,
      settings,
      saveSettings: persist,
      exchange,
      region: regionFor(),
      roleSessionName: parsed.roleSessionName,
      openSettings,
    });

  // --- buttons ----------------------------------------------------------

  const makeButton = (label, extraClass, title) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `chc_btn ${extraClass || ""}`.trim();
    b.innerHTML = `${KEY_SVG}<span>${label}</span>`;
    b.title = title;
    return b;
  };

  const buttons = new Set();
  let allButton = null;
  let note = null;

  // Console Hopper owns the sign-in's expiry: it decides when AWS stops
  // accepting this page (and shows the banner); Keys follows it.
  const root = document.documentElement;
  const expired = () => {
    if (root.getAttribute(CH_SIGNIN_EXPIRED_ATTR) === "1") return true;
    const until = consoleHopperSigninUntil(root);
    return until !== null && Date.now() >= until;
  };
  const refreshState = () => {
    const dead = expired();
    const tip = dead
      ? "This sign-in has expired. Sign in to AWS again through your identity provider for new keys."
      : "Exchange this sign-in for temporary keys";
    for (const b of buttons) {
      b.disabled = dead;
      b.title = tip;
    }
    const total = roleRows().length;
    const shown = shownRows().length;
    const filtered = shown < total;
    if (allButton) {
      allButton.disabled = dead || shown === 0;
      allButton.querySelector("span").textContent = filtered
        ? `Keys for ${shown} shown role${shown === 1 ? "" : "s"}`
        : "Keys for all roles";
      allButton.title = dead
        ? tip
        : filtered
          ? `Keys to the ${shown} roles your filters show, in one go`
          : "Keys to every role listed here, in one go";
    }
    if (note) {
      note.textContent = dead
        ? "Sign-in expired"
        : `${filtered ? `${shown} of ${total}` : total} roles`;
      note.classList.toggle("chc_note_expired", dead);
    }
  };

  // Console Hopper's rows are an 8-column grid with the Sign In button as one
  // cell. Keys goes into a cell of our own that wraps Sign In, so the column
  // count holds and nothing shifts.
  const placeRowButton = (entry) => {
    if (entry.row.querySelector(".chc_btn")) return;
    const signin = entry.row.querySelector(".tm_signin_button");
    if (!signin) return;
    let parent = signin.parentElement;
    if (!parent || !parent.classList.contains("chc_row_actions")) {
      parent = document.createElement("span");
      parent.className = "chc_row_actions";
      signin.replaceWith(parent);
      parent.appendChild(signin);
    }
    const b = makeButton("Keys", "", "");
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (expired()) return;
      open([itemFor(entry)]);
    });
    buttons.add(b);
    parent.appendChild(b);
  };

  const placeAllButton = (container) => {
    if (allButton) return;
    allButton = makeButton("Keys for all roles", "chc_all", "");
    allButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (expired()) return;
      const items = shownRows().map(itemFor);
      if (items.length) open(items);
    });
    container.appendChild(allButton);
    note = document.createElement("span");
    note.className = "chc_toolbar_note";
    container.appendChild(note);
  };

  // A "Creds" section at the end of Console Hopper's slide-out side menu,
  // in the same shape as its own entries.
  const placeMenuEntry = () => {
    const scroll = document.getElementById("tm_actions_scroll");
    if (!scroll || scroll.querySelector(".chc_menu_action")) return;
    const header = document.createElement("div");
    header.className = "chc_menu_header";
    header.textContent = "Creds";
    const entry = document.createElement("a");
    entry.href = "#";
    entry.className = "chc_menu_action";
    entry.textContent = "Creds Settings";
    entry.title = "Session length, profile names, region, your templates";
    entry.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSettings();
    });
    scroll.append(header, entry);
  };

  // Each Console Hopper row is its own grid and its name columns are
  // fr-sized, so a row whose last cell holds Keys gives the Keys width up
  // from its names while a jump row (no Keys) keeps it: Sign In and Jump end
  // up in different places. A hidden Keys-sized spacer beside each Jump
  // button gives every row the same last cell, and the columns line up.
  const placeJumpSpacers = () => {
    document
      .querySelectorAll(
        '#tm_role_list .saml-role[data-jump="1"] .tm_signin_button'
      )
      .forEach((jump) => {
        if (jump.parentElement.classList.contains("chc_row_actions")) return;
        const cell = document.createElement("span");
        cell.className = "chc_row_actions";
        jump.replaceWith(cell);
        cell.appendChild(jump);
        const spacer = document.createElement("span");
        spacer.className = "chc_spacer";
        spacer.setAttribute("aria-hidden", "true");
        spacer.innerHTML = `${KEY_SVG}<span>Keys</span>`;
        cell.appendChild(spacer);
      });
  };

  // Console Hopper builds its jump rows again when their destinations
  // change, so this runs once now and again whenever the list changes.
  const layoutHopperRows = () => {
    for (const entry of roleRows()) placeRowButton(entry);
    placeJumpSpacers();
  };

  const layoutWithConsoleHopper = () => {
    layoutHopperRows();
    let holder = document.getElementById("chc_toolbar");
    if (!holder) {
      holder = document.createElement("div");
      holder.id = "chc_toolbar";
      const column =
        document.querySelector("#tm_interface_wrapper .tm_right_column") ||
        document.querySelector(".tm_right_column") ||
        document.getElementById("tm_interface_wrapper") ||
        document.getElementById("saml_form") ||
        document.body;
      column.appendChild(holder);
    }
    placeAllButton(holder);
    placeMenuEntry();
    refreshState();
    // The Sign In cell is wider now. Console Hopper fits its name columns to
    // the room left on a resize; the event is shared across isolated worlds.
    window.dispatchEvent(new Event("resize"));
  };

  // No Keys without Console Hopper 1.9.0+: say what is missing, where Keys
  // would have been (Console Hopper's right column when an older one is on
  // the page, beside AWS's own Sign In button when there is none).
  const showRequirement = (older) => {
    if (document.getElementById("chc_requirement")) return;
    const box = document.createElement("div");
    box.id = "chc_requirement";
    box.setAttribute("role", "note");
    const text = document.createElement("span");
    text.textContent = older
      ? `Console Hopper Creds needs Console Hopper ${CH_MIN_VERSION} or later. Update Console Hopper to get Keys here.`
      : `Console Hopper Creds works on top of Console Hopper ${CH_MIN_VERSION} or later, which is not on this page.`;
    const link = document.createElement("a");
    link.href = CH_HOME;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Get Console Hopper";
    box.append(text, " ", link);
    const column = older && document.querySelector(".tm_right_column");
    const signin = document.getElementById("signin_button");
    if (column) column.appendChild(box);
    else if (signin && signin.parentElement)
      signin.insertAdjacentElement("afterend", box);
    else
      (document.getElementById("saml_form") || document.body).appendChild(box);
    log(
      older
        ? `Console Hopper is older than ${CH_MIN_VERSION}; no Keys buttons.`
        : "Console Hopper is not on this page; no Keys buttons."
    );
  };

  // --- which picker is this? -------------------------------------------

  // Console Hopper leaves its own markup: a guard attribute on <html> as soon
  // as its script starts, then the interface wrapper, the list and the rows.
  const chPresent = () =>
    !!(
      document.documentElement.hasAttribute("data-console-hopper") ||
      document.getElementById("tm_interface_wrapper") ||
      document.getElementById("tm_role_list") ||
      document.querySelector(".tm_role_info")
    );
  // ...and has built its rows once a direct row has its Sign In button.
  const chLaidOut = () =>
    !!document.querySelector(
      '#tm_role_list .saml-role:not([data-jump="1"]) .tm_signin_button'
    );

  let done = false;
  const start = () => {
    if (done) return;
    done = true;
    if (!consoleHopperSupported(root)) {
      showRequirement(true);
      return;
    }
    layoutWithConsoleHopper();
    // Keys greys out when Console Hopper's clock runs out; the shown-row
    // count follows filters the moment Console Hopper hides or shows a row
    // (an inline display change), and rows it builds anew get their cell
    // back.
    setInterval(refreshState, 1000);
    new MutationObserver(refreshState).observe(root, {
      attributes: true,
      attributeFilter: [CH_SIGNIN_EXPIRED_ATTR, CH_SIGNIN_UNTIL_ATTR],
    });
    const list = document.getElementById("tm_role_list");
    if (list) {
      new MutationObserver((mutations) => {
        if (mutations.some((m) => m.type === "childList")) layoutHopperRows();
        refreshState();
      }).observe(list, {
        attributes: true,
        attributeFilter: ["style", "class"],
        childList: true,
        subtree: true,
      });
    }
  };
  const giveUp = () => {
    if (done) return;
    done = true;
    showRequirement(false);
  };

  if (chLaidOut()) {
    start();
  } else {
    // Both content scripts run at document_end and Chrome gives no order
    // between extensions: give Console Hopper a moment to appear, then wait
    // for its rows. With no sign of it, or no rows after a long wait (it
    // stepped aside as a duplicate copy, say), there is nothing to add to.
    const started = Date.now();
    const poll = setInterval(() => {
      if (done) return clearInterval(poll);
      const waited = Date.now() - started;
      if (chLaidOut()) {
        clearInterval(poll);
        start();
      } else if (
        (waited > CH_WAIT_MS && !chPresent()) ||
        waited > CH_ROWS_WAIT_MS
      ) {
        clearInterval(poll);
        giveUp();
      }
    }, 150);
  }
})();
