# Daily Report

A small Windows desktop app to log the hours you spend on each project, see daily and monthly totals, and export monthly timesheets to Excel. It runs from the system tray, can remind you to log your hours, keeps automatic backups, and optionally creates an Obsidian note for every task.

Built with **Angular 21** (UI) and **Tauri 1.x** (Rust + SQLite).

---

## Features

- **Projects** – Create, rename and delete projects. Each project card lists its tasks; tasks from previous months are grouped in a collapsible section.
- **Tasks and hour logs** – A task has a date, day type, description and an optional Obsidian note. You don't edit a task's total directly: you **add hours** on a given day, and each entry is kept as an hour log with its own history (which you can also delete).
- **Hours** – See the projects you worked on, search tasks by name, date or project, and quickly add hours for today.
- **Hour logs** – Totals per day, per project and per month, filterable by year and month.
- **Reports** – Export one or more months to an `.xlsx` file with two sheets:
  - **Tasks** – One row per task per month, with the hours logged in that month.
  - **By Project** – A project × month summary with totals.
- **Obsidian integration** (optional) – Link a task to a note (`.md` file or `obsidian://` URL), open it from the app, or let the app create the project folder and task note for you. If a note with the same name already exists, the app asks whether to link it.
- **Reminders** (optional) – Popups on a cron schedule (e.g. `0 0 9,12,17 * * *` = 9:00, 12:00 and 17:00) reminding you to log your hours.
- **Backups** – Automatic daily, weekly, monthly or yearly backups to a folder of your choice, plus **Backup now** and **Import backup** (restore) in Settings.
- **Safe deletes** – Deleting a project, task or hour log asks for confirmation and only marks the data as deleted (soft delete). Nothing is physically removed from the database.
- **System tray** – Closing the window keeps the app running in the tray (needed for reminders). Use the tray menu to show the window again or quit.

## Installation

1. Download the installer from the release page:
   - `daily_report_<version>_x64-setup.exe` (recommended), or
   - `daily_report_<version>_x64_en-US.msi`
2. Run it and follow the steps.

Requires Windows 10/11 with [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (already installed on most machines).

**Updating:** quit the app from the tray icon first, then run the new installer. Your data is not affected.

## Getting started

1. Open **⚙ Settings** and check the **Export folder** (defaults to `Documents\daily_report_exports`).
2. Under **Backup**, enable backups and choose a folder (ideally one that is synced, e.g. OneDrive).
3. Optionally enable **Obsidian Integration** and **Reminders**.
4. Go to **Projects**, click **+ New project**, then **Add task**.
5. Use **Add hours** whenever you work on a task.
6. At the end of the month, go to **Reports**, select the month and click **Export .xlsx**.

## Your data

Everything is stored locally, in:

```
%APPDATA%\com.dailyreport.app\daily_report\
├── daily_report.db     SQLite database (projects, tasks, hour logs)
└── settings.json       App settings
```

- **Backups** are full copies of the database named `daily_report_backup_<date>.db`. To restore one, use **Settings → Backup → Import backup**. This replaces all current data.
- **Deleted items** stay in the database with a `deleted_at` timestamp. A project or task and everything deleted with it share the same timestamp. There is no restore button yet; to undo a delete, clear the column with any SQLite tool while the app is closed, for example:

  ```sql
  UPDATE projects  SET deleted_at = NULL WHERE deleted_at = '<timestamp>';
  UPDATE tasks     SET deleted_at = NULL WHERE deleted_at = '<timestamp>';
  UPDATE hour_logs SET deleted_at = NULL WHERE deleted_at = '<timestamp>';
  ```

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://www.rust-lang.org/tools/install) (`rustc` and `cargo` on your `PATH`)
- WebView2 (see above)

### Install dependencies

From the repository root:

```powershell
npm install
npm --prefix web install
```

### Run the desktop app

Starts the Angular dev server on port 4200 and opens the Tauri window:

```powershell
npm run dev
```

Use only the Tauri window. Opening `http://localhost:4200` in a normal browser shows the UI, but database, export and dialogs don't work there.

### Build the installers

```powershell
npm run tauri build
```

This builds the Angular bundle and the release binary, then creates the installers in:

- `src-tauri/target/release/bundle/nsis/` – `.exe` installer
- `src-tauri/target/release/bundle/msi/` – `.msi` installer

The first build downloads the WiX and NSIS tooling automatically. Before a release, bump the version in **both** `src-tauri/tauri.conf.json` (`package.version`) and `src-tauri/Cargo.toml`.

### Project layout

| Path | Role |
|------|------|
| `web/` | Angular frontend |
| `web/src/app/core/tauri.service.ts` | Typed wrapper around the Tauri commands |
| `src-tauri/src/main.rs` | Tauri commands, tray, reminders, backup/restore, Excel export |
| `src-tauri/src/db.rs` | SQLite schema, migrations and queries |
| `src-tauri/src/settings.rs` | `settings.json` model and defaults |
| `src.legacy/` | Old static prototype (not used) |

### Notes for contributors

- **Confirm dialogs:** use `TauriService.confirm()` (async), never `window.confirm`. Tauri replaces `window.confirm` with a version that returns a Promise, so `if (!confirm(...))` never blocks.
- **Deletes are soft:** every query must filter `deleted_at IS NULL` on `projects`, `tasks` and `hour_logs`.
- **Hours by month** come from `hour_logs.logged_date`, not from `tasks.task_date`. Tasks with hours but no logs (data from before hour logs existed) fall back to `task_date`.
