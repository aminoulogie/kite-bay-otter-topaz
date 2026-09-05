# Security notes

## Where the data lives

Everything is on the device: `localStorage` for logs and settings, IndexedDB
for photos. Nothing is sent anywhere except barcode lookups, which send only
the scanned number — no identifiers, no logs, no account.

Outbound requests, in full:

| Destination | Sends | Why |
| --- | --- | --- |
| `world.openfoodfacts.org` | a barcode | product nutrition |
| `world.openproductsfacts.org` | a barcode | fallback for non-food items |
| `api.nal.usda.gov` | a barcode | fallback, better US coverage |
| `fonts.googleapis.com` / `gstatic.com` | nothing but the request | webfonts |

There are no analytics, no trackers, no crash reporting, and no account system.

## Known vulnerability, accepted

`npm audit` reports two issues, both from a single transitive dependency:

- **`tar` 6.2.1 — critical**, arbitrary file creation via hardlink
- **`@capacitor/cli` — high**, because it depends on that `tar`

**Not shipped.** `@capacitor/cli` is a build tool. It unpacks the iOS platform
template during `cap sync` and never reaches the app bundle, so no vulnerable
code runs on a phone. The exposure is limited to a machine running the build
against a malicious archive — which, here, means the Capacitor release
tarballs.

**Fix attempted and reverted.** Overriding to `tar@^7` clears the audit, but
Capacitor 6 calls the v6 API and `cap sync` dies with
`TypeError: Cannot read properties of undefined (reading 'extract')`. A
security fix that breaks the build is not a fix. The override is documented
here rather than left in place.

**When to revisit:** Capacitor 8 moved off the vulnerable range. Upgrading
Capacitor is the real fix; do that rather than forcing the transitive version.

## What is deliberately not implemented

- **Encryption at rest.** Requested and then waived — the ask was "not easy to
  hack", not encrypted. iOS Data Protection already covers the app container
  when the device has a passcode.
- **Face ID lock.** `LocalAuthentication` is native-only and unreachable from a
  web app.
- **Password-protected exports.** Backups are plain JSON. The Settings copy
  says so rather than implying otherwise.

## Input handling

The spreadsheet importer rejects anything it cannot parse rather than guessing,
and reports it. Backups are checksummed and a file that fails validation is
refused outright instead of half-imported. There is no SQL anywhere — the store
is a plain object graph — so there is no query construction to get wrong.
