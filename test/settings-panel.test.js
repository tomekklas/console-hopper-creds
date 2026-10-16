// @vitest-environment jsdom
//
// The in-page settings panel. Its shadow root is closed, so the test opens
// every root instead and reads the form through host.shadowRoot.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { openSettingsPanel } from "../src/content/settings-panel.js";
import { DEFAULTS } from "../src/shared/settings.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = "";
  const orig = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, "attachShadow").mockImplementation(
    function (init) {
      return orig.call(this, { ...init, mode: "open" });
    }
  );
});

describe("the settings panel", () => {
  it("keeps unsaved field edits across adding and removing a template, then saves them all", async () => {
    const settings = { ...DEFAULTS, templates: [] };
    const saveSettings = vi.fn(async () => {});
    openSettingsPanel({ settings, saveSettings });
    const host = document.querySelector('[data-chc="settings"]');
    expect(host).not.toBeNull();
    const root = host.shadowRoot;
    root.querySelector("#chc_duration").value = "900";
    root.querySelector("#chc_pattern").value = "{accountId}_{role}";
    root.querySelector("#chc_region").value = "eu-west-1";

    // Adding a template redraws the form: the edits must survive.
    root.querySelector('[data-act="add"]').click();
    expect(root.querySelector("#chc_duration").value).toBe("900");
    expect(root.querySelector("#chc_pattern").value).toBe("{accountId}_{role}");
    expect(root.querySelector("#chc_region").value).toBe("eu-west-1");
    expect(root.querySelectorAll(".tpl")).toHaveLength(1);
    root.querySelector(".tplName").value = "mine";
    root.querySelector(".tplBody").value = "K={{accessKeyId}}";

    // A second template, removed again: still there.
    root.querySelector('[data-act="add"]').click();
    root.querySelectorAll(".tplDel")[1].click();
    expect(root.querySelectorAll(".tpl")).toHaveLength(1);
    expect(root.querySelector("#chc_region").value).toBe("eu-west-1");
    expect(root.querySelector(".tplName").value).toBe("mine");

    root.querySelector('[data-act="save"]').click();
    await flush();
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(saveSettings.mock.calls[0][0]).toMatchObject({
      duration: 900,
      profilePattern: "{accountId}_{role}",
      region: "eu-west-1",
      templates: [{ name: "mine", body: "K={{accessKeyId}}" }],
    });
    expect(root.querySelector(".foot .sub").textContent).toBe("Saved.");
    // The form shows what was saved, and the caller's object is updated.
    expect(root.querySelector("#chc_duration").value).toBe("900");
    expect(settings.region).toBe("eu-west-1");

    // Escape closes it.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector('[data-chc="settings"]')).toBeNull();
  });
});
