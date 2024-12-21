use crate::Model::TaskHandler;
use chrono::NaiveDate;
use serde::Deserialize;
use std::io::Result;
use std::fs;
use serde::{Serialize};

#[derive(Deserialize)]
pub struct RecieverItemObj {
    date: String,
    icon: String,
    text: String,
}

#[derive(Serialize, Deserialize)]
struct AppSettings {
    export_path: String,
}



// Function to load appsettings.json
fn load_settings() -> Result<AppSettings> {
    let settings_path = "src-tauri/appsettings.json"; // Adjust path if needed
    let settings_str = fs::read_to_string(settings_path)?;
    let settings: AppSettings = serde_json::from_str(&settings_str)?;
    Ok(settings)
}

// Function to update appsettings.json
fn update_settings(new_path: String) -> Result<()> {
    let settings_path = "src-tauri/appsettings.json";
    let settings = AppSettings {
        export_path: new_path,
    };
    let settings_str = serde_json::to_string_pretty(&settings)?;
    fs::write(settings_path, settings_str)?;
    Ok(())
}


// Define a command to receive the data from JavaScript
#[tauri::command]
pub fn receive_tasks(recievedtasks: Vec<RecieverItemObj>) {
    let path = load_settings();
    let time = 7.5 / recievedtasks.len() as f64; // Compute time
    let mut date = NaiveDate::from_ymd(1990, 01, 01);
    let mut tasks: Vec<TaskHandler::Task> = Vec::new();

    for recievedtask in recievedtasks {
        
        let parts: Vec<u32> = recievedtask.date
        .split('-')
        .map(|part| part.parse::<u32>().expect("Invalid date component"))
        .collect();

        if parts.len() == 3 {
            date = NaiveDate::from_ymd(parts[2] as i32, parts[1], parts[0]);
        }
       

        println!(
            "Received task: icon = {}, text = {}",
            recievedtask.icon, recievedtask.text
        );

        // Determine the day type
        let daytype = match recievedtask.icon.as_str() {
            "FERIADO" => TaskHandler::DayType::Feriado,
            "FERIAS" => TaskHandler::DayType::Ferias,
            "WORKDAY" => TaskHandler::DayType::WorkDay,
            _ => {
                eprintln!("Unknown task icon: {}", recievedtask.icon);
                continue; // Skip unknown task types
            }
        };

        // Create a task and add it to the list
        tasks.push(TaskHandler::Task::new(
            daytype,
            recievedtask.text,
            time,
            date
        ));
    }

    match path {
        Ok(settings) => {
             
            TaskHandler::export_to_csv(tasks, settings.export_path);
        }
        Err(err) => {
            eprintln!("Failed to path : {}", err);
        }
    }
    // Export tasks to Excel
}
