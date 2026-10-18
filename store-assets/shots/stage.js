/* global SCENE */
(function () {
  // Display-only staging for a Console Hopper Creds store screenshot, run in
  // the live AWS SAML role picker by shoot.sh (which prepends
  // `var SCENE = "...";`). Rewrites VISIBLE TEXT to AWS-doc placeholder
  // values and leaves every data-* attribute holding the real value, so the
  // mapping is stable and the script is re-runnable; a page reload restores
  // the real page. It refuses the shot (`leaks`) while anything real, or any
  // third-party product name, is still legible.
  //
  // Scenes:
  //   picker    the role picker with Console Hopper: Keys on every row, Keys
  //             for all roles in the right column (light DOM only)
  //   keys      the Keys dialog for the first shown role
  //   all       the Keys for all roles table
  //   plain     AWS's own picker, Console Hopper disabled
  //   settings  the Creds settings panel
  //
  // The dialog and the settings panel live in a closed shadow root, so the
  // keys / all / settings scenes need the dev build with the roots opened
  // (see README.md). Their contents are not edited in place: a static copy
  // of the rendered root is shown in an open shadow root of our own and the
  // live host is hidden, so the dialog's own re-render (every minute, and
  // on any click) cannot paint real values back over the staged text.
  var scene = typeof SCENE === "string" ? SCENE : "picker";
  var HOST_KIND = { keys: "dialog", all: "dialog", settings: "settings" };
  var hostKind = HOST_KIND[scene] || null;

  var IDS = ["111122223333", "444455556666", "777788889999", "123456789012",
             "222233334444", "555566667777", "888899990000", "333344445555",
             "666677778888", "999900001111", "121234345656", "343456567878"];
  var NAMES = ["acme-prod-audit", "acme-prod-backup", "globex-prod-web",
               "initech-test-core", "acme-dev-tools", "globex-test-data",
               "initech-prod-net", "acme-sec-logging", "globex-dev-apps",
               "initech-sandbox", "acme-test-api", "globex-sec-audit"];
  var ROLES = { CHBilling: "Billing", CHReadOnly: "ReadOnly",
                CHPowerUser: "PowerUser", CHOrgAdmin: "OrgAdmin",
                CHAdmin: "Admin", CHNetwork: "NetworkAdmin" };
  var TAGS = ["OPS-1234", "prod-network", "pci", "security-core", "sandbox",
              "OPS-1198", "INC-0419", "platform", "OPS-1350", "CHG-2231"];
  var SETS = ["OPS-1234", "INC-0419", "OPS-1198", "CHG-2210", "OPS-1301",
              "INC-0442", "CHG-2231", "OPS-1350"];
  var SHORTCUTS = ["Prod network", "PCI accounts", "Sandboxes"];
  var VIA = "via Acme hub · max 1 h";
  // AWS's documentation placeholder for a temporary access key id.
  var FAKE_KEY = "ASIAIOSFODNN7EXAMPLE";
  var SESSION_NAME = "alice@example.com";
  var TEMPLATE = {
    name: "mytool",
    body: "mytool login --key {{accessKeyId}} --secret {{secretAccessKey}} --token {{sessionToken}} --region {{region}}"
  };
  // Product names on the "More formats" chips (and anywhere else) that a
  // store screenshot must not carry.
  var BRAND_RE = /(\bDocker\b|\bTerraform\b|\bboto3\b|\b1Password\b|\bJava SDK\b|\bGo SDK\b|\bJS SDK\b|\.NET\b|AWS Tools for PowerShell)/;
  var ROLE_POOL = Object.keys(ROLES).map(function (k) { return ROLES[k]; })
    .concat(["Jump", "Hub"]);
  var hopper = !!document.getElementById("tm_role_list");
  var Z = scene === "plain" ? 1 : 0.84;
  var leaks = [];
  var pending = null;

  function escape() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }
  function removeShotCopy() {
    var old = document.getElementById("chc_shot_host");
    if (old) old.remove();
  }

  // ---- Console Hopper's own pop-ups: out of the way ----
  document.querySelectorAll('[id$="_modal"]').forEach(function (el) {
    if (el.id === "tm_set_open_modal") {
      var cancel = el.querySelector('[data-action="cancel"]');
      if (cancel) cancel.click(); else el.remove();
      return;
    }
    el.remove();
  });
  document.querySelectorAll("#tm_toasts, .tm_toast").forEach(function (el) { el.remove(); });
  var pop = document.getElementById("tm_sessions_popover");
  if (pop && pop.offsetParent) {
    var closeBtn = document.getElementById("tm_sessions_close");
    if (closeBtn) closeBtn.click();
  }
  document.body.classList.remove("tm_theme_dark");

  // ---- Open / Sign In ----
  // Console Hopper decides a row's "Open" from the row's VISIBLE account id
  // and role, so once those are rewritten its next refresh would flip every
  // Open back to Sign In. Pin each label as first seen.
  document.querySelectorAll("#tm_role_list .tm_signin_button").forEach(function (b) {
    if (!b.dataset.stageLabel) b.dataset.stageLabel = b.textContent;
    if (b.textContent !== b.dataset.stageLabel) b.textContent = b.dataset.stageLabel;
  });

  // ---- account ids: one stable map, kept on <html> across passes ----
  var html = document.documentElement;
  var idMap = {};
  try { idMap = JSON.parse(html.getAttribute("data-chc-shot-ids") || "{}"); } catch (_) { idMap = {}; }
  function seen(id) {
    if (!id || !/^\d{12}$/.test(id) || idMap[id]) return;
    idMap[id] = IDS[Object.keys(idMap).length % IDS.length];
  }
  document.querySelectorAll('input[type="radio"][name="roleIndex"]').forEach(function (r) {
    var m = /::(\d{12}):/.exec(r.value || "");
    if (m) seen(m[1]);
  });
  document.querySelectorAll("[data-account-id]").forEach(function (el) {
    seen(el.getAttribute("data-account-id"));
  });
  html.setAttribute("data-chc-shot-ids", JSON.stringify(idMap));
  var realIds = Object.keys(idMap);
  var nameMap = {};
  realIds.forEach(function (id) { nameMap[id] = NAMES[IDS.indexOf(idMap[id]) % NAMES.length]; });

  // ---- account names ----
  var nameSwap = {};
  function noteReal(real, id) {
    real = String(real || "").replace(/^\s*⤳\s*/, "").replace(/\s+/g, " ").trim();
    if (real.length >= 3 && !/^\d{12}$/.test(real) && real !== nameMap[id]) nameSwap[real] = nameMap[id];
  }
  document.querySelectorAll(".tm_account_name").forEach(function (el) {
    var id = el.getAttribute("data-account-id");
    if (!id || !idMap[id]) return;
    if (!el.dataset.realName) el.dataset.realName = el.textContent;
    noteReal(el.dataset.realName, id);
    noteReal(el.getAttribute("data-aws-name"), id);
    el.textContent = nameMap[id];
  });
  // AWS's plain picker: "Account: name (123456789012)" headings.
  document.querySelectorAll(".saml-account-name").forEach(function (el) {
    if (el.children.length !== 0) return;
    if (!el.dataset.realText) el.dataset.realText = el.textContent;
    var m = el.dataset.realText.match(/^\s*(?:Account:)?\s*(.*?)\s*\((\d{12})\)\s*$/);
    if (!m || !idMap[m[2]]) return;
    noteReal(m[1], m[2]);
    el.textContent = "Account: " + nameMap[m[2]] + " (" + idMap[m[2]] + ")";
  });
  var swapKeys = Object.keys(nameSwap).sort(function (x, y) { return y.length - x.length; });

  // ---- roles ----
  function mapRole(t) {
    t = (t || "").trim();
    if (ROLES[t]) return ROLES[t];
    return t.replace(/^CH/, "") || t;
  }
  document.querySelectorAll(".saml-role-description, .tm_role_name").forEach(function (el) {
    if (el.children.length === 0) el.textContent = mapRole(el.textContent);
  });
  document.querySelectorAll(".tm_account_id").forEach(function (el) {
    var id = el.getAttribute("data-account-id");
    if (id && idMap[id]) el.textContent = idMap[id];
  });

  // ---- Console Hopper's chips, sets, shortcuts: demo labels ----
  var f = 0;
  document.querySelectorAll('.tm_filter_button[data-group="tag"]').forEach(function (el) {
    el.textContent = TAGS[f++ % TAGS.length];
  });
  var s = 0;
  document.querySelectorAll(".tm_custom_shortcut").forEach(function (el) {
    var node = el.firstChild;
    if (node && node.nodeType === 3) node.nodeValue = SHORTCUTS[s++ % SHORTCUTS.length];
  });
  var setMap = {}, k = 0;
  document.querySelectorAll(".tm_set_line").forEach(function (line) {
    var nameEl = line.querySelector(".tm_set_name");
    if (!nameEl) return;
    if (!nameEl.dataset.realName) nameEl.dataset.realName = nameEl.textContent;
    var demo = SETS[k++ % SETS.length];
    setMap[nameEl.dataset.realName] = demo;
    nameEl.textContent = demo;
  });
  // A row that remembers an AWS service would print its name; show every
  // row on "Console only" (display only: no change event, nothing saved).
  document.querySelectorAll(".tm_service_dropdown").forEach(function (sel) {
    if (sel.selectedIndex !== 0) sel.selectedIndex = 0;
  });

  // ---- generic text pass ----
  function scrub(str) {
    var out = str;
    realIds.forEach(function (id) { out = out.split(id).join(idMap[id]); });
    swapKeys.forEach(function (real) { out = out.split(real).join(nameSwap[real]); });
    out = out.replace(/\bCH([A-Z][A-Za-z]+)\b/g, function (_, r) { return mapRole("CH" + r); });
    out = out.replace(/\bASIA[A-Z0-9]{16}\b/g, FAKE_KEY);
    out = out.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, SESSION_NAME);
    out = out.replace(/\bvia\s+.+?\bhub\b.*$/m, VIA);
    return out;
  }
  function scrubTree(rootNode) {
    var walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var p = node.parentElement;
      if (p && /^(STYLE|SCRIPT)$/.test(p.tagName)) continue;
      var v = node.nodeValue;
      var nv = scrub(v);
      if (nv !== v) node.nodeValue = nv;
    }
    rootNode.querySelectorAll("input[type='text']").forEach(function (el) {
      if (el.value) el.value = scrub(el.value);
    });
    rootNode.querySelectorAll("option").forEach(function (o) {
      var v = scrub(o.textContent);
      if (v !== o.textContent) o.textContent = v;
    });
    rootNode.querySelectorAll("[title]").forEach(function (el) {
      el.title = scrub(el.title);
    });
  }
  scrubTree(document.body);
  // The expired banner links to the identity provider the page came from
  // (mock-saml on localhost while shooting); point it at an example host.
  document.querySelectorAll("#chc_expired_banner .chc_banner_action").forEach(function (a) {
    a.setAttribute("href", "https://sso.example.com");
  });
  window.dispatchEvent(new Event("resize"));

  // ---- framing ----
  var si = document.getElementById("tm_search_input");
  if (si) si.blur();
  var rl = document.getElementById("tm_role_list");
  if (rl) { rl.style.outline = "none"; if (rl.focus) rl.focus(); }
  document.querySelectorAll("#claude-phantom-cursor, #claude-agent-glow-border")
    .forEach(function (el) { el.remove(); });
  // The store's 1280x800 frame is narrow for Console Hopper's picker, which
  // renders at zoom 0.84 and is captured 1:1. Its side menu is position:fixed
  // at a left it computes once; park it collapsed, with `important` like the
  // extension's own value.
  html.style.zoom = String(Z);
  if (hopper) {
    document.body.style.paddingRight = "220px";
    var ac = document.querySelector("#tm_actions_container");
    if (ac) ac.style.setProperty("left", (window.innerWidth / Z) + "px", "important");
  }
  window.dispatchEvent(new Event("resize"));
  void document.body.offsetWidth;

  // ---- the add-on's dialog / settings panel ----
  var shot = null, box = null;
  if (!hostKind) {
    removeShotCopy();
    if (document.querySelector("[data-chc]")) escape();
  } else {
    var other = [].filter.call(document.querySelectorAll("[data-chc]"), function (h) {
      return h.getAttribute("data-chc") !== hostKind;
    });
    if (other.length) { removeShotCopy(); escape(); }
    var live = document.querySelector('[data-chc="' + hostKind + '"]');
    if (!live) {
      var btn = null;
      if (scene === "keys") {
        var rows = [].filter.call(document.querySelectorAll('.saml-role:not([data-jump="1"])'), function (r) {
          return getComputedStyle(r).display !== "none" && r.querySelector(".chc_btn");
        });
        btn = rows.length ? rows[0].querySelector(".chc_btn") : null;
      } else if (scene === "all") {
        btn = document.querySelector("#chc_toolbar .chc_btn, #chc_toolbar_plain .chc_btn:last-of-type");
      } else if (scene === "settings") {
        btn = document.querySelector(".chc_menu_action, #chc_toolbar_plain .chc_btn");
      }
      if (btn) { btn.click(); pending = "opening " + scene; }
      else leaks.push("no button to open the " + scene + " scene");
    } else {
      var root = live.shadowRoot;
      var state = live.getAttribute("data-chc-state") || "";
      if (!root) {
        leaks.push("the add-on's shadow root is closed: load the open-root dev build (README.md)");
      } else if (state === "loading" || !root.querySelector(".box")) {
        pending = "waiting for STS";
      } else if (state === "error" || /fail=[1-9]/.test(state)) {
        leaks.push("the dialog reports " + state);
      } else {
        removeShotCopy();
        var shotHost = document.createElement("div");
        shotHost.id = "chc_shot_host";
        shot = shotHost.attachShadow({ mode: "open" });
        shot.innerHTML = root.innerHTML;
        document.body.appendChild(shotHost);
        live.style.setProperty("display", "none", "important");
        scrubTree(shot);
        // A closed select shows only its chosen option; the rest (the
        // export formats carry product names) are dropped from the copy so
        // the leak check reads what the frame shows.
        shot.querySelectorAll("select").forEach(function (sel) {
          [].slice.call(sel.options).forEach(function (o) {
            if (!o.selected) o.remove();
          });
        });
        shot.querySelectorAll(".sec").forEach(function (sec) {
          var h2 = sec.querySelector("h2");
          if (h2 && /More formats/.test(h2.textContent)) {
            sec.setAttribute("data-shot-more", "1");
            var chips = sec.querySelector(".chips");
            if (chips) chips.style.display = "none";
          }
        });
        if (scene === "settings") {
          var tpls = shot.querySelector(".tpls");
          if (tpls && !tpls.querySelector(".tpl")) {
            tpls.innerHTML =
              '<div class="tpl"><div class="row"><input type="text" class="in tplName" maxlength="40">' +
              '<button type="button" class="ghost danger tplDel">Remove</button></div>' +
              '<textarea class="in tplBody" maxlength="4000"></textarea></div>';
            tpls.querySelector(".tplName").value = TEMPLATE.name;
            tpls.querySelector(".tplBody").value = TEMPLATE.body;
          }
        }
        box = shot.querySelector(".box");
        // Fit the frame: the box must not scroll inside its scrim. Drop the
        // whole "More formats" section before giving up.
        if (box && box.getBoundingClientRect().bottom > 798) {
          var more = shot.querySelector("[data-shot-more]");
          if (more) more.style.display = "none";
        }
      }
    }
  }

  // ---- refuse the shot if anything real, or any product name, is legible ----
  var styleCache = new Map();
  function hidden(el) {
    while (el) {
      var d = styleCache.get(el);
      if (d === undefined) { d = getComputedStyle(el).display; styleCache.set(el, d); }
      if (d === "none") return true;
      el = el.parentElement;
    }
    return false;
  }
  function visibleText(rootNode) {
    var out = [];
    var walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var p = node.parentElement;
      if (!p || /^(STYLE|SCRIPT|NOSCRIPT|TEMPLATE)$/.test(p.tagName) || hidden(p)) continue;
      var t = node.nodeValue.trim();
      if (t) out.push(t);
    }
    return out.join("\n");
  }
  var txt = visibleText(document.body);
  var shotTxt = shot ? visibleText(shot) : "";
  var all = txt + "\n" + shotTxt;

  realIds.forEach(function (id) { if (all.indexOf(id) !== -1) leaks.push("real account id still visible"); });
  (all.match(/\b\d{12}\b/g) || []).forEach(function (num) {
    if (IDS.indexOf(num) === -1) leaks.push("12-digit number not in the demo set: " + num.slice(0, 4) + "…");
  });
  (all.match(/\bA[SK]IA[A-Z0-9]{16}\b/g) || []).forEach(function (key) {
    if (key !== FAKE_KEY) leaks.push("real access key id still visible");
  });
  if (/\bCH[A-Z][a-z]/.test(all)) leaks.push("CH role name still visible");
  if (/localhost|127\.0\.0\.1|:4000\b/i.test(all)) leaks.push("the local identity provider's address is visible");
  swapKeys.forEach(function (real) { if (all.indexOf(real) !== -1) leaks.push("real account name still visible"); });
  (all.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || []).forEach(function (mail) {
    if (mail !== SESSION_NAME) leaks.push("an e-mail address other than the demo session name is visible");
  });
  var brand = all.match(BRAND_RE);
  if (brand) leaks.push("third-party product name visible: " + brand[0]);
  all.split("\n").forEach(function (line) {
    if (/secret|session.?token|SessionToken|SecretAccessKey/i.test(line) && /[=:"']/.test(line) && line.indexOf("•") === -1)
      leaks.push("a secret or token line is not masked: " + line.slice(0, 24) + "…");
    if (/[A-Za-z0-9/+]{40}/.test(line) && !/^https?:/.test(line))
      leaks.push("a 40-character secret-looking run is visible: " + line.slice(0, 12) + "…");
  });
  if (shot) {
    var reveal = shot.querySelector('[data-act="reveal"]');
    if (reveal && reveal.checked) leaks.push("Reveal secrets is on");
  }
  function allowed(sel, poolList, what) {
    document.querySelectorAll(sel).forEach(function (el) {
      if (el.children.length !== 0 || hidden(el)) return;
      var v = el.textContent.trim();
      if (v && poolList.indexOf(v) === -1) leaks.push(what + " not in the demo set: " + v);
    });
  }
  allowed(".tm_role_name, .saml-role-description", ROLE_POOL, "role");
  allowed(".tm_account_name", NAMES, "account name");
  allowed(".tm_account_id", IDS, "account id");
  allowed(".tm_set_name", SETS, "set name");
  document.querySelectorAll('.tm_filter_button[data-group="tag"]').forEach(function (el) {
    var v = el.textContent.trim();
    if (v && TAGS.indexOf(v) === -1 && !/^(Direct roles|⤳ Jumps)$/.test(v)) leaks.push("tag not in the demo set: " + v);
  });
  if (/\((?:IAM|EC2|S3|Billing)[,)]/.test(all)) leaks.push("AWS service list in visible text");

  var row = document.querySelector(".saml-role");
  var rb = row ? row.getBoundingClientRect() : null;
  var bb = box ? box.getBoundingClientRect() : null;
  var vw = window.innerWidth, vh = window.innerHeight;
  var framing = {
    vw: vw, vh: vh, shot: { x: 0, y: 2, w: 1280, h: 800 },
    rowLeft: rb ? Math.round(rb.left) : null,
    rowRight: rb ? Math.round(rb.right) : null,
    boxTop: bb ? Math.round(bb.top) : null,
    boxBottom: bb ? Math.round(bb.bottom) : null,
    keysButtons: document.querySelectorAll(".chc_btn").length
  };
  framing.ok = vw >= 1280 && vh >= 802 && !!rb && rb.left > 0 && rb.right <= vw &&
    (!hostKind || (!!bb && bb.width > 0 && bb.top > 2 && bb.bottom < 800));

  var uniq = leaks.filter(function (l, i) { return leaks.indexOf(l) === i; });
  return JSON.stringify({
    scene: scene,
    hopper: hopper,
    accounts: realIds.length,
    pending: pending,
    leaks: uniq,
    framing: framing
  });
})();
