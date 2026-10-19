# Privacy policy — Console Hopper Creds

Last updated: 2026-10-15

## In one paragraph

Console Hopper Creds runs only on AWS's SAML sign-in page. When you click
**Keys**, it reads the page's own SAML response and sends it, together with
the role you chose, to AWS Security Token Service (STS), which answers with
temporary credentials. Those credentials are shown to you in a dialog on
that page and exist only while the dialog is open. The extension stores no
credentials, keeps no logs, sends nothing to anyone but AWS, and has no
server of its own.

## What it reads

- **The SAML response** on `signin.aws.amazon.com/saml` (and the regional
  `*.signin.aws.amazon.com/saml` pages): the hidden form field AWS uses
  to sign you in. From it the extension takes the list of roles, the role
  session name, the session length your identity provider asked for, and
  the time until which AWS accepts the response. It is read when the page
  loads (to place the buttons) and when you click **Keys** (to send to
  STS). It is never stored.
- **Account names and role names** shown on the page, to label the
  buttons and the dialog.
- **Console Hopper's markers** on the page: whether Console Hopper 1.9.0
  or later is there, and the time it says AWS stops accepting this
  sign-in, so the Keys buttons can grey out on time. Read on the page
  only.

## What it sends, and to whom

- To **AWS STS** (`sts.<region>.amazonaws.com`, or the GovCloud / China
  equivalent): one `AssumeRoleWithSAML` request per role you asked for,
  containing the SAML response, the role ARN, the SAML provider ARN and the
  requested session length. This happens only when you click **Keys** or
  **Keys for all roles**. If AWS refuses the length, the same request is
  retried with a shorter one.
- Nothing else, to no one else. There is no telemetry, analytics, crash
  reporting or update check.

## What it stores

- **Settings** in Chrome's extension storage (synced with your Chrome
  profile if sync is on): session length, profile-name pattern, region,
  the shell you last picked, and any templates you wrote. Never
  credentials, never the SAML response.
- **Credentials**: nowhere. They are held in memory while the Keys dialog
  is open and discarded when it closes. If you copy them or download a
  credentials file, where that copy goes is up to you.

## What it does not do

- It does not read cookies, your AWS console pages, or any page other
  than the sign-in page.
- It does not talk to Console Hopper or any other extension.
- It does not run on managed browsers where an administrator set
  `enabled: false` by policy.

## A note for administrators

The extension gives a user nothing they could not already do by hand: the
SAML response passes through their browser, and the AWS CLI's
`assume-role-with-saml` command accepts it. Preventing key issuance is an
AWS-side matter (role trust policies, STS deny statements, sign-in
resource policies). To keep this extension off your fleet, block its
extension ID or set `enabled: false` through Chrome's managed storage
policy for it.

## Contact

Open an issue at https://github.com/tomekklas/console-hopper-creds.
