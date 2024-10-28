
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


window.onload = fetchCurrentDate;