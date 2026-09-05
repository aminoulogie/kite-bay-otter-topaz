# Grok version — what changed

This branch / repo is the Grok patch on top of `aminoulogie/kite-bay-otter-topaz`.

## Workout database

- App sessions are dated with the **local** calendar day, not `toISOString()` UTC.
- Unsaved live sets (ticked but not Saved) still appear in Database / graphs / Ahead.
- A second workout on the same day is archived instead of overwriting the first.
- Same-lift sets from two sessions on one day are appended.

## Other fixes

- Overload jumps use kg **or** lb increments, matching Settings.
- Changing a calorie/macro target immediately applies to today and empty days (Fuel graph Y-axis can show 3600).
- Creatine stash cannot go negative or refund more than was taken.
- Undo/redo no longer crash on a bad snapshot.
- Backups include extra sessions and programs.
- USDA barcode lookup only runs when `VITE_USDA_API_KEY` is set (no public DEMO_KEY).
- Calendar is a centered / bottom sheet with a date dropdown, not a full-screen right popup.

## How to run

Same as the original app: `npm install` then `npm run dev`.
Data stays in the browser (`localStorage`). This patch does not migrate a phone install by itself — copy the branch into the project you actually deploy.
