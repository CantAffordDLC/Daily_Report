// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use chrono::Local;

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command

#[tauri::command]
 fn greet(name: &str) -> String {
     format!("Hello, {}! You've been greeted from Rust!", name)
}

// Command to get the current date
#[tauri::command]
fn get_current_date() -> String {
    // Get the current date in the format "YYYY-MM-DD"
    let now = Local::now();
    now.format("%Y-%m-%d").to_string()
}


fn main() {
    tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![greet, get_current_date]) // Register both commands
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
