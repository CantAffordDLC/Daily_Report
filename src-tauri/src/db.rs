use crate::settings::AppSettings;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::fs;
use std::path::Path;

pub fn open_and_init(db_path: &Path) -> Result<Connection, rusqlite::Error> {
    if let Some(parent) = db_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        "
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA cache_size = -8000;
        PRAGMA mmap_size = 67108864;
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            task_date TEXT NOT NULL,
            day_type TEXT NOT NULL,
            description TEXT NOT NULL,
            time_hours REAL NOT NULL,
            obsidian_uri TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_project_date ON tasks(project_id, task_date);
        ",
    )?;
    migrate_obsidian_column(&conn)?;
    Ok(conn)
}

fn migrate_obsidian_column(conn: &Connection) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare("PRAGMA table_info(tasks)")?;
    let cols: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(1))?
        .filter_map(|x| x.ok())
        .collect();
    if !cols.iter().any(|c| c == "obsidian_uri") {
        conn.execute(
            "ALTER TABLE tasks ADD COLUMN obsidian_uri TEXT",
            [],
        )?;
    }
    Ok(())
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRow {
    pub id: i64,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskRow {
    pub id: i64,
    pub project_id: i64,
    pub task_date: String,
    pub day_type: String,
    pub description: String,
    pub time_hours: f64,
    pub obsidian_uri: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyHourRow {
    pub year_month: String,
    pub project_id: i64,
    pub project_name: String,
    pub total_hours: f64,
}

pub fn list_projects(conn: &Connection) -> Result<Vec<ProjectRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, created_at FROM projects ORDER BY name COLLATE NOCASE",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ProjectRow {
                id: r.get(0)?,
                name: r.get(1)?,
                created_at: r.get(2)?,
            })
        })?
        .filter_map(|x| x.ok())
        .collect();
    Ok(rows)
}

pub fn create_project(conn: &Connection, name: &str) -> Result<i64, rusqlite::Error> {
    let name = name.trim();
    debug_assert!(!name.is_empty());
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO projects (name, created_at) VALUES (?1, ?2)",
        params![name, now],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn delete_project(conn: &Connection, id: i64) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn list_tasks_for_date(
    conn: &Connection,
    project_id: i64,
    task_date: &str,
) -> Result<Vec<TaskRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, task_date, day_type, description, time_hours, obsidian_uri
         FROM tasks WHERE project_id = ?1 AND task_date = ?2 ORDER BY id",
    )?;
    map_task_rows(&mut stmt, params![project_id, task_date])
}

pub fn list_tasks_for_project(
    conn: &Connection,
    project_id: i64,
) -> Result<Vec<TaskRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, task_date, day_type, description, time_hours, obsidian_uri
         FROM tasks WHERE project_id = ?1 ORDER BY task_date DESC, id DESC",
    )?;
    map_task_rows(&mut stmt, params![project_id])
}

fn map_task_rows(
    stmt: &mut rusqlite::Statement,
    params: impl rusqlite::Params,
) -> Result<Vec<TaskRow>, rusqlite::Error> {
    let iter = stmt.query_map(params, |r| {
        Ok(TaskRow {
            id: r.get(0)?,
            project_id: r.get(1)?,
            task_date: r.get(2)?,
            day_type: r.get(3)?,
            description: r.get(4)?,
            time_hours: r.get(5)?,
            obsidian_uri: r.get(6)?,
        })
    })?;
    iter.collect()
}

pub fn insert_task(
    conn: &Connection,
    project_id: i64,
    task_date: &str,
    day_type: &str,
    description: &str,
    time_hours: f64,
    obsidian_input: Option<&str>,
    settings: &AppSettings,
) -> Result<i64, rusqlite::Error> {
    let uri = normalize_obsidian_uri(obsidian_input, &settings.default_obsidian_vault);
    conn.execute(
        "INSERT INTO tasks (project_id, task_date, day_type, description, time_hours, obsidian_uri)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            project_id,
            task_date,
            day_type,
            description.trim(),
            time_hours,
            uri
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_task(
    conn: &Connection,
    id: i64,
    project_id: i64,
    task_date: &str,
    day_type: &str,
    description: &str,
    time_hours: f64,
    obsidian_input: Option<&str>,
    settings: &AppSettings,
) -> Result<(), rusqlite::Error> {
    let uri = normalize_obsidian_uri(obsidian_input, &settings.default_obsidian_vault);
    let n = conn.execute(
        "UPDATE tasks SET project_id = ?1, task_date = ?2, day_type = ?3, description = ?4,
         time_hours = ?5, obsidian_uri = ?6 WHERE id = ?7",
        params![
            project_id,
            task_date,
            day_type,
            description.trim(),
            time_hours,
            uri,
            id
        ],
    )?;
    if n == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

pub fn delete_task(conn: &Connection, id: i64) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
    Ok(())
}

fn is_likely_absolute_filesystem_path(s: &str) -> bool {
    let s = s.trim();
    if s.starts_with("\\\\") {
        return true;
    }
    if s.starts_with('/') {
        return true;
    }
    let mut it = s.chars();
    let Some(c) = it.next() else {
        return false;
    };
    it.next() == Some(':') && c.is_ascii_alphabetic()
}

fn normalize_obsidian_uri(input: Option<&str>, vault: &str) -> Option<String> {
    let s = input?.trim();
    if s.is_empty() {
        return None;
    }
    if s.starts_with("obsidian://") {
        return Some(s.to_string());
    }
    if is_likely_absolute_filesystem_path(s) {
        let p = Path::new(s);
        let abs_opt = if p.exists() && p.is_file() {
            fs::canonicalize(p)
                .ok()
                .map(|x| x.to_string_lossy().to_string())
        } else if !p.exists() && s.to_lowercase().ends_with(".md") {
            Some(s.to_string())
        } else {
            None
        };
        if let Some(abs) = abs_opt {
            return Some(format!(
                "obsidian://open?path={}",
                urlencoding::encode(&abs)
            ));
        }
    }
    let v = vault.trim();
    if v.is_empty() {
        return Some(s.to_string());
    }
    let file = urlencoding::encode(s);
    Some(format!(
        "obsidian://open?vault={}&file={}",
        urlencoding::encode(v),
        file
    ))
}

pub fn tasks_for_export_all_months(
    conn: &Connection,
    months: &[String],
) -> Result<Vec<TaskRow>, rusqlite::Error> {
    if months.is_empty() {
        return Ok(Vec::new());
    }
    let mut all = Vec::new();
    let mut stmt = conn.prepare(
        "SELECT id, project_id, task_date, day_type, description, time_hours, obsidian_uri
         FROM tasks WHERE strftime('%Y-%m', task_date) = ?1
         ORDER BY task_date, id",
    )?;
    for m in months {
        let rows = stmt.query_map(params![m], |r| {
            Ok(TaskRow {
                id: r.get(0)?,
                project_id: r.get(1)?,
                task_date: r.get(2)?,
                day_type: r.get(3)?,
                description: r.get(4)?,
                time_hours: r.get(5)?,
                obsidian_uri: r.get(6)?,
            })
        })?;
        for row in rows {
            all.push(row?);
        }
    }
    all.sort_by(|a, b| {
        a.task_date
            .cmp(&b.task_date)
            .then_with(|| a.id.cmp(&b.id))
    });
    Ok(all)
}

pub fn monthly_hour_logs(
    conn: &Connection,
    year: Option<i32>,
) -> Result<Vec<MonthlyHourRow>, rusqlite::Error> {
    match year {
        Some(y) => {
            let mut stmt = conn.prepare(
                "SELECT strftime('%Y-%m', t.task_date) AS ym, t.project_id, p.name,
                        SUM(t.time_hours) AS th
                 FROM tasks t JOIN projects p ON p.id = t.project_id
                 WHERE strftime('%Y', t.task_date) = ?1
                 GROUP BY ym, t.project_id
                 ORDER BY ym DESC, p.name COLLATE NOCASE",
            )?;
            let iter = stmt.query_map(params![format!("{:04}", y)], |r| {
                Ok(MonthlyHourRow {
                    year_month: r.get(0)?,
                    project_id: r.get(1)?,
                    project_name: r.get(2)?,
                    total_hours: r.get(3)?,
                })
            })?;
            let mut out = Vec::new();
            for row in iter {
                out.push(row?);
            }
            Ok(out)
        }
        None => {
            let mut stmt = conn.prepare(
                "SELECT strftime('%Y-%m', t.task_date) AS ym, t.project_id, p.name,
                        SUM(t.time_hours) AS th
                 FROM tasks t JOIN projects p ON p.id = t.project_id
                 GROUP BY ym, t.project_id
                 ORDER BY ym DESC, p.name COLLATE NOCASE",
            )?;
            let iter = stmt.query_map([], |r| {
                Ok(MonthlyHourRow {
                    year_month: r.get(0)?,
                    project_id: r.get(1)?,
                    project_name: r.get(2)?,
                    total_hours: r.get(3)?,
                })
            })?;
            let mut out = Vec::new();
            for row in iter {
                out.push(row?);
            }
            Ok(out)
        }
    }
}
