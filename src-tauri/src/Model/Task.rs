use std::fs::{File, OpenOptions};
use tauri::api::path::app_data_dir;
use std::path::Path;
use xlsxwriter::Workbook;
use umya_spreadsheet::{Spreadsheet, Worksheet, Cell, Row, Style, Color, Fill, PatternFill, writer::xlsx};


// Enum for DayType
enum DayType {
    Ferias,
    Feriado,
    WorkDay,
}

// Struct for Task
struct Task {
    day_type: DayType,
    description: String,
    time: u32,
}


impl Task {
    // Constructor method for Task
    fn new(day_type: DayType, description: String, time: u32, date: Datetime) -> Task {
        Task {
            day_type,
            description,
            time,
            date
        }
    }

    
    pub fn export_to_excel(tasks: Vec<Task>) {
        let app_data_dir = app_data_dir().unwrap().join("daily_report");
    
        // Resolve CSV file path
        std::fs::create_dir_all(app_data_dir.join("data")).expect("Failed to create data directory");
        let path = app_data_dir.join("data").join("teste.xlsx");
        let file_exists = Path::new(&path).exists();
        
        // Create or load the workbook
        let mut workbook = if file_exists {
            let mut workbook = umya_spreadsheet::reader::xlsx::read(&path).expect("Unable to read existing file");
            
            // Ensure the "Tasks" sheet exists, or add it
            if workbook.get_sheet_by_name("Tasks").is_none() {
                workbook.new_sheet("Tasks");
                let sheet = workbook.get_sheet_by_name_mut("Tasks").unwrap();
                let header = Row::from(vec![
                    Cell::from("Date"),
                    Cell::from("Day Type"),
                    Cell::from("Description"),
                    Cell::from("Time (Minutes)"),
                ]);
                sheet.append_row(header);
            }
            
            workbook
        } else {
            let mut workbook = Spreadsheet::new();
            workbook.new_sheet("Tasks");
            let sheet = workbook.get_sheet_by_name_mut("Tasks").unwrap();
            
            // Write headers for a new file
            let header = Row::from(vec![
                Cell::from("Date"),
                Cell::from("Day Type"),
                Cell::from("Description"),
                Cell::from("Time (Minutes)"),
            ]);
            sheet.append_row(header);
            
            workbook
        };
    
        // Get or create the "Tasks" sheet
        let sheet = workbook.get_sheet_by_name_mut("Tasks").unwrap();
    
        // Calculate supposed time if any task time is missing
        let supposed_time = 7.5 / (tasks.len() as f64 + 1.0);
    
        // cores
        let green_fill = Fill::PatternFill(PatternFill::Solid, Color::RGB(0, 255, 0), None);
        let gray_fill = Fill::PatternFill(PatternFill::Solid, Color::RGB(192, 192, 192), None);
    
        let green_style = Style::default().with_fill(green_fill);
        let gray_style = Style::default().with_fill(gray_fill);
    
        // Add each task as a new row with conditional formatting
        for task in tasks {
            let day_type = match task.day_type {
                DayType::Workday => "WORKDAY",
                DayType::Feriado => "FERIADO",
                DayType::Ferias => "FERIAS",
            };
    
            let time = task.time.unwrap_or(supposed_time);

            // Create a row with task data
            let mut row = Row::from(vec![
                Cell::from(task.date.to_string()),
                Cell::from(day_type),
                Cell::from(task.description.clone()),
                Cell::from(time.to_string()),
            ]);
            
            // Apply conditional color formatting based on `day_type`
            let style = match task.day_type {
                DayType::Feriado => Some(&gray_style),   // Gray for Feriado
                DayType::Ferias => Some(&green_style),   // Green for Ferias
                _ => None,                               // No style for Workday
            };
            
            // Set the style on each cell in the row if it matches `Feriado` or `Ferias`
            if let Some(style) = style {
                for cell in row.get_cells_mut() {
                    cell.set_style(style.clone());
                }
            }
    
            // Append the styled row to the sheet
            sheet.append_row(row);
        }
    
        // Save the workbook
        xlsx::write(&workbook, &path).expect("Unable to save the Excel file");
        println!("Tasks exported to {}", path);
    }
    
}



