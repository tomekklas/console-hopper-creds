// @vitest-environment jsdom
//
// The content script against two pickers: the one Console Hopper builds
// (its rows, right column and side menu, no hooks of any kind) and AWS's
// plain one. chrome.* is a small double; the script is imported fresh for
// each case.
import { describe, it, expect, beforeEach, vi } from "vitest";

const ROLE_A = "arn:aws:iam::111122223333:role/PowerUser";
const ROLE_B = "arn:aws:iam::444455556666:role/ReadOnly";
const PROV = "arn:aws:iam::111122223333:saml-provider/Okta";

const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" IssueInstant="${new Date().toISOString()}">
<saml:Assertion><saml:AttributeStatement>
<saml:Attribute Name="https://aws.amazon.com/SAML/Attributes/Role"><saml:AttributeValue>${ROLE_A},${PROV}</saml:AttributeValue><saml:AttributeValue>${ROLE_B},${PROV}</saml:AttributeValue></saml:Attribute>
<saml:Attribute Name="https://aws.amazon.com/SAML/Attributes/RoleSessionName"><saml:AttributeValue>tomek</saml:AttributeValue></saml:Attribute>
</saml:AttributeStatement></saml:Assertion></samlp:Response>`;
const b64 = btoa(unescape(encodeURIComponent(xml)));

const chromeDouble = () => {
  const sent = [];
  globalThis.chrome = {
    storage: {
      sync: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      managed: { get: vi.fn(async () => ({})) },
    },
    runtime: {
      sendMessage: vi.fn(async (msg) => {
        sent.push(msg);
        return {
          ok: true,
          results: msg.roles.map(() => ({
            ok: false,
            code: "AccessDenied",
            message: "test",
          })),
        };
      }),
    },
  };
  return sent;
};

// The picker as Console Hopper 1.8.0 leaves it: a guard attribute on <html>,
// the interface wrapper with its right column, the side menu, and rows whose
// Sign In button is one of four direct children of .tm_role_buttons.
const hopperPicker = () => {
  document.documentElement.setAttribute("data-console-hopper", "abcdef");
  document.body.innerHTML = `
    <form id="saml_form">
      <input type="hidden" name="SAMLResponse" value="${b64}">
      <div id="tm_interface_wrapper"><div class="tm_right_column"><div id="tm_sessions_bar"></div></div></div>
      <div id="tm_role_list">
        <div class="saml-role" data-env-id="prod" style="border-left-color: rgb(220, 53, 69)">
          <input type="radio" name="roleIndex" value="${ROLE_A}" id="l1"><label for="l1">hidden</label>
          <div class="tm_role_info"><div class="tm_account_name" data-account-id="111122223333">acme-prod-audit</div><div class="tm_role_name">PowerUser</div></div>
          <div class="tm_role_buttons"><button class="tm_account_id">111122223333</button><select class="tm_service"></select><select class="tm_region"></select><button class="tm_role_button primary tm_signin_button" data-role-arn="${ROLE_A}">Sign In</button></div>
        </div>
        <div class="saml-role">
          <input type="radio" name="roleIndex" value="${ROLE_B}" id="l2"><label for="l2">hidden</label>
          <div class="tm_role_info"><div class="tm_account_name" data-account-id="444455556666">beta</div><div class="tm_role_name">ReadOnly</div></div>
          <div class="tm_role_buttons"><button class="tm_account_id">444455556666</button><select class="tm_service"></select><select class="tm_region"></select><button class="tm_role_button primary tm_signin_button" data-role-arn="${ROLE_B}">Sign In</button></div>
        </div>
        <div class="saml-role" data-jump="1">
          <input type="radio" name="roleIndex" value="arn:aws:iam::777788889999:role/DataAdmin">
          <div class="tm_role_buttons"><button class="tm_signin_button" data-jump="1">Jump</button></div>
        </div>
      </div>
      <a id="signin_button" href="#">Sign In</a>
    </form>
    <div id="tm_actions_container"><div id="tm_actions_scroll">
      <div class="tm_menu_header">Help</div><a href="#" class="tm_action_button" id="tm_about">Help / About</a>
    </div></div>`;
};

const plainPicker = () => {
  document.body.innerHTML = `
    <form id="saml_form">
      <input type="hidden" name="SAMLResponse" value="${b64}">
      <div class="expandable-container"><div class="saml-account-name">Account: acme-prod-audit (111122223333)</div></div>
      <div class="saml-account">
        <div class="saml-role"><input type="radio" name="roleIndex" value="${ROLE_A}" id="r1"><label for="r1">PowerUser</label></div>
      </div>
      <div class="expandable-container"><div class="saml-account-name">Account: beta (444455556666)</div></div>
      <div class="saml-account">
        <div class="saml-role"><input type="radio" name="roleIndex" value="${ROLE_B}" id="r2"><label for="r2">ReadOnly</label></div>
        <div class="saml-role"><input type="radio" name="roleIndex" value="arn:aws:iam::444455556666:role/NotInAssertion" id="r3"><label for="r3">Stranger</label></div>
      </div>
      <a id="signin_button" href="#">Sign In</a>
    </form>`;
};

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.resetModules();
  vi.useRealTimers();
  document.documentElement.removeAttribute("data-chc-loaded");
  document.documentElement.removeAttribute("data-console-hopper");
  document.querySelectorAll("style").forEach((s) => s.remove());
});

describe("with Console Hopper on the page", () => {
  it("wraps Sign In in its own cell, keeps the grid, and never uses the label", async () => {
    const sent = chromeDouble();
    hopperPicker();
    await import("../src/content/index.js");
    await flush();
    await flush();
    const direct = [
      ...document.querySelectorAll(
        '#tm_role_list .saml-role:not([data-jump="1"])'
      ),
    ];
    expect(direct).toHaveLength(2);
    for (const row of direct) {
      const btns = row.querySelectorAll(".chc_btn");
      expect(btns).toHaveLength(1);
      expect(btns[0].classList.contains("chc_plain")).toBe(false);
      // Keys sits in a cell of ours that also holds Sign In, and that cell is
      // the direct grid child where Sign In used to be: still 4 items.
      const cell = btns[0].parentElement;
      expect(cell.className).toBe("chc_row_actions");
      expect(cell.querySelector(".tm_signin_button")).not.toBeNull();
      expect(cell.parentElement.className).toBe("tm_role_buttons");
      expect(cell.parentElement.children).toHaveLength(4);
      expect(
        row.querySelector("label").nextElementSibling.className
      ).not.toContain("chc_btn");
    }
    // A jump row gets no Keys, but a hidden Keys-sized spacer in a cell like
    // the others', so its columns line up with theirs.
    const jump = document.querySelector('.saml-role[data-jump="1"]');
    expect(jump.querySelector(".chc_btn")).toBeNull();
    const jumpCell = jump.querySelector(".chc_row_actions");
    expect(jumpCell).not.toBeNull();
    expect(jumpCell.children[0].getAttribute("data-jump")).toBe("1");
    expect(jumpCell.children[1].className).toBe("chc_spacer");
    expect(jumpCell.children[1].getAttribute("aria-hidden")).toBe("true");
    // Console Hopper builds jump rows anew when destinations change: a new
    // one gets its cell too.
    const fresh = document.createElement("div");
    fresh.className = "saml-role";
    fresh.setAttribute("data-jump", "1");
    fresh.innerHTML =
      '<div class="tm_role_buttons"><button class="tm_signin_button" data-jump="1">Jump</button></div>';
    document.getElementById("tm_role_list").appendChild(fresh);
    await flush();
    expect(fresh.querySelector(".chc_row_actions .chc_spacer")).not.toBeNull();
    expect(fresh.querySelector(".chc_btn")).toBeNull();
    const all = document.querySelector(
      ".tm_right_column #chc_toolbar .chc_btn"
    );
    expect(all).not.toBeNull();
    expect(all.textContent).toContain("Keys for all roles");
    expect(document.getElementById("chc_toolbar_plain")).toBeNull();

    // A click asks the service worker for exactly that role.
    direct[1].querySelector(".chc_btn").click();
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "chc_assume",
      assertion: b64,
      roles: [{ roleArn: ROLE_B, principalArn: PROV }],
      partition: "aws",
      durationSeconds: 3600,
    });
    const dialog = document.querySelector('[data-chc="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("data-chc-state")).toBe("ok=0 fail=1");

    // "All" sends both direct roles, never the jump row.
    expect(all.textContent).toContain("Keys for all roles");
    all.click();
    await flush();
    expect(sent[1].roles.map((r) => r.roleArn)).toEqual([ROLE_A, ROLE_B]);

    // A filter hides a row the way Console Hopper does; "all" now means the
    // rows shown, and the button says so.
    document.querySelector('[data-chc="dialog"]').remove();
    direct[0].style.display = "none";
    await flush(); // the style change is observed, no tick needed
    expect(all.textContent).toContain("Keys for 1 shown role");
    expect(
      document.querySelector("#chc_toolbar .chc_toolbar_note").textContent
    ).toContain("1 of 2 roles");
    all.click();
    await flush();
    expect(sent[2].roles.map((r) => r.roleArn)).toEqual([ROLE_B]);

    // Everything hidden: nothing to ask for.
    direct[1].style.display = "none";
    await flush();
    expect(all.disabled).toBe(true);
  });

  it("adds a Creds section to the side menu that opens the settings panel", async () => {
    chromeDouble();
    hopperPicker();
    await import("../src/content/index.js");
    await flush();
    await flush();
    const scroll = document.getElementById("tm_actions_scroll");
    const header = scroll.querySelector(".chc_menu_header");
    const entry = scroll.querySelector(".chc_menu_action");
    expect(header.textContent).toBe("Creds");
    expect(entry.textContent).toBe("Creds Settings");
    // Appended after Console Hopper's own entries, in the same scroll area.
    expect(scroll.lastElementChild).toBe(entry);
    expect(header.previousElementSibling.id).toBe("tm_about");

    entry.click();
    expect(document.querySelector('[data-chc="settings"]')).not.toBeNull();
    // Opening twice does not stack panels.
    entry.click();
    expect(document.querySelectorAll('[data-chc="settings"]')).toHaveLength(1);
  });

  it("waits for Console Hopper's rows when only its guard attribute is there yet", async () => {
    vi.useFakeTimers();
    chromeDouble();
    hopperPicker();
    // Console Hopper has started (the attribute) but not built its rows.
    const list = document.getElementById("tm_role_list");
    const saved = list.innerHTML;
    list.innerHTML = "";
    await import("../src/content/index.js");
    await vi.advanceTimersByTimeAsync(3000);
    expect(document.querySelector(".chc_btn")).toBeNull(); // not plain mode
    list.innerHTML = saved;
    await vi.advanceTimersByTimeAsync(400);
    expect(document.querySelectorAll(".chc_row_actions .chc_btn")).toHaveLength(
      2
    );
  });
});

describe("on AWS's plain picker", () => {
  it("places buttons after the labels once Console Hopper has not shown up", async () => {
    vi.useFakeTimers();
    chromeDouble();
    plainPicker();
    await import("../src/content/index.js");
    await vi.advanceTimersByTimeAsync(50);
    expect(document.querySelector(".chc_btn")).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    const btns = [...document.querySelectorAll(".saml-role .chc_btn")];
    expect(btns).toHaveLength(2); // the role missing from the assertion gets none
    expect(btns[0].previousElementSibling.tagName).toBe("LABEL");
    const holder = document.getElementById("chc_toolbar_plain");
    expect(holder.querySelectorAll(".chc_btn")).toHaveLength(2); // settings + all
    expect(holder.textContent).toContain("Keys for all roles");
    expect(holder.textContent).toContain("Creds settings");
  });
});

describe("guards", () => {
  it("does nothing when policy disables it", async () => {
    chromeDouble();
    globalThis.chrome.storage.managed.get = vi.fn(async () => ({
      enabled: false,
    }));
    hopperPicker();
    await import("../src/content/index.js");
    await flush();
    await flush();
    expect(document.querySelector(".chc_btn")).toBeNull();
  });
  it("does nothing without a SAML response", async () => {
    chromeDouble();
    hopperPicker();
    document.querySelector('input[name="SAMLResponse"]').remove();
    await import("../src/content/index.js");
    await flush();
    await flush();
    expect(document.querySelector(".chc_btn")).toBeNull();
  });
});
