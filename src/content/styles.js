// Styles for the add-on's buttons (in the page) and its dialog (in a closed
// shadow root). The page CSS reaches the buttons, so those rules are
// specific; the dialog's never leak either way.

export const BUTTON_CSS = `
.chc_btn, .chc_spacer {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 30px; padding: 0 12px; box-sizing: border-box;
  border: 1px solid #d9b27a; border-radius: 4px; background: #fffaf1; color: #8a5413;
  font: 500 13px/1 system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  white-space: nowrap; cursor: pointer; text-decoration: none; vertical-align: middle;
}
.chc_btn:not([disabled]):hover { background: #f6e9d2; color: #6b3f0c; }
.chc_btn:focus-visible { outline: 2px solid #b5701c; outline-offset: 1px; }
.chc_btn[disabled] { opacity: 0.55; cursor: not-allowed; }
/* The cursor over the whole button, icon and label too. Console Hopper sets
   an arrow on everything in a row's button cell and a hand on its buttons,
   both !important, so inside a row these rules need to outrank that. */
.chc_btn *, .chc_btn[disabled] * { cursor: inherit; }
.saml-role .tm_role_buttons .chc_btn,
.saml-role .tm_role_buttons .chc_btn * { cursor: pointer !important; }
.saml-role .tm_role_buttons .chc_btn[disabled],
.saml-role .tm_role_buttons .chc_btn[disabled] * { cursor: not-allowed !important; }
.chc_btn svg, .chc_spacer svg { flex: none; }
/* A Keys-sized blank beside each Jump button, so every row's last cell is
   the same width and Sign In lines up with Jump (see placeJumpSpacers). */
.chc_spacer { visibility: hidden; pointer-events: none; }
.chc_btn.chc_plain { height: 26px; padding: 0 9px; font-size: 12px; margin-left: 8px; }
.chc_btn.chc_all { width: 100%; height: 32px; }
/* Our own cell around Console Hopper's Sign In button: one grid item, as before. */
.chc_row_actions { display: inline-flex; align-items: center; gap: 6px; }
#chc_toolbar { display: block; margin-top: 10px; }
/* A "Creds" section at the end of Console Hopper's side menu, drawn like its own entries. */
.chc_menu_header { font-size: 11px; color: #8a9099; text-align: left; margin: 5px 2px 0; padding-top: 6px; border-top: 1px solid #ededed; }
.chc_menu_action { display: block; padding: 6px 12px; border: 1px solid #d9b27a; border-radius: 4px; background: #fffaf1; text-decoration: none; color: #8a5413; font-size: 13px; text-align: center; min-width: 100px; white-space: nowrap; box-sizing: border-box; }
.chc_menu_action:hover { background: #f6e9d2; color: #6b3f0c; }
body.tm_theme_dark .chc_menu_header { color: #a0aec0; border-top-color: #4a5568; }
body.tm_theme_dark .chc_menu_action { background: #3a2d18; border-color: #8a6a3a; color: #e0a24a; }
body.tm_theme_dark .chc_menu_action:hover { background: #4a3a1f; color: #f0b85c; }
#chc_toolbar_plain { display: inline-flex; align-items: center; gap: 10px; margin-left: 12px; font-size: 12px; color: #555; }
.chc_toolbar_note { display: block; margin-top: 4px; font-size: 11px; color: #6c757d; text-align: center; }
.chc_toolbar_note.chc_note_expired { color: #a7352c; font-weight: 500; line-height: 1.35; }
#chc_expired_banner { position: sticky; top: 0; z-index: 2147482000; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; box-sizing: border-box; width: 100%; padding: 10px 18px; background: #fde8e6; border-bottom: 1px solid #f5c6c1; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); color: #7a2a22; font: 13.5px/1.45 system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
#chc_expired_banner[hidden] { display: none; }
#chc_expired_banner .chc_banner_text { flex: 1 1 420px; min-width: 0; }
#chc_expired_banner strong { font-weight: 600; }
#chc_expired_banner .chc_banner_action { display: inline-flex; align-items: center; height: 30px; padding: 0 14px; border-radius: 4px; background: #a7352c; color: #fff; text-decoration: none; font-weight: 500; white-space: nowrap; }
#chc_expired_banner .chc_banner_action:hover { background: #8a2b23; }
#chc_expired_banner .chc_banner_x { width: 28px; height: 28px; border: 0; border-radius: 4px; background: none; color: inherit; font-size: 20px; line-height: 1; cursor: pointer; }
#chc_expired_banner .chc_banner_x:hover { background: rgba(0, 0, 0, 0.06); }
body.tm_theme_dark #chc_expired_banner { background: #3b1f1c; border-bottom-color: #6b2f29; color: #f6c4bd; }
body.tm_theme_dark #chc_expired_banner .chc_banner_action { background: #c4473c; }
body.tm_theme_dark .chc_toolbar_note.chc_note_expired { color: #f19a90; }
body.tm_theme_dark .chc_btn { background: #3a2d18; border-color: #8a6a3a; color: #e0a24a; }
body.tm_theme_dark .chc_btn:not([disabled]):hover { background: #4a3a1f; color: #f0b85c; }
`;

export const DIALOG_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.scrim { position: fixed; inset: 0; background: rgba(22, 25, 31, 0.55); z-index: 2147483000; display: flex; align-items: flex-start; justify-content: center; padding: 24px 12px; overflow: auto; font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #16191f; font-size: 13px; line-height: 1.45; }
.box { width: min(760px, 100%); background: #fff; border-radius: 8px; box-shadow: 0 18px 48px rgba(0,0,0,0.35); display: flex; flex-direction: column; overflow: hidden; }
.box.wide { width: min(1080px, 100%); }
.head { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid #e1e4e8; border-left: 4px solid var(--stripe, #c7ccd1); }
.head h1 { font-size: 15px; font-weight: 600; margin: 0; }
.head .meta { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.pill { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 9px; border: 1px solid #d5d9de; border-radius: 11px; font-size: 11.5px; color: #444; background: #fff; white-space: nowrap; }
.pill.env { font-weight: 600; }
.pill.ok { background: #e6f4ea; color: #1e7a3c; border-color: #cfe9d6; }
.pill.warn { background: #fff3dc; color: #8a5413; border-color: #f0dcb0; }
.pill.crit { background: #fde8e6; color: #a7352c; border-color: #f5c6c1; }
.pill.run { background: #e8f1f8; color: #0b5f93; border-color: #cfe0ef; }
.mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
.x { margin-left: auto; width: 30px; height: 30px; border: 0; background: none; color: #6c757d; font-size: 20px; cursor: pointer; border-radius: 4px; }
.x:hover { background: #f0f0f0; color: #16191f; }
.body { padding: 14px 18px; display: flex; flex-direction: column; gap: 16px; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.tabs { display: flex; }
.tab { height: 30px; padding: 0 14px; border: 1px solid #ccc; background: #fff; color: #16191f; font: 500 13px system-ui, sans-serif; cursor: pointer; margin-left: -1px; }
.tab:first-child { border-radius: 4px 0 0 4px; margin-left: 0; } .tab:last-child { border-radius: 0 4px 4px 0; }
.tab.on { background: #0073bb; border-color: #0073bb; color: #fff; position: relative; z-index: 1; }
label.chk { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #444; cursor: pointer; }
.sec { display: flex; flex-direction: column; gap: 8px; }
.sec h2 { font-size: 13px; font-weight: 600; margin: 0; }
.sub { font-size: 12px; color: #6c757d; }
.copy { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border: 1px solid #d9b27a; border-radius: 4px; background: #fffaf1; color: #8a5413; font: 500 12px system-ui, sans-serif; cursor: pointer; white-space: nowrap; }
.copy:hover { background: #f6e9d2; }
.copy.done { background: #28a745; border-color: #28a745; color: #fff; }
.ghost { display: inline-flex; align-items: center; height: 28px; padding: 0 12px; border: 1px solid #ccc; border-radius: 4px; background: #fff; color: #16191f; font: 500 12px system-ui, sans-serif; cursor: pointer; white-space: nowrap; text-decoration: none; }
.ghost:hover { background: #f8f9fa; }
.primary { display: inline-flex; align-items: center; height: 28px; padding: 0 14px; border: 1px solid #0073bb; border-radius: 4px; background: #0073bb; color: #fff; font: 500 13px system-ui, sans-serif; cursor: pointer; }
.primary:hover { background: #005a94; }
pre { margin: 0; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; background: #f7f7f5; border: 1px solid #e1e4e8; border-radius: 4px; padding: 10px 12px; white-space: pre-wrap; word-break: break-all; color: #16191f; max-height: 260px; overflow: auto; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { height: 26px; padding: 0 11px; border: 1px solid #adb5bd; border-radius: 13px; background: #fff; font: 400 12px system-ui, sans-serif; color: #16191f; cursor: pointer; white-space: nowrap; }
.chip.on { background: #8a5413; border-color: #8a5413; color: #fff; }
.fields { display: flex; flex-direction: column; gap: 6px; }
.field { display: grid; grid-template-columns: 150px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 12px; }
.val { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; background: #f7f7f5; border: 1px solid #e1e4e8; border-radius: 4px; padding: 5px 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 18px; border-top: 1px solid #e1e4e8; background: #fafafa; flex-wrap: wrap; }
.foot .sub { max-width: 420px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.loading { padding: 40px 18px; text-align: center; color: #6c757d; }
.err { background: #fde8e6; border: 1px solid #f5c6c1; color: #7a2a22; border-radius: 4px; padding: 10px 12px; font-size: 12.5px; }
table { border-collapse: collapse; table-layout: fixed; width: 100%; font-size: 13px; }
th { text-align: left; font-size: 11.5px; font-weight: 600; color: #6c757d; text-transform: uppercase; letter-spacing: 0.04em; padding: 6px 10px; border-bottom: 1px solid #e1e4e8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
td { padding: 7px 10px; border-bottom: 1px solid #eef0f2; vertical-align: middle; white-space: nowrap; }
td.clip { overflow: hidden; text-overflow: ellipsis; }
td.stripe { padding: 0; } td.stripe i { display: block; width: 4px; height: 24px; border-radius: 2px; }
td.copycell { padding-right: 4px; }
td .mini { height: 24px; padding: 0 6px; min-width: 60px; text-align: center; box-sizing: border-box; border: 1px solid #d9b27a; border-radius: 4px; background: #fffaf1; color: #8a5413; font: 500 11.5px system-ui, sans-serif; cursor: pointer; margin-right: 4px; vertical-align: middle; }
td .mini:last-child { margin-right: 0; }
td .mini.done { background: #28a745; border-color: #28a745; color: #fff; }
.tablewrap { overflow: auto; max-height: 60vh; border: 1px solid #e1e4e8; border-radius: 4px; }
select.sel { height: 30px; padding: 0 8px; border: 1px solid #ccc; border-radius: 4px; background: #fff; font: 500 13px system-ui, sans-serif; color: #16191f; }
.gear { font-size: 12px; color: #0073bb; text-decoration: none; }
@media (prefers-color-scheme: dark) {
  .box { background: #1f2329; color: #e8e6df; }
  .head, .foot { border-color: #343a43; } .foot { background: #171a1f; }
  .pill { background: #1f2329; color: #c9ccd1; border-color: #3d444e; }
  pre, .val { background: #121419; border-color: #343a43; color: #e8e6df; }
  .tab, .ghost, .chip, select.sel { background: #2a2f36; border-color: #4a515b; color: #e8e6df; }
  th { border-color: #343a43; } td { border-color: #2a2f36; } .tablewrap { border-color: #343a43; }
  .x:hover { background: #2a2f36; color: #fff; }
  .copy, td .mini { background: #3a2d18; border-color: #8a6a3a; color: #e0a24a; }
  .sub { color: #a2a8b1; } label.chk { color: #c9ccd1; }
  .scrim { color: #e8e6df; }
}
`;

// Extra rules for the settings panel (on top of DIALOG_CSS).
export const SETTINGS_CSS = `
.body { gap: 18px; }
.lbl { display: block; font-weight: 500; font-size: 12.5px; margin: 8px 0 4px; }
.in { width: 100%; padding: 7px 9px; border: 1px solid #ccc; border-radius: 4px; font: 13px system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #16191f; background: #fff; }
textarea.in { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; min-height: 84px; resize: vertical; }
.tpls { display: flex; flex-direction: column; gap: 10px; }
.tpl { border-top: 1px dashed #d5d9de; padding-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.tpl .row { flex-wrap: nowrap; }
.tpl .row .in { flex: 1; }
.ghost.danger { color: #a7352c; }
@media (prefers-color-scheme: dark) {
  .in { background: #121419; border-color: #4a515b; color: #e8e6df; }
  .tpl { border-top-color: #343a43; }
}
`;
