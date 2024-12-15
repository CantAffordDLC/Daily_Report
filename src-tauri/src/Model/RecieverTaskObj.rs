use crate::Model::TaskHandler;
use chrono::NaiveDate;
use serde::Deserialize;

#[derive(Deserialize)]
struct RecieverItemObj {
    date: String,
    icon: String,
    text: String,
}

// Define a command to receive the data from JavaScript
#[tauri::command]
pub fn receive_tasks(recievedtasks: Vec<RecieverItemObj>) {
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

    // Export tasks to Excel
    TaskHandler::export_to_excel(tasks);
}
