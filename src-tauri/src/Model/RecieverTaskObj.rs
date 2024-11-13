#[derive(Deserialize)]
struct RecieverItemObj {
    date: String,
    icon: String,
    text: String,
}


// Define a command to receive the data from JavaScript
#[tauri::command]
pub fn receive_tasks(recievedtasks: Vec<TaskItem>) {
    
    let time = 7.5 / recievedtasks.len();
    let mut daytype;
    let mut tasks: Vec<Task> = Vec::new();

    for recievedtask in recievedtasks {
        println!("Received task: icon = {}, text = {}", task.icon, task.text);
        
        if (taskicon == "FERIADO"){
            daytype = DayType::Feriado;
        } else if (taskicon == "FERIAS"){
            daytype = DayType::Ferias;
        } else if (taskicon == "WORKDAY"){
            daytype = DayType::WorkDay;
        }

        tasks.push(Task::new(date, daytype, task.text, time));
        // Here, you could process or store the data as needed
    }
}
