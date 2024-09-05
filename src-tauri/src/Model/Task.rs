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
}
