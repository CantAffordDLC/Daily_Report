use directories::UserDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub export_path: String,
    pub default_obsidian_vault: String,
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
