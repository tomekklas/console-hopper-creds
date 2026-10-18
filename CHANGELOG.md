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
- Buttons go dark once AWS would no longer accept the sign-in: 4.5 minutes
  after the response's `IssueInstant` (as in Console Hopper), or its
  `NotOnOrAfter` if that is sooner. STS refuses a response older than five
  minutes even when the IdP stamps `NotOnOrAfter` later, as mock-saml does
  at ten.
- `ExpiredTokenException` ("Token must be redeemed within 5 minutes of
  issuance") reads as a sign-in that is too old, with a prompt to sign in
  again. When every role in **Keys for all roles** fails for the same
  reason, the dialog says it once above the table instead of on each row.
- Once the sign-in is too old, a banner across the top of the page says
  so: neither Keys nor a new sign-in from that page will work, and the way
  out is to sign in again through the identity provider. When the page's
  referrer names the identity provider, the banner links back to it
  (origin only; never stored or sent). The banner can be hidden; the note
  under **Keys for all roles** turns red and short.
- The Keys buttons in Console Hopper's rows show the same cursor as the
  one in its right column: a hand while they work, "not allowed" once the
  sign-in is too old, over the icon and label too.
- `enabled: false` by Chrome managed policy switches the extension off.
