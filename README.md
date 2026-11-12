<div align="center">

# 🧰 Chest Tracker

**A polished, local-first chest counter for Fortnite players.**

Count every chest you crack — in the browser, or as a Windows desktop companion
with global hotkeys that work while Fortnite is in the foreground.

React · TypeScript · Vite · Tailwind CSS · Tauri 2 · localStorage

</div>

---

## Two ways to run it

| | **Web version** | **Windows desktop version** |
|---|---|---|
| Install | none, open it in a browser | NSIS or MSI installer |
| Counting | click the button, or <kbd>Space</kbd> while the tab is focused | **global hotkeys**, any window focused |
| While gaming | needs alt-tab | runs in the system tray |
| Sound | yes | yes, also while minimised |
| Data | browser localStorage | JSON file in your Windows app-data folder |
| Statistics, history, import/export | identical | identical |

Both builds come from the same React code, so the interface, statistics and
data format are the same. Neither one needs an account, a server or an internet
connection.

## Features

### Counter
- Oversized counter with the primary **Chest opened** button as the focus of the UI
- In-window keys: <kbd>Space</kbd> / <kbd>Enter</kbd> to count, <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> to undo
- Undo the last action, quick `-1` / `+5` adjustments, or type an exact value
- Pause and resume a session; paused time is excluded from its duration
- Reset the running session behind a confirmation dialog

### Global hotkeys (desktop only)
| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>1</kbd> | Add one chest |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>2</kbd> | Remove one chest |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>3</kbd> | Undo last action |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>4</kbd> | Pause / resume session |

Every binding can be re-recorded, switched off individually, or turned off as a
group. Registration status is shown per shortcut: if Windows refuses a
combination because another application already owns it, the app says so and
asks you to pick another. It never pretends a shortcut is live when it is not.

### Treasure Hours
Fortnite runs announced windows in which the **Pirate Shop Access Token** drops
more often. The tracker keeps an eye on them:

- **ACTIVE / UPCOMING / INACTIVE** state, with a live countdown to the next start
  and to the end of a running window
- All times in **Europe/Prague**, with your own zone shown underneath when it differs
- The multiplier is displayed **only when Epic announced one**; otherwise it says so
- Every window names its source and when that source was last checked, and
  confirmed windows are visually separated from merely reported ones
- Reminders 30 / 15 / 5 minutes before and at the start, each firing once
- A live marker on the counter while a window is running, and chests recorded
  during one are tagged, so statistics can split them from the rest
- Windows can be added by hand when an announcement lands before the schedule does

Dates are never predicted. If the schedule cannot be loaded the app says the data
is unavailable rather than guessing a Saturday.

### Sessions
- Start and finish sessions explicitly, or just start counting — one is created for you
- Each session stores its name, date, start, end, pauses, duration and every individual chest
- Rename and delete sessions, with one-click **Undo** after a delete
- History grouped by day, searchable by name or date, sortable five ways

### Statistics
- Totals: all time, today, last 7 days, last 30 days, tracked playtime
- Averages per session and per active day
- Daily chest chart over 7 / 14 / 30 / 90 days, cumulative growth, looting by hour
- Personal records: best session, best day, fastest looting rate, longest session
- Current and longest day streak

### Desktop extras
- System tray icon with live session info, start / pause / finish, a shortcut toggle and Quit
- Closing the window hides it to the tray and keeps counting; Quit from the tray exits fully
- Optional **Start with Windows**
- Bundled confirmation sound with a volume slider and a test button
- Single-instance guard so a second launch focuses the running copy

### Data
- Automatic save on every change, plus a flush when the window closes
- Desktop writes through a temporary file and keeps a `.backup.json`, so an interrupted
  write cannot destroy your history
- Export to pretty-printed JSON; import with full validation, as **merge** or **replace**
- Corrupt data is set aside rather than overwritten

## Install the Windows version

1. Open the [Releases page](https://github.com/Domsoww/fortnite-chest-tracker/releases).
2. Download `Chest.Tracker_<version>_x64-setup.exe` (NSIS installer, ~1.4 MB) or
   `Chest.Tracker_<version>_x64_en-US.msi` (~1.9 MB). GitHub replaces the space in
   the file name with a dot when it serves release assets.
3. Run it. It installs for the current user, so no administrator prompt is needed.
4. Launch **Chest Tracker**, start a session, then alt-tab into Fortnite.

The installer is unsigned, so SmartScreen may show "Windows protected your PC"
on first run — choose **More info → Run anyway**, or build it yourself from
source with the instructions below.

### Moving your web data to the desktop app

Browser storage and desktop storage are separate on purpose; nothing is copied
automatically. In the web version choose **Settings → Export JSON**, then in the
desktop app choose **Settings → Import JSON** and pick **Merge** or **Replace**.

## Running from source

Requires **Node.js 18+** (20 recommended). The desktop build additionally needs
the [Rust toolchain](https://rustup.rs) and, on Windows, the
**WebView2 runtime** (pre-installed on Windows 11 and current Windows 10).

```bash
git clone https://github.com/Domsoww/fortnite-chest-tracker.git
cd fortnite-chest-tracker
npm install
npm run dev
```

### Web production build

```bash
npm run build     # type-checks, then builds into dist/
npm run preview   # serves the built output locally
```

### Desktop app

```bash
npm run desktop:dev     # Tauri dev build with hot reload
npm run desktop:build   # production app + installers
```

Installers land in `src-tauri/target/release/bundle/`:
`nsis/Chest Tracker_2.0.0_x64-setup.exe` and `msi/Chest Tracker_2.0.0_x64_en-US.msi`.
Building Windows installers requires a Windows machine or a Windows CI runner —
they cannot be produced from macOS or Linux.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check and build the web bundle into `dist/` |
| `npm run preview` | Serve the production web build |
| `npm run typecheck` | TypeScript with no emit |
| `npm run desktop:dev` | Run the Tauri desktop shell against the dev server |
| `npm run desktop:build` | Build the desktop app and its Windows installers |

## Publishing a release

Installers are built by GitHub Actions, never committed to the repository.

1. Bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
2. Commit, tag and push:
   ```bash
   git tag v2.0.0 && git push origin main --tags
   ```
3. Publish a GitHub Release for that tag. The **Release** workflow builds the
   NSIS and MSI installers on a `windows-latest` runner and attaches them to
   the release.

The web version deploys separately: the **Pages** workflow publishes it to
<https://domsoww.github.io/fortnite-chest-tracker/> on every push to `main`.

`.github/workflows/ci.yml` runs on every push: a type-checked web build on
Linux, and a full Windows installer build whose artifacts you can download from
the run summary without creating a release.

## Project structure

```
fortnite-chest-tracker/
├── index.html                   # Vite entry point
├── public/chest.svg             # Original SVG favicon
├── public/treasure-hours.json   # Published Treasure Hours schedule (also the offline copy)
├── src/                         # Shared React app (web + desktop)
│   ├── main.tsx  App.tsx  index.css  types.ts
│   ├── lib/
│   │   ├── storage.ts           # Schema, validation, v1→v3 migration, export/import
│   │   ├── persistence.ts       # Picks the browser or desktop backend
│   │   ├── stats.ts             # Totals, buckets, streaks, records, pause-aware duration
│   │   ├── treasure.ts          # Schedule parsing, state machine, reminders, chest split
│   │   ├── treasureFeed.ts      # Remote → bundled → cached schedule, with provenance
│   │   ├── treasureNow.ts       # The window a chest is stamped with as it is counted
│   │   ├── prague.ts            # Europe/Prague conversion and countdown formatting
│   │   ├── notify.ts            # OS notifications, in-app toast fallback
│   │   ├── format.ts  sound.ts  id.ts  useHashRoute.ts
│   │   └── *.test.ts            # Time zones, schedule states, reminders, migrations
│   ├── desktop/
│   │   ├── platform.ts          # Am I inside Tauri?
│   │   └── bridge.ts            # Typed wrappers for the Rust commands and events
│   ├── state/
│   │   ├── tracker.tsx          # Reducer, async hydration, persistence
│   │   ├── desktop.tsx          # Hotkey + tray wiring, shortcut registration
│   │   ├── treasure.tsx         # Schedule refresh, countdown clock, reminders
│   │   └── toast.tsx
│   ├── assets/                  # Bundled confirmation sounds (generated, original)
│   ├── components/              # Shell, counter, charts, desktop settings, dialogs
│   └── pages/                   # Dashboard, Treasure, History, Statistics, Settings
├── src-tauri/                   # Tauri 2 desktop shell
│   ├── src/lib.rs               # Shortcuts, tray, autostart, data file commands
│   ├── tauri.conf.json          # Window, bundle and security configuration
│   ├── capabilities/default.json
│   └── icons/                   # Generated from icons/source-1024.png
└── .github/workflows/           # ci.yml, release.yml
```

## How your data is stored

Same JSON shape in both builds:

```jsonc
{
  "version": 3,
  "activeSessionId": "…",          // null when no session is running
  "sessions": [
    {
      "id": "…",
      "name": "Session 1",
      "startedAt": 1762800000000,  // epoch ms
      "endedAt": 1762803600000,    // null while running
      "pauses": [{ "from": 1762801000000, "to": 1762801600000 }],
      "events": [
        // "th" is the Treasure Hour this chest was opened in, when there was one
        { "id": "…", "ts": 1762800123456, "delta": 1, "kind": "chest", "th": "th-2026-11-14-afternoon" }
      ]
    }
  ],
  "settings": {
    "theme": "dark",
    "dailyGoal": 50,
    "desktop": { "hotkeys": { } },
    "treasure": { "enabled": true, "leads": [15, 5, 0], "feedUrl": "https://…" }
  },
  "treasure": {
    "feed": { },                   // last schedule that was read
    "origin": "cache",             // remote | bundled | cache | none
    "fetchedAt": 1762800000000,
    "lastError": null,
    "manual": [ ],                 // windows you added yourself
    "notified": ["th-2026-11-14-afternoon:15"]   // reminders already fired
  }
}
```

- **Web:** one `localStorage` key, `fortnite-chest-tracker:v1`.
- **Desktop:** `%APPDATA%\io.github.domsoww.chesttracker\chest-tracker-data.json`
  (the exact path is shown in Settings), with `chest-tracker-data.backup.json` beside it.

Chests are stored as individual timestamped events rather than a plain total.
That is what makes undo, the per-day charts and the looting-by-hour histogram
work from real data. **Older data is migrated automatically** on first load, in
place and additively: v1 sessions gain an empty `pauses` list and settings gain
the `desktop` block (v2), then the `treasure` block and its settings appear (v3).
Nothing is deleted or rewritten until you make a change, and an export from any
earlier version still imports.

## Where the Treasure Hours schedule comes from

**Epic Games publishes no API for Treasure Hours.** Announcements go out on the
`@FortniteStatus` account and in-game, as prose. So the app reads a small JSON
file instead, and is explicit about where every line of it came from.

Three sources are tried in order, and the Treasure page always names the one in use:

1. **Downloaded schedule** — `public/treasure-hours.json` as published by this
   repository's GitHub Pages site. The address is editable in the app, so you can
   point it at your own mirror, or blank it to use the bundled copy only.
2. **Bundled copy** — the same file shipped inside the build. Used when there is
   no connection. Shown as "schedule shipped with this version", never as current.
3. **Last downloaded schedule** — cached in your own data file, used when a refresh
   fails. The failure reason is displayed alongside it.

If all three come up empty the app shows **"No schedule available"**. It does not
fall back to guessing.

### What each window is worth

Every window carries a status, and the UI separates them:

| Status | Meaning |
|---|---|
| **Confirmed by Epic** | Epic announced this window, with these times |
| **Reported, not confirmed** | A tracking site reports it; Epic has not confirmed the detail. Can be hidden entirely |
| **Added by you** | You typed it in. Never touched by a refresh |

Multipliers follow the same rule and are shown **only when the announcement stated
one**. Anything else reads "Multiplier not announced" or "reported, unconfirmed".
Each window lists its source, with a link and the date it was last checked.

### Reliability, honestly

- The **base drop rate of 1 in 137,500 per chest** is Epic's own published figure.
- The **7 November 2026 windows and their 1.5× / 2× multipliers** were announced by Epic.
- The **14 November 2026 date** was confirmed by Epic; the **times** in the shipped
  file come from tracking sites, so those windows are marked *reported*.
- **Later Saturdays are deliberately absent.** Several sites list them as
  predictions. Predictions are not announcements, so they are not in the file.

Keeping the file current is a manual job: edit `public/treasure-hours.json`, or add
the window in the app in the meantime. A pull request updating that file is the most
useful contribution this project can get.

### How reminders work

- Reminders can fire **30 / 15 / 5 minutes before** a window and **at its start**;
  each is switched on or off separately.
- A reminder goes to the OS — Windows notifications on the desktop build, the
  browser's notification API on the web — and if the OS will not show it, the
  app's own toast appears instead. It never silently does nothing.
- Each reminder fires **once**. The key `windowId:minutesBefore` is written to your
  data file before the notification is sent, so a refresh, a reload or a restart
  cannot repeat it.
- A reminder whose moment passed more than 90 seconds ago is **dropped, not fired**,
  so launching the app in the evening does not replay the whole day.
- Times are computed from absolute instants, so a reminder cannot drift when the
  clocks change.

### Time zones

Every instant is stored as UTC and converted for display by `Intl`, with
**Europe/Prague** as the reference zone; your own zone appears underneath when it
differs. No code anywhere adds or subtracts a fixed number of hours, which is what
usually puts a schedule an hour out twice a year. The CET/CEST boundary, a window
straddling a clock change, an ambiguous 02:00 on the autumn Sunday and a
non-existent 02:30 on the spring one are all covered by tests.

## Fortnite safety

This app only ever counts key presses *you* make. It does **not** read Fortnite's
memory, inject code, modify game files, interact with anti-cheat, send input to
the game, or automate anything. The global hotkeys are ordinary Windows
shortcuts registered through the OS, the same mechanism any chat or capture tool
uses.

Treasure Hours changes none of that. The only network request the app ever makes is
a plain `GET` for the schedule file shown in Settings — no session data, statistics,
settings or identifiers are sent anywhere, and the request carries no credentials.
Everything else keeps working with the network switched off.

## Known limitations

- Chests are **counted manually**. Nothing reads the game, by design.
- **Windows only** for the desktop build. The code is cross-platform, but the tray,
  autostart and installer configuration are written and tested for Windows.
- Data is **per install**. There is no sync; moving machines means export + import.
- The installer is **unsigned** (code-signing certificates are paid), hence the
  SmartScreen warning described above.
- The Treasure Hours schedule is **maintained by hand**. There is no Epic API to poll,
  so a newly announced window appears once this repository's JSON file is updated —
  or immediately, if you add it in the app yourself.
- **Multipliers are only as good as the announcement.** Where Epic published no
  figure, none is shown.
- Windows notifications from the desktop build have **not been verified on Windows**
  (see the open testing issue); the in-app fallback has.
- Tests cover the pure logic — time zones, schedule states, reminders, migrations.
  The React components have no automated coverage yet.
- Statistics are recomputed in the browser on each render — instant for normal use,
  but a decade of data in one file will eventually be noticeable.

## Contributing

Issues and pull requests are welcome. Run `npm run build` (and `npm run desktop:build`
if you touched `src-tauri/`) before opening a PR.

## Legal

MIT licensed — see [LICENSE](LICENSE).

This is an unofficial, fan-made tool. It is **not affiliated with, endorsed by or
sponsored by Epic Games**. Fortnite is a trademark of Epic Games, Inc. No game
assets are bundled or used: every graphic and sound in this app was generated
for it.
