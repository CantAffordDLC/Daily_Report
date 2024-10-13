
const DayType = {
  FERIAS: "Ferias",
  FERIADO: "Feriado",
  WORKDAY: "Work Day"
};

// Function to get the current date from Rust
async function fetchCurrentDate() {
  try {
    // Invoke the Rust function "get_current_date"
    const currentDate = await invoke('get_current_date');
    console.log('Current Date:', currentDate);
    // Do something with the date, like displaying it on the frontend
    document.getElementById('dateDisplay').innerText = currentDate;
  } catch (error) {
    console.error('Error getting current date:', error);
  }
}


function updateIcon() {
  
  var selectedValue = $('#DayTypeDropdown').val();
  var iconContainer = $('#iconContainer');
  
  // Clear any existing icons
  iconContainer.empty();

  // Determine the icon based on the selected value
  var icon = $('<i>');

  if (selectedValue === 'FERIAS') {
      icon.addClass('fas fa-umbrella-beach'); // example for 'FERIAS'
  } else if (selectedValue === 'FERIADO') {
      icon.addClass('fas fa-flag'); // example for 'FERIADO'
  } else if (selectedValue === 'WORKDAY') {
      icon.addClass('fas fa-briefcase'); // example for 'WORKDAY'
  }

  // Append the icon to the container
  iconContainer.append(icon);
}



window.onload = fetchCurrentDate;