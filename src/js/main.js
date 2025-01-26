const { invoke } = window.__TAURI__.tauri;

const DayType = {
  FERIAS: "Ferias",
  FERIADO: "Feriado",
  WORKDAY: "Work Day"
};

function addTask() {

  const taskInput = document.getElementById('taskInput');
  const taskList = document.getElementById('task-list');
  const icon = document.getElementById('iconContainer');
  const time = document.getElementById('selectedTime'); 
  const clockIcon = document.querySelector('.fa-clock');
  let className = $('#iconContainer').attr('class');
  const taskText = taskInput.value;

  if($(time).text() == "00H"){
    time.setAttribute("style", "border-color: red;");
    clockIcon.setAttribute("style", "color: red;");
    alert("please select a time");
    return;
  }else{
    time.setAttribute("style", "border-color: #000000;");
    clockIcon.setAttribute("style", "color: #000000;");
  }
/*
  icon.classList.add("bounce");
  
  icon.addEventListener('animationend', function() {
      icon.classList.remove("bounce");
  });
  submit.classList.add('fa-bounce')
  */

  if (taskText === "") {
    alert("Please enter a task");
    return;
  }

  // Create a new task item
  const taskItem = document.createElement('div');
  taskItem.classList.add('task-item');


  const itemIcon = document.createElement('span');
  itemIcon.className ='icon-item';
  itemIcon.innerHTML = '<i class="'+ className +'"></i>';

  //create time element
  const taskTime = document.createElement('p');
  taskTime.classList.add('task-time');
  taskTime.textContent = $(time).text(); 

  itemIcon.appendChild(taskTime);

  // Create a paragraph element for the task text
  const taskDescription = document.createElement('p');
  taskDescription.classList.add('task-description');
  taskDescription.textContent = taskText;


  // Icon to remove taskItem
  const statusIcon = document.createElement('span');
  statusIcon.classList.add('status-icon');
  statusIcon.innerHTML = '<i class="fa fa-times-circle"></i>';

  // Add event listener to mark the task as completed
  statusIcon.addEventListener('click', function () {
    // Find the task item container and remove it
    const taskItem = this.closest('.task-item'); // Get the closest parent task-item element
    taskItem.remove(); // Remove the task item from the DOM
  });

  const leftContainer = document.createElement('div');
  leftContainer.classList.add('task-left');
  leftContainer.appendChild(itemIcon);
  leftContainer.appendChild(taskTime);

  // Append elements to taskItem
  taskItem.appendChild(leftContainer);
  taskItem.appendChild(taskDescription);
  taskItem.appendChild(statusIcon);
  taskItem.classList.add('fade-in');

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
  const dropdownList = $('#dropdownOptions');

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
    $('#dropdownMenuButton').html(`<i id="iconContainer" class="${iconClass}"></i>`);
  });
/*
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

});

$('.status-icon').click(function () {
  $(this).find('i').toggleClass('bi-check-circle-fill bi-circle');
  $(this).closest('.task-item').find('.task-text').toggleClass('completed');
});

$('#extractButton').click(function(){
  // Create an array to store the objects
  const taskArray = [];
  let type; 

  // Loop through each element with the class 'task-item'
  $('.task-item').each(function() {
      // Find the <i> inside the <span> within the task-item
      const icon = $(this).find('span i').attr('class');
      
      const time = parseInt($(this).find('.task-time').text().replace('H', ''));

      // Find the <p> outside the <span> within the task-item
      const text = $(this).find('.task-description').text();

      if (icon === 'fas fa-umbrella-beach') {
        type = 'FERIAS';
      } else if (icon === 'fas fa-flag') {
        type === 'FERIADO';
      } else if (icon === 'fas fa-briefcase') {
        type = 'WORKDAY';
      }

      let dateoftheday = $('#dateDisplay').text();

      // Add an object with the icon and paragraph content to the array
      taskArray.push({
          date: dateoftheday || null,
          icon: type || null,  // Gets the HTML inside the <i> or null if empty
          text: text || null,   // Gets the text inside the <p> or null if empty
          time: time || null   // Gets the text inside the <p> or null if empty
      });
  });

  try {
    invoke('receive_tasks', { recievedtasks: taskArray });
    console.log('Tasks sent to backend successfully');
  } catch (error) {
    console.error('Error sending tasks to backend:', error);
  }
})