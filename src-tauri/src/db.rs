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
        CREATE TABLE IF NOT EXISTS task_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            changed_at TEXT NOT NULL,
            delta REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);
        CREATE TABLE IF NOT EXISTS hour_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            logged_date TEXT NOT NULL,
            hours REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_hour_logs_task_id ON hour_logs(task_id);
        CREATE INDEX IF NOT EXISTS idx_hour_logs_project_id ON hour_logs(project_id);
        ",
    )?;
    add_column_if_missing(&conn, "tasks", "obsidian_uri", "TEXT")?;
    // Soft delete: rows are flagged with a timestamp instead of being removed
    for table in ["projects", "tasks", "hour_logs"] {
        add_column_if_missing(&conn, table, "deleted_at", "TEXT")?;
    }
    Ok(conn)
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    decl: &str,
) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let cols: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(1))?
        .filter_map(|x| x.ok())
        .collect();
    if !cols.iter().any(|c| c == column) {
        conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {decl}"), [])?;
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
    /// Most recent logged_date from hour_logs for this task, if any.
    pub last_log_date: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskHistoryRow {
    pub id: i64,
    pub task_id: i64,
    pub changed_at: String,
    pub delta: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HourLogRow {
    pub id: i64,
    pub task_id: i64,
    pub project_id: i64,
    pub logged_date: String,
    pub hours: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyHourRow {
    pub year_month: String,
    pub project_id: i64,
    pub project_name: String,
    pub total_hours: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DailyHourRow {
    pub date: String,
    pub project_id: i64,
    pub project_name: String,
    pub total_hours: f64,
}

pub fn list_projects(conn: &Connection) -> Result<Vec<ProjectRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, created_at FROM projects WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE",
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

pub fn rename_project(conn: &Connection, id: i64, name: &str) -> Result<(), rusqlite::Error> {
    let n = conn.execute(
        "UPDATE projects SET name = ?1 WHERE id = ?2 AND deleted_at IS NULL",
        params![name.trim(), id],
    )?;
    if n == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

/// Soft delete: flags the project and its tasks/hour logs with the same `deleted_at`,
/// so everything removed together can be restored together.
pub fn delete_project(conn: &Connection, id: i64) -> Result<(), rusqlite::Error> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE hour_logs SET deleted_at = ?1 WHERE project_id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    tx.execute(
        "UPDATE tasks SET deleted_at = ?1 WHERE project_id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    tx.execute(
        "UPDATE projects SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    tx.commit()
}

pub fn list_tasks_for_date(
    conn: &Connection,
    project_id: i64,
    task_date: &str,
) -> Result<Vec<TaskRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.project_id, t.task_date, t.day_type, t.description, t.time_hours,
                t.obsidian_uri, MAX(hl.logged_date) AS last_log_date
         FROM tasks t
         LEFT JOIN hour_logs hl ON hl.task_id = t.id AND hl.deleted_at IS NULL
         WHERE t.project_id = ?1 AND t.task_date = ?2 AND t.deleted_at IS NULL
         GROUP BY t.id
         ORDER BY t.id",
    )?;
    map_task_rows(&mut stmt, params![project_id, task_date])
}

pub fn list_tasks_for_project(
    conn: &Connection,
    project_id: i64,
) -> Result<Vec<TaskRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.project_id, t.task_date, t.day_type, t.description, t.time_hours,
                t.obsidian_uri, MAX(hl.logged_date) AS last_log_date
         FROM tasks t
         LEFT JOIN hour_logs hl ON hl.task_id = t.id AND hl.deleted_at IS NULL
         WHERE t.project_id = ?1 AND t.deleted_at IS NULL
         GROUP BY t.id
         ORDER BY COALESCE(MAX(hl.logged_date), t.task_date) DESC, t.id DESC",
    )?;
    map_task_rows(&mut stmt, params![project_id])
}

pub fn list_all_tasks(conn: &Connection) -> Result<Vec<TaskRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.project_id, t.task_date, t.day_type, t.description, t.time_hours,
                t.obsidian_uri, MAX(hl.logged_date) AS last_log_date
         FROM tasks t
         LEFT JOIN hour_logs hl ON hl.task_id = t.id AND hl.deleted_at IS NULL
         WHERE t.deleted_at IS NULL
         GROUP BY t.id
         ORDER BY COALESCE(MAX(hl.logged_date), t.task_date) DESC, t.id DESC",
    )?;
    map_task_rows(&mut stmt, [])
}

pub fn add_task_hours(conn: &Connection, task_id: i64, delta: f64) -> Result<(), rusqlite::Error> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE tasks SET time_hours = time_hours + ?1 WHERE id = ?2 AND deleted_at IS NULL",
        params![delta, task_id],
    )?;
    if n == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    conn.execute(
        "INSERT INTO task_history (task_id, changed_at, delta) VALUES (?1, ?2, ?3)",
        params![task_id, now, delta],
    )?;
    Ok(())
}

pub fn list_task_history(
    conn: &Connection,
    task_id: i64,
) -> Result<Vec<TaskHistoryRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, changed_at, delta FROM task_history
         WHERE task_id = ?1 ORDER BY changed_at DESC",
    )?;
    let iter = stmt.query_map(params![task_id], |r| {
        Ok(TaskHistoryRow {
            id: r.get(0)?,
            task_id: r.get(1)?,
            changed_at: r.get(2)?,
            delta: r.get(3)?,
        })
    })?;
    iter.collect()
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
            last_log_date: r.get(7)?,
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
         time_hours = ?5, obsidian_uri = ?6 WHERE id = ?7 AND deleted_at IS NULL",
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

/// Soft delete: flags the task and its hour logs with the same `deleted_at`.
pub fn delete_task(conn: &Connection, id: i64) -> Result<(), rusqlite::Error> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE hour_logs SET deleted_at = ?1 WHERE task_id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    tx.execute(
        "UPDATE tasks SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    tx.commit()
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

pub fn add_hour_log(
    conn: &Connection,
    task_id: i64,
    project_id: i64,
    logged_date: &str,
    hours: f64,
) -> Result<(), rusqlite::Error> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE tasks SET time_hours = time_hours + ?1 WHERE id = ?2 AND deleted_at IS NULL",
        params![hours, task_id],
    )?;
    if n == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    conn.execute(
        "INSERT INTO hour_logs (task_id, project_id, logged_date, hours) VALUES (?1, ?2, ?3, ?4)",
        params![task_id, project_id, logged_date, hours],
    )?;
    conn.execute(
        "INSERT INTO task_history (task_id, changed_at, delta) VALUES (?1, ?2, ?3)",
        params![task_id, now, hours],
    )?;
    Ok(())
}

pub fn list_hour_logs_for_task(
    conn: &Connection,
    task_id: i64,
) -> Result<Vec<HourLogRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, project_id, logged_date, hours FROM hour_logs
         WHERE task_id = ?1 AND deleted_at IS NULL ORDER BY logged_date DESC, id DESC",
    )?;
    let iter = stmt.query_map(params![task_id], |r| {
        Ok(HourLogRow {
            id: r.get(0)?,
            task_id: r.get(1)?,
            project_id: r.get(2)?,
            logged_date: r.get(3)?,
            hours: r.get(4)?,
        })
    })?;
    iter.collect()
}

/// Soft delete: flags the log and subtracts its hours from the task total.
pub fn delete_hour_log(conn: &Connection, id: i64) -> Result<(), rusqlite::Error> {
    let (task_id, hours): (i64, f64) = conn.query_row(
        "SELECT task_id, hours FROM hour_logs WHERE id = ?1 AND deleted_at IS NULL",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE tasks SET time_hours = MAX(0, time_hours - ?1) WHERE id = ?2",
        params![hours, task_id],
    )?;
    tx.execute(
        "UPDATE hour_logs SET deleted_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    tx.commit()
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportTaskRow {
    pub id: i64,
    pub project_id: i64,
    pub project_name: String,
    pub task_date: String,
    pub day_type: String,
    pub description: String,
    pub time_hours: f64,
    pub obsidian_uri: Option<String>,
}

pub fn tasks_for_export_with_projects(
    conn: &Connection,
    months: &[String],
) -> Result<Vec<ExportTaskRow>, rusqlite::Error> {
    if months.is_empty() {
        return Ok(Vec::new());
    }
    let mut all = Vec::new();
    // Hours come from hour_logs (when the work was logged), one row per task per month,
    // dated with the last log of that month. Same rules as monthly_hour_logs, so the
    // export matches the Hours tab: legacy tasks with hours but no logs use task_date.
    let mut stmt = conn.prepare(
        "SELECT t.id, hl.project_id, p.name, MAX(hl.logged_date), t.day_type, t.description,
                SUM(hl.hours), t.obsidian_uri
         FROM hour_logs hl
         JOIN tasks t ON t.id = hl.task_id AND t.deleted_at IS NULL
         JOIN projects p ON p.id = hl.project_id AND p.deleted_at IS NULL
         WHERE strftime('%Y-%m', hl.logged_date) = ?1 AND hl.deleted_at IS NULL
         GROUP BY t.id, hl.project_id
         UNION ALL
         SELECT t.id, t.project_id, p.name, t.task_date, t.day_type, t.description,
                t.time_hours, t.obsidian_uri
         FROM tasks t
         JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
         WHERE strftime('%Y-%m', t.task_date) = ?1
           AND t.deleted_at IS NULL
           AND t.time_hours > 0
           AND t.id NOT IN (SELECT DISTINCT task_id FROM hour_logs WHERE deleted_at IS NULL)",
    )?;
    for m in months {
        let rows = stmt.query_map(params![m], |r| {
            Ok(ExportTaskRow {
                id: r.get(0)?,
                project_id: r.get(1)?,
                project_name: r.get(2)?,
                task_date: r.get(3)?,
                day_type: r.get(4)?,
                description: r.get(5)?,
                time_hours: r.get(6)?,
                obsidian_uri: r.get(7)?,
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

pub fn daily_hour_logs(
    conn: &Connection,
    date: Option<&str>,
) -> Result<Vec<DailyHourRow>, rusqlite::Error> {
    let (date_filter, date_param) = match date {
        Some(d) => ("AND hl.logged_date = ?1", d.to_string()),
        None => ("", String::new()),
    };
    let sql = format!(
        "SELECT hl.logged_date, hl.project_id, p.name AS project_name, SUM(hl.hours) AS total_hours
         FROM hour_logs hl
         JOIN projects p ON p.id = hl.project_id AND p.deleted_at IS NULL
         WHERE hl.deleted_at IS NULL {date_filter}
         GROUP BY hl.logged_date, hl.project_id
         ORDER BY hl.logged_date DESC, p.name COLLATE NOCASE",
        date_filter = date_filter,
    );
    let mut stmt = conn.prepare(&sql)?;
    let map_row = |r: &rusqlite::Row<'_>| {
        Ok(DailyHourRow {
            date: r.get(0)?,
            project_id: r.get(1)?,
            project_name: r.get(2)?,
            total_hours: r.get(3)?,
        })
    };
    let out: Vec<DailyHourRow> = if date.is_some() {
        stmt.query_map(params![date_param], map_row)?
            .collect::<Result<_, _>>()?
    } else {
        stmt.query_map([], map_row)?
            .collect::<Result<_, _>>()?
    };
    Ok(out)
}

pub fn monthly_hour_logs(
    conn: &Connection,
    year: Option<i32>,
) -> Result<Vec<MonthlyHourRow>, rusqlite::Error> {
    // Combines:
    //   1) hour_logs entries (logged_date = when work was actually recorded)
    //   2) Legacy tasks that have time_hours > 0 but NO hour_log entries (pre-migration data)
    // This way both old and new data appear correctly.
    let (year_filter_logs, year_filter_tasks, year_param) = match year {
        Some(y) => (
            "AND strftime('%Y', hl.logged_date) = ?1",
            "AND strftime('%Y', t.task_date) = ?1",
            format!("{:04}", y),
        ),
        None => ("", "", String::new()),
    };

    let sql = format!(
        "SELECT ym, project_id, project_name, SUM(th) AS total_hours
         FROM (
             SELECT strftime('%Y-%m', hl.logged_date) AS ym,
                    hl.project_id,
                    p.name AS project_name,
                    SUM(hl.hours) AS th
             FROM hour_logs hl
             JOIN projects p ON p.id = hl.project_id AND p.deleted_at IS NULL
             WHERE hl.deleted_at IS NULL {year_filter_logs}
             GROUP BY ym, hl.project_id
             UNION ALL
             SELECT strftime('%Y-%m', t.task_date) AS ym,
                    t.project_id,
                    p.name AS project_name,
                    t.time_hours AS th
             FROM tasks t
             JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
             WHERE t.time_hours > 0
               AND t.deleted_at IS NULL
               AND t.id NOT IN (SELECT DISTINCT task_id FROM hour_logs WHERE deleted_at IS NULL)
               {year_filter_tasks}
         )
         GROUP BY ym, project_id
         ORDER BY ym DESC, project_name COLLATE NOCASE",
        year_filter_logs = year_filter_logs,
        year_filter_tasks = year_filter_tasks,
    );

    let mut stmt = conn.prepare(&sql)?;
    let map_row = |r: &rusqlite::Row<'_>| {
        Ok(MonthlyHourRow {
            year_month: r.get(0)?,
            project_id: r.get(1)?,
            project_name: r.get(2)?,
            total_hours: r.get(3)?,
        })
    };
    let out: Vec<MonthlyHourRow> = if year.is_some() {
        stmt.query_map(params![year_param], map_row)?
            .collect::<Result<_, _>>()?
    } else {
        stmt.query_map([], map_row)?
            .collect::<Result<_, _>>()?
    };
    Ok(out)
}
