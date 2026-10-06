# Twin Track

A simple phone-friendly app for tracking twin infants' feedings and diapers.

- **At a glance:** cards for RCG 👧 and HDG 👦 show the time of the last feed and last diaper, a bar chart of every feed in the last 24 hours (ml per feed, with the 24-hour total), plus feeds, poops and pees.
- **One Log button per baby:** opens a single screen with Feeding and Diaper sections. Fill in either or both, and tap the other twin's name to log for both at once.
- **Feeds:** bottle (amount in ml with ±5 ml buttons; breast milk, formula or a combo of both), breast (side, minutes), or combo (both). It suggests the next side.
- **Diapers:** pee, poop, or both.
- **History → Today:** total volume, average volume per feed, feeds, poops and pees for each baby, plus today's entries.
- **History → Last 7 days:** the same numbers for each day, with a daily average. Tap a day to see or edit its entries. Tap an entry to edit or delete it (deletes can be undone).
- **Settings:** baby names and colors, ml or oz, backup export/import (JSON), CSV export for the pediatrician.
- Works offline, follows your phone's dark mode for night feeds, and can be installed to the home screen.

## Data

- **Shared family log (recommended):** with Firebase set up, entries live in a Firestore database and sync live between everyone signed in.
  Only the Google accounts listed in `firestore.rules` can see or change them. Setup steps: [SETUP-FIREBASE.md](SETUP-FIREBASE.md).
- **This phone only:** while `firebase-config.js` is left as `null`, entries are stored only in the browser on the device you use.

Either way the app keeps a copy on the phone, so it opens instantly and works offline.

## Running it

It's plain HTML/CSS/JS with no build step.

- **Locally:** `python3 -m http.server` in this folder, then open http://localhost:8000.
- **On your phone:** host it anywhere that serves static files. With GitHub Pages: repo **Settings → Pages**, pick the branch and `/ (root)`. Open the URL on your phone, then use **Share → Add to Home Screen** (iOS) or **Install app** (Android).

When you change files, bump `CACHE` in `sw.js` and `APP_VERSION` in `app.js`. `vendor/firebase.js` is a bundled copy of the Firebase SDK; rebuild it with `scripts/build-firebase.sh`. Installed copies check for updates whenever they are opened and reload themselves.
