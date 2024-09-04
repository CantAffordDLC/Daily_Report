
const DayType = {
  FERIAS: "Ferias",
  FERIADO: "Feriado",
  WORKDAY: "Work Day"
};

function Task(Type, Description, Time) {
  this.type = Type;
  this.description = Description;
  this.time = Time;
}