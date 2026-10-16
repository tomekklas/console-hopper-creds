# Store assets

What the Chrome Web Store dashboard needs for Console Hopper Creds, and
where it comes from.

| Field / upload | Source |
|---|---|
| Package zip | `npm run build` → `console-hopper-creds.zip` at the repo root (git-ignored) |
| Icon 128×128 | in the zip (`icons/icon128.png`) |
| Every text field | `submission-<version>.txt` (paste-ready, one block per field) |
| Detailed description | `detailed-description.txt` (paste whole) |
| Screenshots, 1280×800, 1–5 | `screenshot-*.png` in this folder — **not shot yet** |
| Small promo tile 440×280 | optional, not made |

## Before every submission

1. `npm test && npm run lint && npm run format:check && npm run build`.
2. Measure the capped fields after ANY edit (the form counts a line break
   as two characters):

   ```bash
   awk '/^--- Summary/{f=1;next} /^---/{f=0} f' store-assets/submission-0.1.0.txt | tr -d '\n' | wc -c
   awk '/^--- Single purpose/{f=1;next} /^---/{f=0} f' store-assets/submission-0.1.0.txt | tr -d '\n' | wc -c
   awk '/^--- Host permission justification/{f=1;next} /^---/{f=0} f' store-assets/submission-0.1.0.txt | tr -d '\n' | wc -c
   ```

   Summary ≤ 132, single purpose ≤ 1000, each justification ≤ 1000.
3. `PRIVACY.md`, the permission justifications and the PRIVACY paragraph
   of the description must say the same thing (what is read, what goes to
   AWS, what is stored). Change one, change all three.

## What the store has flagged before (Console Hopper's history)

- Third-party brand names in listing text or screenshots: none. The
  dialog's format chips carry product names, so a screenshot of the Keys
  dialog must crop or hide the "More formats" row.
- Lists of AWS service names: none in the description. "AWS Security
  Token Service" appears once, where the data disclosure needs it.
- Real data in screenshots: no real 12-digit account ids, no real access
  key ids, no real role or account names. Stage AWS-doc style placeholder
  ids (111122223333, 444455556666, …), acme-/globex-style names and
  generic roles (ReadOnly, PowerUser, Billing).
- The extension name carries neither "AWS" nor "Amazon". The description
  ends with the affiliation disclaimer.

## Shooting the screenshots

The picker is real (mock-saml signed into a real AWS account), so every
visible value must be rewritten in the DOM before the capture, the way
Console Hopper's `store-assets/shots/stage.js` does: map each real
account id to a placeholder, rename accounts and roles, then scan the
frame for any remaining 12-digit number or `ASIA` key id and refuse the
shot if one is left. The Keys dialog lives in a closed shadow root, so
staging its contents needs a local build with the root opened
(`sed -i '' 's/mode:"closed"/mode:"open"/g' dist/content.js` after
`npm run build`, loaded unpacked, never shipped): rewrite the account id
pill, the key id and the expiry, keep secrets masked, hide the "More
formats" chips. Capture at a 1280×800 viewport with `screencapture -R`
(see the Console Hopper repo's `store-assets/shots/shoot.sh` for the
window geometry and focus gotchas). Rebuild the clean package afterwards.
