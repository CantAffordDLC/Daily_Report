use directories::UserDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub export_path: String,
    pub default_obsidian_vault: String,
    #[serde(default)]
    pub obsidian_vault_path: String,
    #[serde(default)]
    pub obsidian_projects_folder: String,
    #[serde(default)]
    pub obsidian_auto_create: bool,
    #[serde(default)]
    pub reminder_enabled: bool,
    /// Six-field cron (second minute hour day month weekday), local time.
    #[serde(default = "default_reminder_cron")]
    pub reminder_cron: String,
}

fn default_reminder_cron() -> String {
    "0 0 9,12,17 * * *".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        let export_path = UserDirs::new()
            .and_then(|u| u.document_dir().map(|p| p.join("daily_report_exports")))
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| ".".to_string());
        Self {
            export_path,
            default_obsidian_vault: String::new(),
            obsidian_vault_path: String::new(),
            obsidian_projects_folder: String::new(),
            obsidian_auto_create: false,
            reminder_enabled: false,
            reminder_cron: default_reminder_cron(),
        }
    }
}

pub fn load(app_subdir: &Path) -> AppSettings {
    let path = app_subdir.join("settings.json");
    if let Ok(s) = fs::read_to_string(&path) {
        if let Ok(mut v) = serde_json::from_str::<AppSettings>(&s) {
            if v.export_path.trim().is_empty() {
                v.export_path = AppSettings::default().export_path;
            }
            if v.reminder_cron.trim().is_empty() {
                v.reminder_cron = default_reminder_cron();
            }
            return v;
        }
    }
    AppSettings::default()
}

pub fn save(app_subdir: &Path, s: &AppSettings) -> Result<(), String> {
    fs::create_dir_all(app_subdir).map_err(|e| e.to_string())?;
    let path = app_subdir.join("settings.json");
    let json = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}
