
use calamine::{Excel, RangeDeserializerBuilder, open_workbook_auto, Writer, XlsxWriter};
use calamine::xls::Xlsx;
use std::fs::File;
use std::io::Write;

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
    fn new(day_type: DayType, description: String, time: u32) -> Task {
        Task {
            day_type,
            description,
            time,
        }
    }

    fn ExportToExcel(tasks: Vec<Task>){
        let path = format!("{}.xlsx", filename);
        let file = File::create(&path).expect("Unable to create file");

        let mut writer = XlsxWriter::new(file);

        // Create a sheet for the tasks
        let mut sheet = writer.create_sheet("Tasks");

        // Write headers for the columns
        sheet.write_row(vec!["Day Type", "Description", "Time (Minutes)"]).unwrap();

        // Write task data
        for task in tasks {
            let day_type = match task.day_type {
                DayType::Workday => "Workday",
                DayType::Weekend => "Weekend",
            };

            let row = vec![
                day_type.to_string(),
                task.description.clone(),
                task.time.to_string(),
            ];

            sheet.write_row(row).unwrap();
        }

        // Finalize and write the file
        writer.close().unwrap();

        println!("Tasks exported to {}", path);
    }
}



