# Daily Report

Desktop app for logging daily work: **projects**, **tasks by date** (hours, day type, Obsidian links), **monthly hour summaries**, **Excel export**, and optional **reminder** popups (cron). The UI is **Angular 21**; the shell and data layer are **Tauri 1.x** (Rust + SQLite).

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [Rust](https://www.rust-lang.org/tools/install) (`rustc`, `cargo` on your `PATH`)
- **Windows**: [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) is required (usually already installed on Windows 10/11)

## Install

From the repository root:

```powershell
npm install
npm --prefix web install
```

## Development (desktop app)

Starts the Angular dev server on port 4200 and opens the Tauri window:

```powershell
npm run dev
```

(alias: `npm run tauri:dev`)

## Web UI only (browser)

Tauri APIs are guarded in code; you can run the Angular app alone for layout work (database and exports will not work):

```powershell
cd web
npm start
```

Then open `http://localhost:4200/`.

## Production build

Build the Angular bundle, then compile and package the desktop app:

```powershell
npm run web:build
npm run tauri build
```

Installers and binaries appear under `src-tauri/target/release/bundle/`.

## App data

Runtime data (SQLite DB and settings) lives under the OS app data directory, in a `daily_report` subfolder (see `data_dir_for` in `src-tauri/src/main.rs`).

## Icons

Bundled icons under `src-tauri/icons/` are the default Tauri example set. Replace them or run `npm run tauri icon path/to/your-1024.png` to regenerate all sizes.

## Project layout

| Path | Role |
|------|------|
| `web/` | Angular frontend (`ng serve` / `ng build`) |
| `src-tauri/` | Tauri + Rust commands, SQLite, XLSX export |
| `src.legacy/` | Older static prototype (not used by the current app) |
