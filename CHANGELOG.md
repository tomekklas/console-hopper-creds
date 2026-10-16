# Changelog

All notable changes to Console Hopper Creds are listed here. Dates are in
`YYYY-MM-DD`. Versions follow the value in `manifest.json`.

## 0.1.0 — unreleased

First build.

- **Keys** on every SAML role row (beside Console Hopper's Sign In button,
  or beside AWS's label on the plain picker) and **Keys for all roles**,
  which follows Console Hopper's filters and search: with a filter on it
  reads "Keys for N shown roles" and asks only for those.
- **Creds Settings** at the end of Console Hopper's side menu (and a button
  on the plain picker), opening an in-page settings panel; the same fields
  are on the extension's options page.
- Console Hopper itself is untouched: no hook, no slot, no mention. This
  extension adds to the page Console Hopper builds, on its own.
- `AssumeRoleWithSAML` against the sign-in page's regional STS endpoint,
  with GovCloud and China hosts; no host permission needed.
- Session length from the IdP's `SessionDuration` or a setting; retries at
  1 h and 15 min when the role allows less, and says so.
- The dialog: shells (bash/zsh, cmd, PowerShell, fish) × environment
  variables, a credentials-file profile, individual values; more formats
  as chips (`aws configure set`, `credential_process` JSON, `.env`, Docker,
  Terraform, boto3, JS/Go/Java/.NET SDKs, AWS Tools for PowerShell,
  1Password, raw JSON) and user templates; masked secrets with a reveal
  toggle; copy buttons; credentials-file download.
- All roles: a table with per-role status, bulk export as a credentials
  file, config file, env blocks or any format.
- Buttons go dark once AWS would no longer accept the sign-in.
- `enabled: false` by Chrome managed policy switches the extension off.
