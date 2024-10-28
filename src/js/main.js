const { invoke } = window.__TAURI__.tauri;

const DayType = {
  FERIAS: "Ferias",
  FERIADO: "Feriado",
  WORKDAY: "Work Day"
};

function addTask() {

  const taskInput = document.getElementById('taskInput');
  const taskList = document.getElementById('task-list');
  const icon = document.getElementById('submitIcon');
  const taskText = taskInput.value;

  icon.classList.add("bounce");
  
  icon.addEventListener('animationend', function() {
      icon.classList.remove("bounce");
  });

  if (taskText === "") {
    alert("Please enter a task");
    return;
  }

  submit.classList.add('fa-bounce')

  // Create a new task item
  const taskItem = document.createElement('div');
  taskItem.classList.add('task-item');

  // Create a paragraph element for the task text
  const taskDescription = document.createElement('p');
  taskDescription.textContent = taskText;

  // Create an icon for the completed task
  const statusIcon = document.createElement('span');
  statusIcon.classList.add('status-icon');
  statusIcon.innerHTML = '<i class="fa fa-times-circle"></i>';

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
  const dropdownList = $('.dropdown-menu');

  for (const type in DayType) {

    var iconClass = "";

    if (type === 'FERIAS') {
      iconClass = 'fas fa-umbrella-beach';
    } else if (type === 'FERIADO') {
      iconClass = 'fas fa-flag';
    } else if (type === 'WORKDAY') {
      iconClass = 'fas fa-briefcase';
    }

    const listItem = `<a class="dropdown-item">
                      <i class="${iconClass}"></i> ${type}
                      </a>`;

    dropdownList.append(listItem);
  }


  $('#dropdownOptions').on('click', '.dropdown-item', function(e) {
    e.preventDefault();
    
    // Get the clicked option (this) and retrieve the icon class and label text
    const selectedOption = $(this);
    const iconClass = selectedOption.find('i').attr('class');
  
    // Update the button content
    $('#dropdownMenuButton').html(`<i class="${iconClass}"></i>`);
  });

<<<<<<< Updated upstream
  $('#dropdownList li').click(function() {
    // Get the selected value and icon
    var selectedValue = $(this).data('value');
    var selectedIconClass = $(this).find('i').attr('class');
    var selectedText = $(this).text().trim();

    // Update the displayed selected option with the corresponding icon and text
    $('#currentIcon').attr('class', selectedIconClass);
    $('#selectedOption').html('<i id="currentIcon" class="' + selectedIconClass + '"></i> ' + selectedText);

    // Hide the dropdown after selection
    $('#dropdownList').hide();
  }); */

  // Hide the dropdown when clicking outside
/*   $(document).click(function(e) {
    if (!$(e.target).closest('.custom-dropdown').length) {
      $('#dropdownList').hide();
    }
  }); */

=======
});

$('.status-icon').click(function () {
  $(this).find('i').toggleClass('bi-check-circle-fill bi-circle');
  $(this).closest('.task-item').find('.task-text').toggleClass('completed');
>>>>>>> Stashed changes
});