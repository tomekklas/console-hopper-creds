# Console Hopper Creds

A Chrome extension for the classic AWS SAML sign-in page
(`signin.aws.amazon.com/saml` and its regional hosts). It adds a **Keys**
button to every role your identity provider lists, and a **Keys for all
roles** button for the lot. A click exchanges the page's own SAML response
for temporary credentials with AWS STS and shows them in every form you
might paste: environment variables for four shells, a profile for
`~/.aws/credentials`, the raw values, `aws configure set` lines,
`credential_process` JSON, `.env`, Docker, Terraform, SDK snippets,
1Password, and your own templates. "All roles" gives one credentials file
with a profile per role, and follows Console Hopper's filters: narrow the
picker to one organisation or environment and you get keys for just those.

It is a companion to [Console Hopper](https://github.com/tomekklas/console-hopper),
but a one-sided one: Console Hopper contains nothing for it and knows
nothing about it. This extension adds its buttons to the page Console
Hopper has built (a Keys button inside each Sign In cell, a button in the
right-hand column, a **Creds Settings** entry at the end of the side menu),
the same way it adds them to AWS's plain picker when Console Hopper is not
installed. The two extensions never communicate; they share only the page.

## Why a separate extension

Many organisations do not allow turning a console sign-in into CLI keys.
Console Hopper is used in such places and promises to never read
credentials. So this lives in its own extension with its own ID: an
organisation that must not have it blocks (or simply never allows) this
ID, and Console Hopper stays as it is. Administrators who allow the
install but want it off can also set `enabled: false` by Chrome policy
(see `managed_schema.json`).

Note that this extension adds no capability a user doesn't already have:
the SAML response transits the browser, and
`aws sts assume-role-with-saml` accepts it from DevTools. Only AWS-side
policy (role trust policies, STS deny statements, sign-in resource
policies) actually prevents key issuance.

## How it works

1. The content script reads the `SAMLResponse` hidden field on the role
   picker and lists the roles in it (the
   `https://aws.amazon.com/SAML/Attributes/Role` attribute), the
   `RoleSessionName`, the IdP's `SessionDuration`, and how long AWS will
   still accept the response (`SubjectConfirmationData/@NotOnOrAfter`,
   else five minutes from `IssueInstant`).
2. A click sends the assertion and the chosen role(s) to the service
   worker, which POSTs `AssumeRoleWithSAML` to the **regional** STS
   endpoint of the sign-in page (regional tokens work in opt-in regions;
   GovCloud and China partitions use their own hosts). No signature is
   needed, and STS allows any origin, so no host permission is declared.
3. If the role allows a shorter session than asked for, the call is
   retried at 1 hour, then 15 minutes, and the dialog says so.
4. The credentials are shown in a dialog on the page and exist only
   while it is open. Nothing is stored, logged or sent anywhere else.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Your settings (session length, profile-name pattern, region, templates). Never credentials. |
| content script on `https://signin.aws.amazon.com/saml`, `https://*.signin.aws.amazon.com/saml` | The role picker is the only page it touches. |

No host permissions, no `webRequest`, no `downloads` (the credentials-file
download is a plain in-page save), no `cookies`, no `tabs`.

## Settings

Open **Creds Settings** from Console Hopper's side menu, the **Settings**
button in the Keys dialog, or chrome://extensions → Details → Extension
options:

- **Session length**: follow the IdP's `SessionDuration` (default) or a
  fixed 15 min – 12 h.
- **Profile name pattern**: default `{account}-{role}`; also
  `{accountId}`.
- **Region** for env vars and profiles (default: the sign-in page's).
- **Templates**: any format with `{{accessKeyId}}`-style placeholders.

## Install from source

```bash
npm install
npm run build
```

Then load the `dist/` folder unpacked at chrome://extensions. `npm run
icons` redraws the icons (needs Python 3 with Pillow).

## Project structure

```
console-hopper-creds/
├── manifest.json           # Manifest V3; content script + module service worker
├── background.js           # Service worker: the STS exchange
├── src/content/index.js    # Content script: find roles, place buttons (→ dist/content.js)
├── src/content/dialog.js   #   the Keys dialog (closed shadow root)
├── src/content/settings-panel.js  # in-page settings (closed shadow root)
├── src/content/styles.js   #   button + dialog CSS
├── src/options/index.js    # Settings page script (→ dist/options.js)
├── src/shared/saml.js      # Read the SAML response (unit-tested)
├── src/shared/sts.js       # Endpoint, request, reply, back-off (unit-tested)
├── src/shared/formats.js   # Every output format (unit-tested)
├── src/shared/settings.js  # Settings + managed-policy switch (unit-tested)
├── options.html            # Settings page
├── managed_schema.json     # Chrome enterprise policy: { "enabled": false }
├── icons/                  # Drawn by scripts/make-icons.py
├── scripts/build.mjs       # Build dist/ and the store zip
├── store-assets/           # Chrome Web Store listing text, submission checklist
├── test/                   # vitest
├── .github/workflows/ci.yml  # lint, format check, tests, build on every push
├── CHANGELOG.md
├── PRIVACY.md
└── README.md
```

## Releasing

`npm run build` writes `dist/` and `console-hopper-creds.zip`. The Chrome
Web Store fields, their character caps and the submission checklist are
in `store-assets/`. One git branch per version, named after the version;
`main` points at the latest.

## Trademarks

AWS and Amazon Web Services are trademarks of Amazon.com, Inc. or its
affiliates. This project is not affiliated with or endorsed by Amazon.

## License

MIT. See `LICENSE`.
