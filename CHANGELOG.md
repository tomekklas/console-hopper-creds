# Changelog

All notable changes to Console Hopper Creds are listed here. Dates are in
`YYYY-MM-DD`. Versions follow the value in `manifest.json`.

## 0.1.0 — unreleased

First build.

- Needs **Console Hopper 1.9.0 or later** on the page. Without it, a short
  note says so where the buttons would be (Console Hopper's right column,
  or beside AWS's Sign In button), and nothing else is added.
- **Keys** on every SAML role row (beside Console Hopper's Sign In button)
  and **Keys for all roles**,
  which follows Console Hopper's filters and search: with a filter on it
  reads "Keys for N shown roles" and asks only for those.
- **Creds Settings** at the end of Console Hopper's side menu, opening an
  in-page settings panel; the same fields
  are on the extension's options page.
- The two extensions never message each other. This one adds to the page
  Console Hopper builds and reads the sign-in expiry Console Hopper 1.9.0
  marks on `<html>` (`data-console-hopper-signin-until`,
  `-signin-expired`, `-expiry-ui`).
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
- Keys greys out the moment Console Hopper says the sign-in has expired
  (AWS accepts a SAML sign-in page for about five minutes); the note under
  **Keys for all roles** then reads "Sign-in expired". Console Hopper owns
  the banner and the rule; there is no countdown.
- `ExpiredTokenException` ("Token must be redeemed within 5 minutes of
  issuance") reads as a sign-in that is too old, with a prompt to sign in
  again. When every role in **Keys for all roles** fails for the same
  reason, the dialog says it once above the table instead of on each row.
- The Keys buttons in Console Hopper's rows show the same cursor as the
  one in its right column: a hand while they work, "not allowed" once the
  sign-in is too old, over the icon and label too.
- `enabled: false` by Chrome managed policy switches the extension off.
