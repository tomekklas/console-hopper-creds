# Store screenshot staging

Produces a 1280×800 Chrome Web Store screenshot from the live role picker
(mock-saml signed into a real AWS account, Console Hopper and this add-on
both loaded).

    ./resignin.sh <chrome-window-id>            # when the Keys buttons are grey
    ./shoot.sh <chrome-window-id> out.png [scene]
    ./reload-addon.sh                           # after npm run build or a dist patch

`scene` is `picker` (default), `keys`, `all`, `plain` or `settings`. The
window id: `osascript -e 'tell application "Google Chrome" to get id of front window'`.

`shoot.sh` sizes and activates the Chrome window, runs `stage.js` in its
active tab (several passes: stage the picker, open the scene, wait for STS,
freeze and rewrite the dialog, leak-check the final frame) and captures the
viewport 1:1. `resignin.sh` reloads the picker through mock-saml's login
form: AWS accepts a SAML response for new keys for only a few minutes.

**Prerequisites**

- mock-saml on `localhost:4000`, the picker tab signed in through it.
- Chrome's **View → Developer → Allow JavaScript from Apple Events**.
- Screen Recording permission for the app running the script (Claude's
  terminal panel had it; a `!` command and another terminal did not, and
  failed with "could not create image from rect"); the display unlocked.
  Nobody uses the Mac while it runs: `screencapture` grabs whatever is in
  front, so `shoot.sh` refuses the shot unless Chrome is the front app
  right before and right after the capture.
- For `keys`, `all` and `settings`: the add-on's dialog and settings panel
  live in **closed** shadow roots, which the staging script cannot reach.
  Load a dev build with the roots opened, never shipped:

      npm run build
      sed -i '' 's/mode:"closed"/mode:"open"/g' dist/content.js

  then `./reload-addon.sh` (or the reload button at `chrome://extensions`).
  Afterwards `npm run build` and reload again, so the clean closed-root
  build is back. The 0.1.0 shots ran as one line that does all of it:

      cd ~/Dev/console-hopper-creds && sed -i '' 's/mode:"closed"/mode:"open"/g' dist/content.js \
        && store-assets/shots/reload-addon.sh && cd store-assets/shots \
        && ./resignin.sh <win> && ./shoot.sh <win> ../screenshot-3-all.png all; \
        cd ~/Dev/console-hopper-creds && npm run build >/dev/null && store-assets/shots/reload-addon.sh

- On a Retina display the capture comes out at twice the size and is
  scaled down 2:1 to 1280×800. `STAGE_ONLY=1` stages and leak-checks
  without capturing.
- For `plain`: disable Console Hopper at `chrome://extensions`, sign in
  again (the page must load without it), shoot, re-enable it.

**What `stage.js` does**

- Maps every real account id (from the rows' role ARNs and Console Hopper's
  `data-account-id`) to an AWS-doc placeholder (`111122223333`, …), account
  names to acme-/globex-/initech- names, `CH*` roles to `Billing`,
  `ReadOnly`, `PowerUser`, …; the map is kept on `<html>` so every pass and
  every scene agrees. Data attributes keep their real values; a reload
  restores the page.
- Shows the dialog or settings panel as a static copy in an open shadow
  root of its own and hides the live host, so the dialog's own re-render
  cannot paint real values back. In the copy: access key ids become
  `ASIAIOSFODNN7EXAMPLE`, the session name `alice@example.com`, secrets
  stay masked (Reveal is never ticked), the "More formats" chip row is
  hidden (product names), and the settings scene shows one demo template.
- Refuses the shot if any real id, real name, `CH*` role, real `ASIA` key,
  other e-mail address, product name, unmasked secret line or
  40-character secret-looking run is still legible, or the dialog box does
  not fit the frame.
- Renders the picker at CSS zoom 0.84 (the plain picker at 1) and parks
  Console Hopper's slide-out menu, as Console Hopper's own shoot does.
