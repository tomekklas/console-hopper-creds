// Settings page. Bundled to options.js.
import { loadSettings, saveSettings } from "../shared/settings.js";
import { TEMPLATE_KEYS } from "../shared/formats.js";

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");

let templates = [];

const renderTemplates = () => {
  const box = $("templates");
  box.innerHTML = templates
    .map(
      (t, i) => `
      <div class="tpl" data-i="${i}">
        <div class="row">
          <input type="text" class="tplName" maxlength="40" placeholder="name shown on the chip" value="${esc(t.name)}">
          <button type="button" class="danger tplDel">Remove</button>
        </div>
        <textarea class="tplBody" maxlength="4000" placeholder="e.g. mytool login --key {{accessKeyId}} --secret {{secretAccessKey}} --token {{sessionToken}}">${esc(t.body)}</textarea>
      </div>`
    )
    .join("");
  box.querySelectorAll(".tplDel").forEach((b) =>
    b.addEventListener("click", () => {
      const i = Number(b.closest(".tpl").getAttribute("data-i"));
      readTemplates();
      templates.splice(i, 1);
      renderTemplates();
    })
  );
};

const readTemplates = () => {
  templates = [...document.querySelectorAll("#templates .tpl")].map((el) => ({
    name: el.querySelector(".tplName").value,
    body: el.querySelector(".tplBody").value,
  }));
};

(async () => {
  $("keys").textContent = TEMPLATE_KEYS.map((k) => `{{${k}}}`).join(" ");
  const s = await loadSettings();
  $("duration").value = String(s.duration);
  $("profilePattern").value = s.profilePattern;
  $("region").value = s.region;
  templates = s.templates;
  renderTemplates();

  $("addTpl").addEventListener("click", () => {
    readTemplates();
    templates.push({ name: "", body: "" });
    renderTemplates();
  });

  $("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    readTemplates();
    const saved = await saveSettings({
      ...s,
      duration: $("duration").value,
      profilePattern: $("profilePattern").value,
      region: $("region").value,
      templates,
    });
    templates = saved.templates;
    renderTemplates();
    $("status").textContent = "Saved.";
    setTimeout(() => ($("status").textContent = ""), 2000);
  });
})();
