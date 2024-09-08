const { invoke } = window.__TAURI__.tauri;

function addTask() {

  const taskInput = document.getElementById('taskInput');
  const taskList = document.getElementById('task-list');
  const taskText = taskInput.value;

  if (taskText === "") {
      alert("Please enter a task");
      return;
  }

  // Create a new task item
  const taskItem = document.createElement('div');
  taskItem.classList.add('task-item');

  // Create a paragraph element for the task text
  const taskDescription = document.createElement('p');
  taskDescription.textContent = taskText;

  // Create an icon for the completed task
  const statusIcon = document.createElement('span');
  statusIcon.classList.add('status-icon');
  statusIcon.innerHTML = '<i class="bi bi-x-circle-fill"></i>';

  // Add event listener to mark the task as completed
  statusIcon.addEventListener('click', function () {
    // Find the task item container and remove it
    const taskItem = this.closest('.task-item'); // Get the closest parent task-item element
    taskItem.remove(); // Remove the task item from the DOM
});

  // Append elements to taskItem
  taskItem.appendChild(taskDescription);
  taskItem.appendChild(statusIcon);

  // Add the task to the task list
  taskList.appendChild(taskItem);

  // Clear the input field
  taskInput.value = "";
}

$(document).ready(function () {
  $('#taskTable').on('click', '.delete-btn', function () {
    $(this).closest('tr').remove();
  });

  const dropdown = document.getElementById("DayTypeDropdown");

  for(const type in DayType){
    const option = document.createElement("option");
    option.value = DayType[type];
    option.text = type;
    dropdown.appendChild(option);
  }
});

$('.status-icon').click(function() {
  $(this).find('i').toggleClass('bi-check-circle-fill bi-circle');
  $(this).closest('.task-item').find('.task-text').toggleClass('completed');
});