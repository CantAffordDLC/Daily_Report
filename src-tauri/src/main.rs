// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod settings;

use chrono::{Datelike, Local};
use cron::Schedule;
use db::{HourLogRow, MonthlyHourRow, ProjectRow, TaskRow};
use rust_xlsxwriter::{Format, Workbook};
use settings::AppSettings;
use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::Mutex;
use tauri::api::dialog::blocking::FileDialogBuilder;
use tauri::{CustomMenuItem, Manager, State, SystemTray, SystemTrayEvent, SystemTrayMenu};

struct AppState {
    db: Mutex<rusqlite::Connection>,
    data_dir: PathBuf,
}

fn data_dir_for(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut p = tauri::api::path::app_data_dir(&app.config()).ok_or_else(|| {
        "Could not resolve app data directory".to_string()
    })?;
    p.push("daily_report");
    Ok(p)
}

#[tauri::command]
fn get_current_date() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Result<AppSettings, String> {
    Ok(settings::load(&state.data_dir))
}

#[tauri::command]
fn set_settings(state: State<AppState>, mut settings: AppSettings) -> Result<(), String> {
    if settings.export_path.trim().is_empty() {
        return Err("exportPath cannot be empty".into());
    }
    if settings.reminder_enabled {
        let expr = settings.reminder_cron.trim();
        if expr.is_empty() {
            return Err("reminderCron is required when reminders are enabled".into());
        }
        Schedule::from_str(expr).map_err(|e| format!("Invalid reminderCron: {}", e))?;
    }
    // Preserve internal fields that the UI doesn't send
    let existing = settings::load(&state.data_dir);
    settings.last_backup_date = existing.last_backup_date;
    settings::save(&state.data_dir, &settings)
}

#[tauri::command]
fn list_projects(state: State<AppState>) -> Result<Vec<ProjectRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_projects(&conn).map_err(|e| e.to_string())
}

fn sanitize_filename(s: &str) -> String {
    let out: String = s
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0' => '_',
            c => c,
        })
        .collect();
    let trimmed = out.trim().trim_matches('.');
    if trimmed.is_empty() {
        "unnamed".to_string()
    } else {
        trimmed.chars().take(100).collect()
    }
}

#[tauri::command]
fn create_project(state: State<AppState>, name: String) -> Result<i64, String> {
    if name.trim().is_empty() {
        return Err("Project name is required".into());
    }
    let s = settings::load(&state.data_dir);
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let id = db::create_project(&conn, &name).map_err(|e| e.to_string())?;
    if s.obsidian_auto_create && !s.obsidian_vault_path.trim().is_empty() {
        let root = if !s.obsidian_projects_folder.trim().is_empty() {
            PathBuf::from(s.obsidian_projects_folder.trim())
        } else {
            Path::new(s.obsidian_vault_path.trim()).join("Tasks")
        };
        let folder = root.join(sanitize_filename(name.trim()));
        let _ = fs::create_dir_all(&folder);
    }
    Ok(id)
}

#[tauri::command]
fn rename_project(state: State<AppState>, id: i64, name: String) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Project name is required".into());
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::rename_project(&conn, id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_project(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_project(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_all_tasks(state: State<AppState>) -> Result<Vec<db::TaskRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_all_tasks(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_task_hours(state: State<AppState>, task_id: i64, delta: f64) -> Result<(), String> {
    if !delta.is_finite() || delta == 0.0 {
        return Err("Delta must be a non-zero finite number".into());
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::add_task_hours(&conn, task_id, delta).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_task_history(
    state: State<AppState>,
    task_id: i64,
) -> Result<Vec<db::TaskHistoryRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_task_history(&conn, task_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_tasks_by_date(
    state: State<AppState>,
    project_id: i64,
    task_date: String,
) -> Result<Vec<TaskRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_tasks_for_date(&conn, project_id, &task_date).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_tasks_by_project(state: State<AppState>, project_id: i64) -> Result<Vec<TaskRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let tasks = db::list_tasks_for_project(&conn, project_id).map_err(|e| e.to_string())?;

    // This prints the list to your terminal/console
    println!("Found tasks for project {}: {:#?}", project_id, tasks);

    Ok(tasks)
}

#[tauri::command]
fn find_obsidian_note(
    state: State<AppState>,
    project_id: i64,
    task_name: String,
) -> Result<Option<String>, String> {
    let s = settings::load(&state.data_dir);
    if s.obsidian_vault_path.trim().is_empty() {
        return Ok(None);
    }
    let root = if !s.obsidian_projects_folder.trim().is_empty() {
        PathBuf::from(s.obsidian_projects_folder.trim())
    } else {
        Path::new(s.obsidian_vault_path.trim()).join("Tasks")
    };
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let projects = db::list_projects(&conn).map_err(|e| e.to_string())?;
    let Some(project) = projects.iter().find(|p| p.id == project_id) else {
        return Ok(None);
    };
    let note_path = root
        .join(sanitize_filename(&project.name))
        .join(format!("{}.md", sanitize_filename(task_name.trim())));
    if !note_path.exists() {
        return Ok(None);
    }
    let abs = fs::canonicalize(&note_path).unwrap_or(note_path);
    let abs_str = abs.to_string_lossy();
    let clean = abs_str.strip_prefix(r"\\?\").unwrap_or(&abs_str);
    Ok(Some(format!("obsidian://open?path={}", urlencoding::encode(clean))))
}

#[tauri::command]
fn create_task(
    state: State<AppState>,
    project_id: i64,
    task_date: String,
    day_type: String,
    description: String,
    time_hours: f64,
    obsidian_input: Option<String>,
    create_note: Option<bool>,
) -> Result<i64, String> {
    if description.trim().is_empty() {
        return Err("Description is required".into());
    }
    let s = settings::load(&state.data_dir);
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let user_provided_obs = obsidian_input.as_deref().map(|v| v.trim()).unwrap_or("").is_empty();
    let auto_obs = (s.obsidian_auto_create || create_note.unwrap_or(false))
        && !s.obsidian_vault_path.trim().is_empty()
        && user_provided_obs;

    let effective_obs: Option<String> = if auto_obs {
        if let Ok(projects) = db::list_projects(&conn) {
            if let Some(project) = projects.iter().find(|p| p.id == project_id) {
                let root = if !s.obsidian_projects_folder.trim().is_empty() {
                    PathBuf::from(s.obsidian_projects_folder.trim())
                } else {
                    Path::new(s.obsidian_vault_path.trim()).join("Tasks")
                };
                let folder = root.join(sanitize_filename(&project.name));
                let _ = fs::create_dir_all(&folder);
                let note_path = folder.join(format!("{}.md", sanitize_filename(description.trim())));
                if !note_path.exists() {
                    let content = format!(
                        "# {}\n\n**Project:** {}\n**Date:** {}\n\n## Notes\n\n",
                        description.trim(),
                        project.name,
                        task_date
                    );
                    let _ = fs::write(&note_path, content);
                }
                let abs = fs::canonicalize(&note_path).unwrap_or(note_path);
                let abs_str = abs.to_string_lossy();
                // canonicalize on Windows prepends \\?\ — Obsidian can't handle it
                let clean = abs_str.strip_prefix(r"\\?\").unwrap_or(&abs_str);
                Some(format!(
                    "obsidian://open?path={}",
                    urlencoding::encode(clean)
                ))
            } else {
                None
            }
        } else {
            None
        }
    } else {
        obsidian_input
    };

    db::insert_task(
        &conn,
        project_id,
        &task_date,
        &day_type,
        &description,
        time_hours,
        effective_obs.as_deref(),
        &s,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_task(
    state: State<AppState>,
    id: i64,
    project_id: i64,
    task_date: String,
    day_type: String,
    description: String,
    time_hours: f64,
    obsidian_input: Option<String>,
) -> Result<(), String> {
    if description.trim().is_empty() {
        return Err("Description is required".into());
    }
    let s = settings::load(&state.data_dir);
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_task(
        &conn,
        id,
        project_id,
        &task_date,
        &day_type,
        &description,
        time_hours,
        obsidian_input.as_deref(),
        &s,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_task(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_task(&conn, id).map_err(|e| e.to_string())
}

fn month_token_ok(m: &str) -> bool {
    let b = m.as_bytes();
    b.len() == 7
        && b[4] == b'-'
        && m.chars().all(|c| c.is_ascii_digit() || c == '-')
}

#[tauri::command]
fn export_tasks_xlsx(state: State<AppState>, months: Vec<String>) -> Result<String, String> {
    if months.is_empty() {
        return Err("Select at least one month to export".into());
    }
    for m in &months {
        if !month_token_ok(m) {
            return Err(format!("Invalid month (expected YYYY-MM): {}", m));
        }
    }
    let mut months_sorted = months.clone();
    months_sorted.sort();
    months_sorted.dedup();

    let settings = settings::load(&state.data_dir);
    let export_dir = PathBuf::from(&settings.export_path);
    fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;

    let tasks = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::tasks_for_export_all_months(&conn, &months_sorted).map_err(|e| e.to_string())?
    };

    if tasks.is_empty() {
        return Err("No tasks in the selected months".into());
    }

    let suffix = months_suffix(&months_sorted);
    let filename = format!("daily_report_export_{}.xlsx", suffix);
    let out_path = export_dir.join(&filename);

    write_tasks_xlsx(&out_path, &tasks).map_err(|e| e.to_string())?;
    Ok(out_path.to_string_lossy().to_string())
}

fn months_suffix(months: &[String]) -> String {
    if months.len() <= 3 {
        months.join("_")
    } else {
        format!("{}_to_{}", months.first().unwrap(), months.last().unwrap())
    }
}

fn write_tasks_xlsx(path: &Path, tasks: &[TaskRow]) -> Result<(), rust_xlsxwriter::XlsxError> {
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    let bold = Format::new().set_bold();

    sheet.write_string_with_format(0, 0, "Date", &bold)?;
    sheet.write_string_with_format(0, 1, "Day Type", &bold)?;
    sheet.write_string_with_format(0, 2, "Description", &bold)?;
    sheet.write_string_with_format(0, 3, "Time (hours)", &bold)?;
    sheet.write_string_with_format(0, 4, "Obsidian link", &bold)?;

    for (i, t) in tasks.iter().enumerate() {
        let row = (i + 1) as u32;
        sheet.write_string(row, 0, &t.task_date)?;
        sheet.write_string(row, 1, &t.day_type)?;
        sheet.write_string(row, 2, &t.description)?;
        sheet.write_number(row, 3, t.time_hours)?;
        let obs = t.obsidian_uri.as_deref().unwrap_or("");
        sheet.write_string(row, 4, obs)?;
    }

    sheet.set_column_width(0, 12.0)?;
    sheet.set_column_width(1, 12.0)?;
    sheet.set_column_width(2, 40.0)?;
    sheet.set_column_width(3, 14.0)?;
    sheet.set_column_width(4, 50.0)?;

    workbook.save(path)?;
    Ok(())
}

#[tauri::command]
fn get_monthly_hour_logs(
    state: State<AppState>,
    year: Option<i32>,
) -> Result<Vec<MonthlyHourRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::monthly_hour_logs(&conn, year).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_obsidian_uri(uri: String) -> Result<(), String> {
    let u = uri.trim();
    if u.is_empty() {
        return Err("Empty URI".into());
    }
    open::that(u).map_err(|e| e.to_string())
}

#[tauri::command]
fn pick_markdown_file() -> Result<Option<String>, String> {
    let path = FileDialogBuilder::new()
        .add_filter("Markdown", &["md"])
        .pick_file();
    Ok(path.map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
fn pick_folder() -> Result<Option<String>, String> {
    let path = FileDialogBuilder::new().pick_folder();
    Ok(path.map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
fn add_hour_log(
    state: State<AppState>,
    task_id: i64,
    project_id: i64,
    logged_date: String,
    hours: f64,
) -> Result<(), String> {
    if !hours.is_finite() || hours <= 0.0 {
        return Err("Hours must be a positive number".into());
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::add_hour_log(&conn, task_id, project_id, &logged_date, hours).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_hour_logs_for_task(
    state: State<AppState>,
    task_id: i64,
) -> Result<Vec<HourLogRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_hour_logs_for_task(&conn, task_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_hour_log(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_hour_log(&conn, id).map_err(|e| e.to_string())
}

// ── Backup ────────────────────────────────────────────────────────────────────

fn is_backup_due(frequency: &str, last_date: &str, today: &str) -> bool {
    use chrono::{Duration, NaiveDate};
    if last_date.trim().is_empty() {
        return true;
    }
    let last = match NaiveDate::parse_from_str(last_date.trim(), "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return true,
    };
    let now = match NaiveDate::parse_from_str(today.trim(), "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return false,
    };
    match frequency {
        "daily" => now > last,
        "weekly" => now >= last + Duration::days(7),
        "monthly" => {
            now.year() > last.year()
                || (now.year() == last.year() && now.month() > last.month())
        }
        "annual" => now.year() > last.year(),
        _ => false,
    }
}

fn run_startup_backup(conn: &rusqlite::Connection, data_dir: &Path) {
    let mut s = settings::load(data_dir);
    if !s.backup_enabled || s.backup_path.trim().is_empty() {
        return;
    }
    let today = Local::now().format("%Y-%m-%d").to_string();
    if !is_backup_due(&s.backup_frequency, &s.last_backup_date, &today) {
        return;
    }
    let backup_dir = PathBuf::from(s.backup_path.trim());
    if fs::create_dir_all(&backup_dir).is_err() {
        return;
    }
    let filename = format!("daily_report_backup_{}.db", today);
    let dest = backup_dir.join(&filename);
    let dest_str = dest.to_string_lossy().replace('\'', "''");
    if conn
        .execute_batch(&format!("VACUUM INTO '{}'", dest_str))
        .is_ok()
    {
        s.last_backup_date = today;
        let _ = settings::save(data_dir, &s);
    }
}

#[tauri::command]
fn create_backup(state: State<AppState>) -> Result<String, String> {
    let s = settings::load(&state.data_dir);
    if s.backup_path.trim().is_empty() {
        return Err("Backup folder is not configured".into());
    }
    let backup_dir = PathBuf::from(s.backup_path.trim());
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let today = Local::now().format("%Y-%m-%d").to_string();
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let filename = format!("daily_report_backup_{}.db", timestamp);
    let dest = backup_dir.join(&filename);
    let dest_str = dest.to_string_lossy().replace('\'', "''");
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute_batch(&format!("VACUUM INTO '{}'", dest_str))
        .map_err(|e| e.to_string())?;
    // Update last_backup_date
    let mut updated = s.clone();
    updated.last_backup_date = today;
    let _ = settings::save(&state.data_dir, &updated);
    Ok(dest.to_string_lossy().into_owned())
}

// ── System tray ───────────────────────────────────────────────────────────────

fn build_system_tray() -> SystemTray {
    let show = CustomMenuItem::new("show".to_string(), "Show");
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let menu = SystemTrayMenu::new().add_item(show).add_item(quit);
    SystemTray::new().with_menu(menu)
}

fn spawn_reminder_thread(app_handle: tauri::AppHandle, data_dir: PathBuf) {
    std::thread::spawn(move || loop {
        let settings = settings::load(&data_dir);
        if !settings.reminder_enabled {
            std::thread::sleep(std::time::Duration::from_secs(30));
            continue;
        }
        let schedule = match Schedule::from_str(settings.reminder_cron.trim()) {
            Ok(s) => s,
            Err(_) => {
                std::thread::sleep(std::time::Duration::from_secs(60));
                continue;
            }
        };
        let now = Local::now();
        let Some(next) = schedule.upcoming(Local).take(1).next() else {
            std::thread::sleep(std::time::Duration::from_secs(3600));
            continue;
        };
        let until = next.signed_duration_since(now);
        if until.num_seconds() < 0 {
            continue;
        }
        if let Ok(std_dur) = until.to_std() {
            if std_dur > std::time::Duration::from_secs(0) {
                std::thread::sleep(std_dur);
            }
        }
        if settings::load(&data_dir).reminder_enabled {
            let _ = app_handle.emit_all("reminder-tick", ());
        }
    });
}

fn main() {
    tauri::Builder::default()
        .system_tray(build_system_tray())
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            },
            _ => {}
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                event.window().hide().unwrap();
                api.prevent_close();
            }
        })
        .setup(|app| {
            let handle = app.handle();
            let data_dir = data_dir_for(&handle)?;
            fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
            let db_path = data_dir.join("daily_report.db");
            let conn = db::open_and_init(&db_path).map_err(|e| e.to_string())?;
            run_startup_backup(&conn, &data_dir);
            let data_dir_bg = data_dir.clone();
            spawn_reminder_thread(handle.clone(), data_dir_bg);
            app.manage(AppState {
                db: Mutex::new(conn),
                data_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_current_date,
            get_settings,
            set_settings,
            list_projects,
            create_project,
            rename_project,
            delete_project,
            list_all_tasks,
            add_task_hours,
            list_task_history,
            list_tasks_by_date,
            list_tasks_by_project,
            create_task,
            update_task,
            delete_task,
            export_tasks_xlsx,
            get_monthly_hour_logs,
            open_obsidian_uri,
            pick_markdown_file,
            pick_folder,
            find_obsidian_note,
            create_backup,
            add_hour_log,
            list_hour_logs_for_task,
            delete_hour_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
