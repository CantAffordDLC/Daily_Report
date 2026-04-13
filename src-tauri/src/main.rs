// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod settings;

use chrono::Local;
use db::{MonthlyHourRow, ProjectRow, TaskRow};
use rust_xlsxwriter::{Format, Workbook};
use settings::AppSettings;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::api::dialog::blocking::FileDialogBuilder;
use tauri::{Manager, State};

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
fn set_settings(state: State<AppState>, settings: AppSettings) -> Result<(), String> {
    if settings.export_path.trim().is_empty() {
        return Err("exportPath cannot be empty".into());
    }
    settings::save(&state.data_dir, &settings)
}

#[tauri::command]
fn list_projects(state: State<AppState>) -> Result<Vec<ProjectRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_projects(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_project(state: State<AppState>, name: String) -> Result<i64, String> {
    if name.trim().is_empty() {
        return Err("Project name is required".into());
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::create_project(&conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_project(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_project(&conn, id).map_err(|e| e.to_string())
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
    db::list_tasks_for_project(&conn, project_id).map_err(|e| e.to_string())
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
) -> Result<i64, String> {
    if description.trim().is_empty() {
        return Err("Description is required".into());
    }
    let s = settings::load(&state.data_dir);
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::insert_task(
        &conn,
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
fn export_project_tasks_xlsx(
    state: State<AppState>,
    project_id: i64,
    months: Vec<String>,
) -> Result<String, String> {
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

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let pname = db::project_name(&conn, project_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;
    let tasks = db::tasks_for_export(&conn, project_id, &months_sorted).map_err(|e| e.to_string())?;
    if tasks.is_empty() {
        return Err("No tasks in the selected months".into());
    }

    let safe = sanitize_filename(&pname);
    let suffix = months_suffix(&months_sorted);
    let filename = format!("{}_export_{}.xlsx", safe, suffix);
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

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect::<String>()
        .trim()
        .chars()
        .take(80)
        .collect()
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

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();
            let data_dir = data_dir_for(&handle)?;
            fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
            let db_path = data_dir.join("daily_report.db");
            let conn = db::open_and_init(&db_path).map_err(|e| e.to_string())?;
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
            delete_project,
            list_tasks_by_date,
            list_tasks_by_project,
            create_task,
            update_task,
            delete_task,
            export_project_tasks_xlsx,
            get_monthly_hour_logs,
            open_obsidian_uri,
            pick_markdown_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
