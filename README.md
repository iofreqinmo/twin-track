# Twin Track

A simple phone-friendly app for tracking twin infants' feedings and diapers.

- **At a glance:** each baby's card shows time since last feed and last diaper, plus feeds, wet and dirty counts for the last 24 hours.
- **One-tap logging:** 🍼 / 💧 on each card, or **Feed both** / **Change both** to log for both twins at once.
- **Feeds:** bottle (amount, breast milk or formula) or breast (side, minutes). It suggests the next side.
- **Diapers:** wet, dirty, or both.
- **History:** grouped by day and filterable by baby. Tap an entry to edit or delete it (deletes can be undone).
- **Settings:** baby names and colors, oz or ml, backup export/import (JSON), CSV export for the pediatrician.
- Works offline, follows your phone's dark mode for night feeds, and can be installed to the home screen.

## Data

Everything is stored in the browser's local storage on the device you use. Nothing is sent anywhere.
Each phone keeps its own log, so use **Export backup** regularly and **Import backup** to move data between devices.

## Running it

It's plain HTML/CSS/JS with no build step.

- **Locally:** `python3 -m http.server` in this folder, then open http://localhost:8000.
- **On your phone:** host it anywhere that serves static files. With GitHub Pages: repo **Settings → Pages**, pick the branch and `/ (root)`. Open the URL on your phone, then use **Share → Add to Home Screen** (iOS) or **Install app** (Android).

When you change files, bump `CACHE` in `sw.js` so installed copies pick up the update.
