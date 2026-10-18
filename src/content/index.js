// Console Hopper Creds — content script for the AWS SAML role picker.
//
// Reads the SAML response AWS keeps in the page's own hidden form field,
// finds the roles it lists, and adds a Keys button to each role row (and a
// "Keys for all roles" button). A click sends the assertion and the chosen
// roles to the service worker, which calls AWS STS; the credentials come
// back to a dialog here and nowhere else.
//
// Console Hopper, when it is on the page, knows nothing about this add-on
// and has nothing for it: this script simply adds to the page Console
// Hopper built (a Keys button inside its Sign In cell, a button in its
// right-hand column, a Settings entry in its side menu). Without Console
// Hopper the buttons sit beside AWS's own role labels. The two extensions
// never talk: they share only the page's DOM.

import {
  decodeSamlResponse,
  parseAssertion,
  validUntil,
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

// How long to wait for Console Hopper to show any sign of itself before
// treating the page as AWS's plain picker, and how long to wait for its rows
// once it has.
const CH_WAIT_MS = 1500;
const CH_ROWS_WAIT_MS = 12000;

const log = (...a) => console.info("[Console Hopper Creds]", ...a);

// "Account: name (123456789012)" → { name, id }, as AWS's plain picker
// prints it.
export function parseAccountText(text) {
  const t = String(text || "")
    .replace(/^\s*Account:\s*/i, "")
    .trim();
  const m = t.match(/^(.*?)\s*\((\d{12})\)\s*$/);
  if (m) return { name: m[1].trim(), id: m[2] };
  const id = t.match(/\b(\d{12})\b/);
  return { name: t, id: id ? id[1] : "" };
}

// The identity provider's origin from the page's referrer: http(s) only,
// never AWS's own hosts (a reload or AWS's own redirect), and only the
// origin. "" when there is none to offer.
export function idpOriginFrom(referrer) {
  let u;
  try {
    u = new URL(String(referrer || ""));
  } catch (e) {
    return "";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "";
  if (/(^|\.)(amazon\.com|amazonaws\.com|amazonaws\.cn)$/i.test(u.hostname))
    return "";
  return u.origin;
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
  const until = validUntil(parsed);
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

  // Every row that is a SAML role: AWS's radio carries the ARN in both the
  // plain picker and Console Hopper's.
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
    let accountName = "";
    let env = "";
    let stripe = "";
    const chName = row.querySelector(".tm_account_name");
    if (chName) {
      accountName = (chName.textContent || "").trim();
      env = row.getAttribute("data-env-id") || "";
      stripe = row.style.borderLeftColor || "";
    } else {
      const acct = row.closest(".saml-account");
      const nameEl =
        (acct &&
          acct.previousElementSibling &&
          acct.previousElementSibling.querySelector(".saml-account-name")) ||
        (acct &&
          acct.parentElement &&
          acct.parentElement.querySelector(".saml-account-name"));
      accountName = nameEl ? parseAccountText(nameEl.textContent).name : "";
    }
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

  // Where the person came from: the identity provider posted the SAML
  // response here, so the page's referrer is (at least) its origin. Only the
  // origin is kept, to offer a link back once this sign-in is too old. Read
  // locally, never stored or sent.
  const idpOrigin = idpOriginFrom(document.referrer);

  const expired = () => until !== null && Date.now() >= until;
  const remaining = () => {
    if (until === null) return "";
    const s = Math.max(0, Math.floor((until - Date.now()) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const refreshState = () => {
    const dead = expired();
    const tip = dead
      ? "This sign-in has expired: AWS accepts it for about 5 minutes. Sign in to AWS again through your identity provider for new keys."
      : `Exchange this sign-in for temporary keys · sign-in valid for ${remaining() || "a few minutes"}`;
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
          ? `Keys to the ${shown} roles your filters show, in one go · sign-in valid for ${remaining() || "a few minutes"}`
          : `Keys to every role listed here, in one go · sign-in valid for ${remaining() || "a few minutes"}`;
    }
    if (note) {
      note.textContent = dead
        ? "Sign-in expired · sign in again for new keys"
        : `${filtered ? `${shown} of ${total}` : total} roles · sign-in valid ${remaining() || "a few minutes"}`;
      note.classList.toggle("chc_note_expired", dead);
    }
    showExpiredBanner(dead);
  };

  // Once the sign-in is too old the page can no longer issue keys or start a
  // console session, so say so across the top of the page, not only in the
  // small note under one button. Dismissable; it stays dismissed.
  let banner = null;
  let bannerHidden = false;
  const showExpiredBanner = (dead) => {
    if (!dead || bannerHidden) {
      if (banner) banner.hidden = true;
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "chc_expired_banner";
      banner.setAttribute("role", "alert");
      const text = document.createElement("div");
      text.className = "chc_banner_text";
      const title = document.createElement("strong");
      title.textContent = "This sign-in has expired.";
      const body = document.createElement("span");
      body.textContent =
        " AWS accepts a sign-in page for about 5 minutes, so Keys and new sign-ins from this page will fail. Sign in to AWS again through your identity provider.";
      text.append(title, body);
      banner.appendChild(text);
      if (idpOrigin) {
        const again = document.createElement("a");
        again.className = "chc_banner_action";
        again.href = idpOrigin;
        again.textContent = `Sign in again at ${new URL(idpOrigin).host}`;
        banner.appendChild(again);
      }
      const x = document.createElement("button");
      x.type = "button";
      x.className = "chc_banner_x";
      x.setAttribute("aria-label", "Hide this message");
      x.title = "Hide this message";
      x.textContent = "×";
      x.addEventListener("click", (e) => {
        e.preventDefault();
        bannerHidden = true;
        banner.hidden = true;
      });
      banner.appendChild(x);
      document.body.insertBefore(banner, document.body.firstChild);
    }
    banner.hidden = false;
  };

  // Two pickers, two placements:
  //  - Console Hopper: its rows are an 8-column grid with the Sign In button
  //    as one cell. Keys goes into a cell of our own that wraps Sign In, so
  //    the column count holds and nothing shifts.
  //  - AWS's own picker: right after the role's label.
  // Never the label while Console Hopper is on the page: it hides the label,
  // and a button placed after it becomes the first grid item.
  const placeRowButton = (entry, mode) => {
    if (entry.row.querySelector(".chc_btn")) return;
    let parent = null;
    if (mode === "hopper") {
      const signin = entry.row.querySelector(".tm_signin_button");
      if (!signin) return;
      parent = signin.parentElement;
      if (!parent || !parent.classList.contains("chc_row_actions")) {
        parent = document.createElement("span");
        parent.className = "chc_row_actions";
        signin.replaceWith(parent);
        parent.appendChild(signin);
      }
    } else {
      parent = entry.row;
    }
    const b = makeButton("Keys", mode === "plain" ? "chc_plain" : "", "");
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (expired()) return;
      open([itemFor(entry)]);
    });
    buttons.add(b);
    if (mode === "plain") {
      const label = entry.row.querySelector("label");
      if (label) label.insertAdjacentElement("afterend", b);
      else parent.appendChild(b);
    } else {
      parent.appendChild(b);
    }
  };

  const placeAllButton = (container, mode) => {
    if (allButton) return;
    allButton = makeButton(
      "Keys for all roles",
      mode === "plain" ? "chc_plain" : "chc_all",
      ""
    );
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
    for (const entry of roleRows()) placeRowButton(entry, "hopper");
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
    placeAllButton(holder, "hopper");
    placeMenuEntry();
    refreshState();
    // The Sign In cell is wider now. Console Hopper fits its name columns to
    // the room left on a resize; the event is shared across isolated worlds.
    window.dispatchEvent(new Event("resize"));
  };

  const layoutPlain = () => {
    for (const entry of roleRows()) placeRowButton(entry, "plain");
    const signin = document.getElementById("signin_button");
    let holder = document.getElementById("chc_toolbar_plain");
    if (!holder) {
      holder = document.createElement("span");
      holder.id = "chc_toolbar_plain";
      if (signin && signin.parentElement)
        signin.insertAdjacentElement("afterend", holder);
      else
        (document.getElementById("saml_form") || document.body).appendChild(
          holder
        );
      const gear = document.createElement("button");
      gear.type = "button";
      gear.className = "chc_btn chc_plain";
      gear.textContent = "Creds settings";
      gear.addEventListener("click", (e) => {
        e.preventDefault();
        openSettings();
      });
      holder.appendChild(gear);
    }
    placeAllButton(holder, "plain");
    refreshState();
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
  const finish = (fn) => {
    if (done) return;
    done = true;
    fn();
    // The countdown ticks; the shown-row count follows filters the moment
    // Console Hopper hides or shows a row (an inline display change), and
    // rows it builds anew get their cell back.
    setInterval(refreshState, 1000);
    const list =
      document.getElementById("tm_role_list") ||
      document.getElementById("saml_form");
    if (list) {
      const hopper = fn === layoutWithConsoleHopper;
      new MutationObserver((mutations) => {
        if (hopper && mutations.some((m) => m.type === "childList"))
          layoutHopperRows();
        refreshState();
      }).observe(list, {
        attributes: true,
        attributeFilter: ["style", "class"],
        childList: true,
        subtree: true,
      });
    }
  };

  if (chLaidOut()) {
    finish(layoutWithConsoleHopper);
  } else {
    // Both content scripts run at document_end and Chrome gives no order
    // between extensions: give Console Hopper a moment to appear, then wait
    // for its rows; with no sign of it, the page is AWS's plain picker.
    const started = Date.now();
    const poll = setInterval(() => {
      if (done) return clearInterval(poll);
      const waited = Date.now() - started;
      if (chLaidOut()) {
        clearInterval(poll);
        finish(layoutWithConsoleHopper);
      } else if (waited > CH_WAIT_MS && !chPresent()) {
        clearInterval(poll);
        finish(layoutPlain);
      } else if (waited > CH_ROWS_WAIT_MS) {
        // Console Hopper is here but never built its rows (it stepped aside
        // as a duplicate copy, say): the page is still AWS's picker.
        clearInterval(poll);
        finish(chLaidOut() ? layoutWithConsoleHopper : layoutPlain);
      }
    }, 150);
  }
})();
