<div align="center">

# 🧰 Chest Tracker

**A polished, local-first chest counter for Fortnite players.**

Count every chest you crack, split your play into sessions, and watch your
records grow — with no account, no backend and no API keys.

React · TypeScript · Vite · Tailwind CSS · localStorage

</div>

---

## Why

Fortnite does not tell you how many chests you opened in a session. This app does
— you tap one big button, and it handles sessions, statistics, records and charts
around it. Everything runs in your browser and stays on your machine.

- **No account, no server, no tracking.** Data is saved in your browser's local storage.
- **Works offline** once the page is open.
- **Yours to export.** One click gives you a JSON backup you can re-import anywhere.

## Features

### Counter
- Oversized counter with the primary **Chest opened** button as the focus of the UI
- Keyboard shortcuts: <kbd>Space</kbd> / <kbd>Enter</kbd> to count, <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> to undo
- Undo the last action, quick `-1` / `+5` adjustments, or type an exact value
- Reset the running session behind a confirmation dialog
- Optional rising `+1` labels, counter pop animation and a synthesised chest blip

### Sessions
- Start and finish sessions explicitly, or just start counting — a session is created for you
- Every session stores its name, date, start time, end time, duration and each individual chest
- Rename and delete sessions, with one-click **Undo** after a delete
- History grouped by day, searchable by name or date, sortable five ways

### Statistics
- Totals: all time, today, last 7 days, last 30 days, tracked playtime
- Averages per session and per active day
- Daily chest chart over 7 / 14 / 30 / 90 days, cumulative growth area chart, looting-by-hour chart
- Personal records: best session, best day, fastest looting rate, longest session
- Current and longest day streak

### Data
- Automatic save on every change, with a final flush when the tab closes
- Export to pretty-printed JSON, named `chest-tracker-YYYY-MM-DD.json`
- Import with **full validation**: bad files are rejected with a readable reason,
  repairable files are imported with a list of what was fixed
- Import as **merge** (keeps what you have, skips duplicates) or **replace**
- Corrupt saved data is never silently lost — it is set aside under a `.broken` key
- Clear warnings when a browser blocks local storage (private windows) or runs out of quota

### Design
- Dark-first premium gaming dashboard with purple/blue/gold accents
- Light theme and four accent presets
- Responsive from a 320 px phone up to a widescreen desktop
- Animations can be switched off; the OS `prefers-reduced-motion` setting is honoured

## Screens

| Page | What it is for |
| --- | --- |
| **Dashboard** | The big counter, today's progress against your daily goal, a 7-day sparkline, key stats and your latest sessions |
| **History** | Every session, grouped by day, with search, sorting, rename and delete |
| **Statistics** | Charts and detailed performance, plus personal records |
| **Settings** | Export/import, danger zone, theme and accent, counting preferences |

## Running it locally

Requires **Node.js 18 or newer** (Node 20+ recommended) and npm.

```bash
git clone https://github.com/<your-username>/fortnite-chest-tracker.git
cd fortnite-chest-tracker
npm install
npm run dev
```

Vite prints a local URL (usually <http://localhost:5173>). Open it and start counting.

### Production build

```bash
npm run build     # type-checks, then builds into dist/
npm run preview   # serves the built output locally
```

The build uses a relative `base`, so `dist/` can be served from any path — a
subfolder, GitHub Pages, Netlify, or your own static host.

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Type-check and build the production bundle into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Run TypeScript without emitting |

## Project structure

```
fortnite-chest-tracker/
├── index.html                 # Vite entry point
├── public/
│   └── chest.svg              # Original SVG favicon
├── src/
│   ├── main.tsx               # React root, providers, error boundary
│   ├── App.tsx                # Routing, theme application, global dialogs
│   ├── index.css              # Design tokens, component classes, animations
│   ├── types.ts               # Session / event / settings types
│   ├── lib/
│   │   ├── storage.ts         # localStorage access, validation, export/import, merge
│   │   ├── stats.ts           # Totals, per-day buckets, streaks, records, histograms
│   │   ├── format.ts          # Date, duration and number formatting
│   │   ├── sound.ts           # WebAudio chest blip (no audio assets)
│   │   ├── id.ts              # Safe id generation
│   │   └── useHashRoute.ts    # Dependency-free hash router
│   ├── state/
│   │   ├── tracker.tsx        # Reducer, persistence, public store API
│   │   └── toast.tsx          # Toast notifications
│   ├── components/            # Shell, counter, charts, cards, dialogs
│   └── pages/
│       ├── Dashboard.tsx
│       ├── History.tsx
│       ├── Statistics.tsx
│       └── Settings.tsx
├── LICENSE                    # MIT
└── package.json
```

## How your data is stored

Everything lives under a single local-storage key, `fortnite-chest-tracker:v1`:

```jsonc
{
  "version": 1,
  "activeSessionId": "…",          // null when no session is running
  "sessions": [
    {
      "id": "…",
      "name": "Session 1",
      "startedAt": 1762800000000,  // epoch ms
      "endedAt": 1762803600000,    // null while running
      "events": [
        { "id": "…", "ts": 1762800123456, "delta": 1, "kind": "chest" }
      ]
    }
  ],
  "settings": { "theme": "dark", "accent": "violet", "dailyGoal": 50 }
}
```

Chests are stored as individual timestamped events rather than a plain total.
That is what makes undo, the per-day charts and the looting-by-hour histogram
work from real data instead of guesses. Exports are the same structure plus an
`app` and `exportedAt` field, and the importer validates every field before
anything touches your existing data.

**Keep in mind:** local storage is per browser and per profile. Clearing site
data, using a private window, or switching to another browser or device means
starting fresh — export a backup first.

## Publishing to GitHub

```bash
git init
git add .
git commit -m "Initial commit: Fortnite Chest Tracker"
git branch -M main
git remote add origin https://github.com/<your-username>/fortnite-chest-tracker.git
git push -u origin main
```

The repository contains no secrets, no `.env` file and no paid or proprietary
dependencies, so it is safe to make public as-is.

### Optional: host it on GitHub Pages

```bash
npm run build
npx gh-pages -d dist      # or push dist/ to a gh-pages branch yourself
```

Then enable Pages for that branch in the repository settings. Because routing is
hash-based and `base` is relative, no rewrite rules are needed.

## Contributing

Issues and pull requests are welcome. Please run `npm run build` before opening a
PR so type errors are caught early.

## Known limitations

- Chests are **counted manually**. Nothing reads the game — there is no official
  API for chest events, and anything that inspected the game process would risk
  your account.
- Data is **per browser**. There is no sync; moving devices means export + import.
- Sessions are bookkeeping, not match detection: one session can span many matches.
- Statistics are computed in the browser on every render. That is instant for
  normal use (thousands of sessions), but a decade of data in one file will
  eventually be noticeable.
- No automated test suite yet; the app has been verified by hand and by a
  production build.

## Legal

MIT licensed — see [LICENSE](LICENSE).

This is an unofficial, fan-made tool. It is **not affiliated with, endorsed by or
sponsored by Epic Games**. Fortnite is a trademark of Epic Games, Inc. No game
assets are bundled or used: every graphic in this app is original CSS and SVG.
